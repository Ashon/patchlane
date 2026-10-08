import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const desktopDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const distDir = path.join(desktopDir, 'dist')
await rm(distDir, { recursive: true, force: true })
await mkdir(distDir, { recursive: true })

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  logLevel: 'info',
}
await build({
  ...common,
  entryPoints: [path.join(desktopDir, 'src/main.ts')],
  outfile: path.join(distDir, 'main.js'),
  external: ['electron'],
  format: 'esm',
})
await build({
  ...common,
  entryPoints: [path.join(desktopDir, 'src/preload.ts')],
  outfile: path.join(distDir, 'preload.cjs'),
  external: ['electron'],
  format: 'cjs',
})
await build({
  ...common,
  entryPoints: [path.join(desktopDir, 'src/api-entry.ts')],
  outfile: path.join(distDir, 'api.cjs'),
  format: 'cjs',
  // Desktop uses JSON logging, so pino's optional pretty transport is unused.
  external: ['pino-pretty'],
})
await cp(
  path.join(desktopDir, '../web/public/favicon.svg'),
  path.join(distDir, 'favicon.svg'),
)
