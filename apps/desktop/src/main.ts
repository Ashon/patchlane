import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  protocol,
  shell,
  Tray,
  utilityProcess,
  type UtilityProcess,
} from 'electron'

const distDir = path.dirname(fileURLToPath(import.meta.url))
const webDevServerUrl = app.isPackaged
  ? undefined
  : process.env.ELECTRON_START_URL
const configuredApiBaseUrl = process.env.PATCHLANE_API_URL?.replace(/\/+$/, '')
const webDistDir = app.isPackaged
  ? path.join(app.getAppPath(), 'web')
  : path.resolve(distDir, '../../web/dist')
const dataDir =
  process.env.PATCHLANE_DATA_DIR || path.join(app.getPath('home'), '.patchlane')

app.setName('Patchlane')
mkdirSync(dataDir, { recursive: true })
if (process.env.PATCHLANE_USER_DATA_DIR) {
  app.setPath('userData', process.env.PATCHLANE_USER_DATA_DIR)
}

let apiBaseUrl = configuredApiBaseUrl
let apiProcess: UtilityProcess | undefined
let apiStarting: Promise<string> | undefined
let isQuitting = false
let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'patchlane',
    privileges: { secure: true, standard: true, supportFetchAPI: true },
  },
])

const log = (message: string) => {
  console.log(message)
  appendFileSync(
    path.join(dataDir, 'desktop.log'),
    `${new Date().toISOString()} ${message}\n`,
  )
}

const getToolPath = () => {
  // Finder launches do not inherit the terminal's Homebrew/nvm/CLI PATH.
  try {
    const output = execFileSync(
      process.env.SHELL || '/bin/zsh',
      ['-ilc', 'printf "\\nPATCHLANE_PATH=%s\\n" "$PATH"'],
      {
        encoding: 'utf8',
        timeout: 5_000,
        maxBuffer: 1_048_576,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
    const value = output
      .split('\n')
      .reverse()
      .find((line) => line.startsWith('PATCHLANE_PATH='))
    if (value) return value.slice('PATCHLANE_PATH='.length)
  } catch {
    // CLI paths can also be configured explicitly in runtime settings.
  }
  return [
    process.env.PATH,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ]
    .filter(Boolean)
    .join(path.delimiter)
}

const waitForUrl = async (url: string) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
      if (response.ok) return
    } catch {
      // Retry while the local service is starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`${url} did not become ready`)
}

const startManagedApi = async (): Promise<string> => {
  if (apiBaseUrl) {
    await waitForUrl(`${apiBaseUrl}/health`)
    return apiBaseUrl
  }
  if (apiStarting) return apiStarting

  apiStarting = new Promise<string>((resolve, reject) => {
    const child = utilityProcess.fork(path.join(distDir, 'api.cjs'), [], {
      cwd: dataDir,
      env: {
        ...process.env,
        PATH: getToolPath(),
        PATCHLANE_DATA_DIR: dataDir,
        PATCHLANE_DESKTOP: '1',
        NODE_ENV: 'production',
        LOG_FORMAT: 'json',
        WEB_ORIGIN: webDevServerUrl || 'patchlane://app',
      },
      serviceName: 'Patchlane API',
      stdio: 'pipe',
    })
    apiProcess = child
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('The local API did not start within 30 seconds.'))
    }, 30_000)
    child.stdout?.on('data', (chunk: Buffer) =>
      log(`[api] ${chunk.toString().trimEnd()}`),
    )
    child.stderr?.on('data', (chunk: Buffer) =>
      log(`[api] ${chunk.toString().trimEnd()}`),
    )
    child.once('message', (message: { type?: string; port?: number }) => {
      if (message.type !== 'ready' || !message.port) {
        clearTimeout(timeout)
        child.kill()
        reject(new Error('The local API returned an invalid startup response.'))
        return
      }
      clearTimeout(timeout)
      apiBaseUrl = `http://127.0.0.1:${message.port}`
      log(`API ready at ${apiBaseUrl}`)
      resolve(apiBaseUrl)
    })
    child.once('exit', (code) => {
      clearTimeout(timeout)
      if (apiProcess === child) {
        apiProcess = undefined
        apiBaseUrl = undefined
      }
      reject(
        new Error(
          `The local API exited with code ${code}. See ${path.join(dataDir, 'desktop.log')}`,
        ),
      )
      if (!isQuitting) log(`API exited with code ${code}`)
    })
  }).finally(() => {
    apiStarting = undefined
  })
  return apiStarting
}

