import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)
const appPath =
  process.argv[2] ||
  path.join(root, `release/mac-${process.arch}/Patchlane.app`)
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'patchlane-desktop-test-'))
const dataDir = path.join(tempDir, 'data')
const userDataDir = path.join(tempDir, 'profile')
await mkdir(userDataDir)
let child
let socket
let output = ''
let messageId = 0
const pending = new Map()
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const command = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++messageId
    const timeout = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`Timed out: ${method}`))
    }, 10_000)
    pending.set(id, { resolve, reject, timeout })
    socket.send(JSON.stringify({ id, method, params }))
  })

const evaluate = async (expression) => {
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails)
    throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}

const start = async () => {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  const env = {
    ...process.env,
    PATH: '/usr/bin:/bin',
    PATCHLANE_DATA_DIR: dataDir,
    PATCHLANE_USER_DATA_DIR: userDataDir,
  }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.PATCHLANE_API_URL
  child = spawn(
    path.join(appPath, 'Contents/MacOS/Patchlane'),
    [`--remote-debugging-port=${port}`],
    {
      cwd: tempDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  child.stdout.on('data', (data) => {
    output += data
  })
  child.stderr.on('data', (data) => {
    output += data
  })
  let page
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`App exited before startup:\n${output}`)
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(
        (response) => response.json(),
      )
      page = pages.find(
        (candidate) =>
          candidate.type === 'page' &&
          candidate.url.startsWith('patchlane://app'),
      )
      if (page) break
    } catch {
      /* Wait for the renderer. */
    }
    await delay(200)
  }
  assert.ok(page, `Renderer did not start:\n${output}`)
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await once(socket, 'open')
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const request = pending.get(message.id)
    if (!request) return
    clearTimeout(request.timeout)
    pending.delete(message.id)
    if (message.error) request.reject(new Error(JSON.stringify(message.error)))
    else request.resolve(message.result)
  })
  let text
  for (let attempt = 0; attempt < 50; attempt += 1) {
    text = await evaluate('document.body?.innerText ?? ""')
    if (text.includes('New workspace')) break
    await delay(200)
  }
  assert.ok(text.includes('New workspace'), `Workspace screen missing: ${text}`)
  assert.ok(
    !text.includes('Sign in with Google'),
    'Managed desktop must not require Google login',
  )
  const config = await evaluate('window.patchlaneDesktop')
  assert.equal(config.localApi, true)
  assert.equal(config.dataDir, dataDir)
  assert.match(config.apiBaseUrl, /^http:\/\/127\.0\.0\.1:\d+$/)
  return config
}

const stop = async () => {
  socket?.close()
  socket = undefined
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const exited = once(child, 'exit')
  const timeout = setTimeout(() => child.kill('SIGKILL'), 5_000)
  child.kill('SIGTERM')
  await exited
  clearTimeout(timeout)
}

// Exercise requests in the renderer so CORS, the preload bridge and custom scheme are covered.
const api = async (route, options = {}) => {
  const result = await evaluate(`(async () => {
    const response = await fetch(window.patchlaneDesktop.apiBaseUrl + ${JSON.stringify(route)}, ${JSON.stringify(options)});
    return { status: response.status, body: await response.json() };
  })()`)
  assert.ok(result.status < 400, JSON.stringify(result))
  return result.body
}

try {
  await start()
  assert.equal((await api('/health')).ok, true)
  const { workspace } = await api('/api/sandbox/workspaces', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Packaged app smoke test' }),
  })
  const { run } = await api('/api/agent/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      workspaceId: workspace.id,
      title: 'Persistence test',
      task: 'Do not execute; storage test only.',
    }),
  })
  assert.equal(run.status, 'idle')
  await readFile(path.join(dataDir, 'patchlane.sqlite'))
  const screenshot = await command('Page.captureScreenshot', { format: 'png' })
  await mkdir(path.join(root, 'release'), { recursive: true })
  await writeFile(
    path.join(root, 'release/desktop-smoke.png'),
    Buffer.from(screenshot.data, 'base64'),
  )
  await stop()
  await start()
  assert.ok(
    (await api('/api/sandbox/workspaces')).workspaces.some(
      (item) => item.id === workspace.id,
    ),
  )
  assert.equal(
    (await api(`/api/agent/runs/${run.id}`)).run.messages[0].content,
    'Do not execute; storage test only.',
  )
  console.log(
    'PASS: packaged renderer, preload, bundled API, SQLite, workspace/run creation, and persistence after restart.',
  )
} catch (error) {
  console.error(output)
  throw error
} finally {
  await stop()
  await rm(tempDir, { recursive: true, force: true })
}
