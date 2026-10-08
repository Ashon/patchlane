import path from 'node:path'
import { startApiServer } from '../../api/src/app.js'
import { env } from '../../api/src/config/env.js'

const dataDir = process.env.PATCHLANE_DATA_DIR
if (!dataDir) {
  throw new Error('PATCHLANE_DATA_DIR is required for the desktop API')
}

const api = startApiServer({
  ...env,
  host: '127.0.0.1',
  port: 0,
  databaseFile: path.join(dataDir, 'patchlane.sqlite'),
  llmEndpointsFile: path.join(dataDir, 'llm-endpoints.json'),
  toolSettingsFile: path.join(dataDir, 'tool-settings.json'),
  agentRunsFile: path.join(dataDir, 'agent-runs.json'),
  sandboxWorkspacesFile: path.join(dataDir, 'sandbox-workspaces.json'),
  sandbox: { ...env.sandbox, rootDir: path.join(dataDir, 'sandboxes') },
  auth: { enabled: false },
  googleOAuth: {
    ...env.googleOAuth,
    clientId: undefined,
    clientSecret: undefined,
  },
})

api.server.once('listening', () => {
  const address = api.server.address()
  if (address && typeof address !== 'string') {
    process.parentPort.postMessage({ type: 'ready', port: address.port })
  }
})

process.once('SIGTERM', () => {
  void api.close().finally(() => process.exit(0))
})
