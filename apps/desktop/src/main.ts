import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  net,
  protocol,
  shell,
  Tray,
} from 'electron'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '../../..')
const webDevServerUrl = process.env.ELECTRON_START_URL
const configuredApiBaseUrl = process.env.PATCHLANE_API_URL?.replace(/\/+$/, '')
const webDistDir = path.resolve(__dirname, '../../web/dist')
const webDistPath = path.join(webDistDir, 'index.html')
const webPublicDir = path.join(workspaceRoot, 'apps/web/public')
const preloadPath = path.join(__dirname, 'preload.js')

let apiBaseUrl = configuredApiBaseUrl
let apiProcess: ChildProcess | undefined
let isQuitting = false
let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined

protocol.registerSchemesAsPrivileged([
  {
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
    },
    scheme: 'patchlane',
  },
])

const sleep = (durationMs: number) =>
  new Promise((resolve) => setTimeout(resolve, durationMs))

const waitForUrl = async (
  url: string,
  options: { attempts?: number; intervalMs?: number; label?: string } = {},
) => {
  const attempts = options.attempts ?? 80
  const intervalMs = options.intervalMs ?? 250

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url)

      if (response.ok) {
        return
      }
    } catch {
      // Retry until the local service is ready.
    }

    await sleep(intervalMs)
  }

  throw new Error(`${options.label ?? url} did not become ready`)
}

const getDesktopDataDir = () => path.join(app.getPath('home'), '.patchlane')

const getAvailablePort = async () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer()

    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()

      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Could not allocate a local API port'))
        return
      }

      const { port } = address
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve(port)
      })
    })
  })

const resolveWebAssetPath = (requestUrl: string) => {
  const url = new URL(requestUrl)
  const pathname =
    url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)
  const filePath = path.normalize(path.join(webDistDir, pathname))

  if (
    filePath.startsWith(webDistDir) &&
    existsSync(filePath) &&
    statSync(filePath).isFile()
  ) {
    return filePath
  }

  return webDistPath
}

const registerWebProtocol = () => {
  protocol.handle('patchlane', (request) => {
    const filePath = resolveWebAssetPath(request.url)
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

const getPnpmCommand = () => (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')

const pipeApiLogs = (childProcess: ChildProcess) => {
  childProcess.stdout?.on('data', (chunk: Buffer) => {
    const output = chunk.toString().trimEnd()

    if (output) {
      console.log(`[patchlane-api] ${output}`)
    }
  })
  childProcess.stderr?.on('data', (chunk: Buffer) => {
    const output = chunk.toString().trimEnd()

    if (output) {
      console.error(`[patchlane-api] ${output}`)
    }
  })
}

const startManagedApi = async () => {
  if (apiBaseUrl) {
    process.env.PATCHLANE_API_URL = apiBaseUrl
    await waitForUrl(`${apiBaseUrl}/health`, {
      attempts: 40,
      label: 'Configured Patchlane API',
    })
    return apiBaseUrl
  }

  const port = await getAvailablePort()
  const dataDir = getDesktopDataDir()
  const baseUrl = `http://127.0.0.1:${port}`

  mkdirSync(dataDir, { recursive: true })

  apiProcess = spawn(getPnpmCommand(), ['--filter', '@patchlane/api', 'start'], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PATCHLANE_DATA_DIR: dataDir,
      PATCHLANE_DESKTOP: '1',
      PORT: String(port),
      WEB_ORIGIN: '*',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  pipeApiLogs(apiProcess)

  apiProcess.once('exit', (code, signal) => {
    apiProcess = undefined

    if (!isQuitting) {
      console.error(
        `[patchlane-api] exited unexpectedly with code ${code ?? 'null'} signal ${
          signal ?? 'null'
        }`,
      )
    }
  })

  await waitForUrl(`${baseUrl}/health`, {
    attempts: 120,
    label: 'Managed Patchlane API',
  })

  apiBaseUrl = baseUrl
  process.env.PATCHLANE_API_URL = baseUrl
  process.env.PATCHLANE_DATA_DIR = dataDir

  return baseUrl
}

const stopManagedApi = async () => {
  const childProcess = apiProcess

  if (!childProcess) {
    return
  }

  apiProcess = undefined

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      childProcess.kill('SIGKILL')
      resolve()
    }, 2_000)

    childProcess.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
    childProcess.kill()
  })
}

const restartManagedApi = async () => {
  if (configuredApiBaseUrl) {
    await waitForUrl(`${configuredApiBaseUrl}/health`, {
      attempts: 20,
      label: 'Configured Patchlane API',
    })
    return
  }

  await stopManagedApi()
  apiBaseUrl = undefined
  delete process.env.PATCHLANE_API_URL
  await startManagedApi()
  mainWindow?.webContents.reload()
}

const getTrayIcon = () => {
  const iconPath = path.join(webPublicDir, 'favicon.svg')

  if (existsSync(iconPath)) {
    const iconSvg = readFileSync(iconPath, 'utf8')
    return nativeImage
      .createFromDataURL(
        `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString('base64')}`,
      )
      .resize({ height: 18, width: 18 })
  }

  return nativeImage.createEmpty()
}

const showMainWindow = () => {
  if (!mainWindow) {
    void createWindow()
    return
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.show()
  mainWindow.focus()
}

const updateTrayMenu = () => {
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      {
        click: showMainWindow,
        label: 'Show Patchlane',
      },
      {
        enabled: false,
        label: apiBaseUrl ? `API ${apiBaseUrl}` : 'API starting',
      },
      {
        click: () => {
          void restartManagedApi().then(updateTrayMenu)
        },
        enabled: !configuredApiBaseUrl,
        label: 'Restart API',
      },
      {
        click: () => {
          void shell.openPath(getDesktopDataDir())
        },
        label: 'Open data folder',
      },
      { type: 'separator' },
      {
        click: () => {
          isQuitting = true
          void stopManagedApi().finally(() => app.quit())
        },
        label: 'Quit Patchlane',
      },
    ]),
  )
}

const createTray = () => {
  if (tray) {
    updateTrayMenu()
    return
  }

  tray = new Tray(getTrayIcon())
  tray.setToolTip('Patchlane')
  tray.on('click', showMainWindow)
  updateTrayMenu()
}

const createWindow = async () => {
  await startManagedApi()
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
      preload: preloadPath,
      sandbox: false,
    },
    width: 1440,
  })

  mainWindow = window

  window.once('ready-to-show', () => {
    window.show()
  })

  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      window.hide()
    }
  })

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = undefined
    }
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (webDevServerUrl) {
    await waitForUrl(webDevServerUrl, { label: 'Patchlane web dev server' })
    await window.loadURL(webDevServerUrl)
  } else {
    await window.loadURL('patchlane://app/')
  }
}

app.whenReady().then(() => {
  registerWebProtocol()
  createTray()
  void createWindow()

  app.on('activate', showMainWindow)
})

app.on('before-quit', () => {
  isQuitting = true
  void stopManagedApi()
})

app.on('window-all-closed', () => {
  if (isQuitting) {
    app.quit()
  }
})
