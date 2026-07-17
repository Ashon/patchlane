import type { Server } from 'node:http'
import cors from 'cors'
import express from 'express'
import { ZodError } from 'zod'
import { AgentRunStore } from './agent/agentRunStore'
import { env } from './config/env'
import { AppDatabase } from './db/database'
import { HttpError } from './http/errors'
import {
  createAccessLogMiddleware,
  getRequestLogger,
} from './logging/accessLog'
import { logger } from './logging/logger'
import { LlmEndpointStore } from './llm/endpointStore'
import { createAgentRouter } from './routes/agent'
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

  app.use(
    cors({
      origin:
        config.webOrigin === '*'
          ? true
          : config.webOrigin.split(',').map((origin) => origin.trim()),
      credentials: true,
    }),
  )
  app.use(createAccessLogMiddleware(logger))
  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (_request, response) => {
    response.json({ ok: true })
  })

  app.use('/api/llm', createLlmRouter({ store: llmStore }))
  app.use('/api/tools', createToolsRouter({ store: toolSettingsStore }))
  app.use(
    '/api/agent',
    createAgentRouter({
      contextTokenBudget: config.agent.contextTokenBudget,
      durabilityMaxRetries: config.agent.durabilityMaxRetries,
      outputTokenBudget: config.agent.outputTokenBudget,
      endpointStore: llmStore,
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
      request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      const requestLogger = getRequestLogger(response)

      if (error instanceof ZodError) {
        requestLogger.warn(
          {
            component: 'http',
            event: 'http.request.validation_failed',
            method: request.method,
            path: request.originalUrl,
            issues: error.issues.map((issue) => ({
              code: issue.code,
              path: issue.path.join('.'),
              message: issue.message,
            })),
          },
          'Request validation failed',
        )
        response.status(400).json({
          error: 'Validation failed',
          details: error.flatten(),
        })
        return
      }

      if (error instanceof HttpError) {
        requestLogger.warn(
          {
            component: 'http',
            event: 'http.request.rejected',
            method: request.method,
            path: request.originalUrl,
            statusCode: error.status,
            details: error.details,
          },
          error.message,
        )
        response.status(error.status).json({
          error: error.message,
          details: error.details,
        })
        return
      }

      requestLogger.error(
        {
          component: 'http',
          event: 'http.request.failed',
          err: error,
          method: request.method,
          path: request.originalUrl,
        },
        'Unhandled API request error',
      )
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
    logger.info(
      {
        component: 'server',
        event: 'api.server.started',
        host: config.host,
        port: config.port,
        url: `http://${displayHost}:${config.port}`,
      },
      'API server started',
    )
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
