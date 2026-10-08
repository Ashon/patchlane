import { execFileSync } from 'node:child_process'
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin')
  throw new Error('macOS packaging must run on a Mac.')
const desktopDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const root = path.resolve(desktopDir, '../..')
const require = createRequire(path.join(desktopDir, 'package.json'))
const electronExecutable = require('electron')
const electronApp = path.resolve(electronExecutable, '../../..')
const { version } = JSON.parse(
  await readFile(path.join(desktopDir, 'package.json'), 'utf8'),
)
const releaseDir = path.join(root, 'release')
const outputDir = path.join(releaseDir, `mac-${process.arch}`)
const appPath = path.join(outputDir, 'Patchlane.app')
const resourcesDir = path.join(appPath, 'Contents/Resources')
const appDir = path.join(resourcesDir, 'app')
const stem = `Patchlane-${version}-mac-${process.arch}`
const run = (command, args, options = {}) =>
  execFileSync(command, args, { stdio: 'inherit', ...options })
const setPlist = (file, key) => {
  // Remove first because some fields are absent in the prebuilt helper bundles.
  execFileSync('/usr/libexec/PlistBuddy', ['-c', `Delete :${key}`, file], {
    stdio: 'ignore',
  })
}
const updatePlist = (file, values) => {
  for (const [key, value] of Object.entries(values)) {
    try {
      setPlist(file, key)
    } catch {
      /* The field is optional. */
    }
    run('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, file])
  }
}

await rm(outputDir, { recursive: true, force: true })
await mkdir(outputDir, { recursive: true })
run('/usr/bin/ditto', [electronApp, appPath])
await rm(path.join(resourcesDir, 'default_app.asar'), { force: true })
await mkdir(appDir, { recursive: true })
await cp(path.join(desktopDir, 'dist'), path.join(appDir, 'dist'), {
  recursive: true,
})
await cp(path.join(root, 'apps/web/dist'), path.join(appDir, 'web'), {
  recursive: true,
})
await writeFile(
  path.join(appDir, 'package.json'),
  JSON.stringify(
    {
      name: 'patchlane',
      productName: 'Patchlane',
      version,
      type: 'module',
      main: 'dist/main.js',
    },
    null,
    2,
  ) + '\n',
)

const iconset = path.join(outputDir, 'Patchlane.iconset')
run('/usr/bin/swift', [
  '-module-cache-path',
  path.join(releaseDir, '.swift-cache'),
  path.join(desktopDir, 'scripts/icon.swift'),
  iconset,
])
run('/usr/bin/iconutil', [
  '-c',
  'icns',
  iconset,
  '-o',
  path.join(resourcesDir, 'patchlane.icns'),
])
await cp(
  path.join(iconset, 'icon_32x32.png'),
  path.join(appDir, 'dist/tray.png'),
)
await rm(iconset, { recursive: true, force: true })

const infoPlist = path.join(appPath, 'Contents/Info.plist')
updatePlist(infoPlist, {
  CFBundleDisplayName: 'Patchlane',
  CFBundleName: 'Patchlane',
  CFBundleIdentifier: 'app.patchlane.desktop',
  CFBundleExecutable: 'Patchlane',
  CFBundleIconFile: 'patchlane.icns',
  CFBundleVersion: version,
  CFBundleShortVersionString: version,
  LSApplicationCategoryType: 'public.app-category.developer-tools',
})
try {
  setPlist(infoPlist, 'ElectronAsarIntegrity')
} catch {
  /* Optional Electron metadata. */
}
await rename(
  path.join(appPath, 'Contents/MacOS/Electron'),
  path.join(appPath, 'Contents/MacOS/Patchlane'),
)

const frameworksDir = path.join(appPath, 'Contents/Frameworks')
for (const name of await readdir(frameworksDir)) {
  if (!name.startsWith('Electron Helper') || !name.endsWith('.app')) continue
  const oldName = name.slice(0, -4)
  const newName = oldName.replace('Electron', 'Patchlane')
  const helperDir = path.join(frameworksDir, name)
  const suffix = oldName
    .replace('Electron Helper', '')
    .replace(/[ ()]/g, '')
    .toLowerCase()
  updatePlist(path.join(helperDir, 'Contents/Info.plist'), {
    CFBundleDisplayName: newName,
    CFBundleName: newName,
    CFBundleExecutable: newName,
    CFBundleIdentifier: `app.patchlane.desktop.helper${suffix ? `.${suffix}` : ''}`,
  })
  await rename(
    path.join(helperDir, 'Contents/MacOS', oldName),
    path.join(helperDir, 'Contents/MacOS', newName),
  )
  await rename(helperDir, path.join(frameworksDir, `${newName}.app`))
}

// Ad-hoc signing makes this a local installable build. Public releases need Developer ID and notarization.
run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', appPath])
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath])
run('/usr/bin/ditto', [
  '-c',
  '-k',
  '--sequesterRsrc',
  '--keepParent',
  appPath,
  path.join(releaseDir, `${stem}.zip`),
])

const stagingDir = path.join(outputDir, 'dmg')
await mkdir(stagingDir, { recursive: true })
run('/usr/bin/ditto', [appPath, path.join(stagingDir, 'Patchlane.app')])
await symlink('/Applications', path.join(stagingDir, 'Applications'))
try {
  run('/usr/bin/hdiutil', [
    'create',
    '-volname',
    'Patchlane',
    '-srcfolder',
    stagingDir,
    '-ov',
    '-format',
    'UDZO',
    path.join(releaseDir, `${stem}.dmg`),
  ])
} finally {
  await rm(stagingDir, { recursive: true, force: true })
}
console.log(
  `\nInstallable app: ${appPath}\nInstallers: ${releaseDir}/${stem}.{dmg,zip}`,
)
