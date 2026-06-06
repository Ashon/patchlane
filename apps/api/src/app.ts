import type { Server } from 'node:http'
import cors from 'cors'
import express from 'express'
import { ZodError } from 'zod'
import { AgentRunStore } from './agent/agentRunStore'
import { env } from './config/env'
import { AppDatabase } from './db/database'
import { HttpError } from './http/errors'
import { IssueStore } from './issues/issueStore'
import { LlmEndpointStore } from './llm/endpointStore'
import { createAgentRouter } from './routes/agent'
import { createIssuesRouter } from './routes/issues'
import { createLlmRouter } from './routes/llm'
import { createSandboxRouter } from './routes/sandbox'
import { createToolsRouter } from './routes/tools'
import { SandboxWorkspaceStore } from './sandbox/sandboxWorkspaceStore'
import { ToolSettingsStore } from './tools/toolSettingsStore'

export type ApiEnvironment = typeof env

export const createApiApp = (config: ApiEnvironment = env) => {
  const app = express()
  const database = new AppDatabase(config.databaseFile)
  const llmStore = new LlmEndpointStore(
    database,
    config.defaultEndpoint,
    config.llmEndpointsFile,
  )
  const toolSettingsStore = new ToolSettingsStore(
    database,
    config.toolSettingsFile,
  )
  const sandboxWorkspaceStore = new SandboxWorkspaceStore(
    database,
    config.sandbox.rootDir,
    config.sandboxWorkspacesFile,
  )
  const agentRunStore = new AgentRunStore(database, config.agentRunsFile)
  const issueStore = new IssueStore(database)

  app.use(
    cors({
      origin:
        config.webOrigin === '*'
          ? true
          : config.webOrigin.split(',').map((origin) => origin.trim()),
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (_request, response) => {
    response.json({ ok: true })
  })

  app.use('/api/llm', createLlmRouter({ store: llmStore }))
  app.use('/api/tools', createToolsRouter({ store: toolSettingsStore }))
  app.use(
    '/api/issues',
    createIssuesRouter({
      endpointStore: llmStore,
      issueStore,
      runStore: agentRunStore,
      sandboxSettings: config.sandbox,
      toolSettingsStore,
      workspaceStore: sandboxWorkspaceStore,
    }),
  )
  app.use(
    '/api/agent',
    createAgentRouter({
      contextTokenBudget: config.agent.contextTokenBudget,
      durabilityMaxRetries: config.agent.durabilityMaxRetries,
      outputTokenBudget: config.agent.outputTokenBudget,
      endpointStore: llmStore,
      issueStore,
      runStore: agentRunStore,
      sandboxSettings: config.sandbox,
      toolSettingsStore,
      workspaceStore: sandboxWorkspaceStore,
    }),
  )
  app.use(
    '/api/sandbox',
    createSandboxRouter({
      settings: config.sandbox,
      toolSettingsStore,
      workspaceStore: sandboxWorkspaceStore,
    }),
  )

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof ZodError) {
        response.status(400).json({
          error: 'Validation failed',
          details: error.flatten(),
        })
        return
      }

      if (error instanceof HttpError) {
        response.status(error.status).json({
          error: error.message,
          details: error.details,
        })
        return
      }

      console.error(error)
      response.status(500).json({ error: 'Internal server error' })
    },
  )

  return {
    app,
    database,
  }
}

export type RunningApiServer = ReturnType<typeof createApiApp> & {
  close: () => Promise<void>
  server: Server
}

export const startApiServer = (
  config: ApiEnvironment = env,
): RunningApiServer => {
  const api = createApiApp(config)
  const server = api.app.listen(config.port, config.host, () => {
    const displayHost = config.host === '0.0.0.0' ? 'localhost' : config.host
    console.log(`API listening on http://${displayHost}:${config.port}`)
  })

  return {
    ...api,
    server,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        })
      })
      api.database.sqlite.close()
    },
  }
}