const stopManagedApi = async () => {
  const child = apiProcess
  if (!child) return
  apiProcess = undefined
  apiBaseUrl = configuredApiBaseUrl
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (child.pid) {
        try {
          process.kill(child.pid, 'SIGKILL')
        } catch {
          /* Already exited. */
        }
      }
      resolve()
    }, 3_000)
    child.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
    child.kill()
  })
}

const reportStartupError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  log(message)
  dialog.showErrorBox(
    'Patchlane could not start',
    `${message}\n\nLogs: ${path.join(dataDir, 'desktop.log')}`,
  )
  app.quit()
}

const restartManagedApi = async () => {
  await stopManagedApi()
  await startManagedApi()
  updateTrayMenu()
  mainWindow?.webContents.reload()
}

const showMainWindow = () => {
  if (!mainWindow) {
    void createWindow().catch(reportStartupError)
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

const updateTrayMenu = () => {
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Patchlane', click: showMainWindow },
      {
        label: apiBaseUrl ? `API ${apiBaseUrl}` : 'API starting',
        enabled: false,
      },
      {
        label: 'Restart API',
        enabled: !configuredApiBaseUrl,
        click: () => {
          void restartManagedApi().catch(reportStartupError)
        },
      },
      {
        label: 'Open data folder',
        click: () => {
          void shell.openPath(dataDir)
        },
      },
      { type: 'separator' },
      { label: 'Quit Patchlane', click: () => app.quit() },
    ]),
  )
}

const createTray = () => {
  const iconPath = path.join(distDir, 'tray.png')
  const icon = existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty()
  tray = new Tray(icon.resize({ width: 18, height: 18 }))
  tray.setToolTip('Patchlane')
  tray.on('click', showMainWindow)
  updateTrayMenu()
}

const registerWebProtocol = () => {
  protocol.handle('patchlane', (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'app')
      return new Response('Not found', { status: 404 })
    const pathname =
      url.pathname === '/'
        ? 'index.html'
        : decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const filePath = path.resolve(webDistDir, pathname)
    const relative = path.relative(webDistDir, filePath)
    if (
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      !existsSync(filePath) ||
      !statSync(filePath).isFile()
    ) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

ipcMain.on('patchlane:desktop-config', (event) => {
  event.returnValue =
    event.sender === mainWindow?.webContents
      ? {
          apiBaseUrl,
          dataDir,
          localApi: !configuredApiBaseUrl,
          platform: process.platform,
        }
      : null
})

const createWindow = async () => {
  await startManagedApi()
  if (mainWindow) {
    showMainWindow()
    return
  }
  updateTrayMenu()
  const window = new BrowserWindow({
    backgroundColor: '#0d0d0f',
    height: 900,
    minHeight: 640,
    minWidth: 960,
    show: false,
    title: 'Patchlane',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(distDir, 'preload.cjs'),
      sandbox: true,
    },
    width: 1440,
  })
  mainWindow = window
  window.once('ready-to-show', () => window.show())
  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      window.hide()
    }
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//u.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (webDevServerUrl) {
    await waitForUrl(webDevServerUrl)
    await window.loadURL(webDevServerUrl)
  } else {
    await window.loadURL('patchlane://app/')
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showMainWindow)
  app
    .whenReady()
    .then(async () => {
      registerWebProtocol()
      createTray()
      await createWindow()
      app.on('activate', showMainWindow)
    })
    .catch(reportStartupError)
}

app.on('before-quit', (event) => {
  if (isQuitting) return
  isQuitting = true
  if (apiProcess) {
    event.preventDefault()
    void stopManagedApi().finally(() => app.quit())
  }
})
app.on('window-all-closed', () => {
  if (isQuitting) app.quit()
})

process.once('SIGTERM', () => app.quit())
