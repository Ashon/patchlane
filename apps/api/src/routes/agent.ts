import { Router, type Response } from 'express'
import {
  appendAgentRunMessageSchema,
  continueAgentRunSchema,
  createAgentRunSchema,
  rewindAgentRunSchema,
} from '@agent-fleet/shared'
import { AgentRuntime } from '../agent/agentRuntime'
import type { AgentRunStore } from '../agent/agentRunStore'
import { asyncHandler } from '../http/asyncHandler'
import { badRequest } from '../http/errors'
import { reconcileIssueAfterAgentRun } from '../issues/issueReconciliation'
import type { IssueStore } from '../issues/issueStore'
import type { LlmEndpointStore } from '../llm/endpointStore'
import { removeWorktreeFromCache } from '../sandbox/gitSandbox'
import type { SandboxWorkspaceStore } from '../sandbox/sandboxWorkspaceStore'
import type { SandboxSettings } from '@agent-fleet/shared'
import type { ToolSettingsStore } from '../tools/toolSettingsStore'

type AgentRouterOptions = {
  runStore: AgentRunStore
  endpointStore: LlmEndpointStore
  issueStore: IssueStore
  workspaceStore: SandboxWorkspaceStore
  toolSettingsStore: ToolSettingsStore
  sandboxSettings: SandboxSettings
  contextTokenBudget: number
  durabilityMaxRetries: number
  outputTokenBudget: number
}

export const createAgentRouter = ({
  contextTokenBudget,
  durabilityMaxRetries,
  endpointStore,
  issueStore,
  runStore,
  sandboxSettings,
  outputTokenBudget,
  toolSettingsStore,
  workspaceStore,
}: AgentRouterOptions) => {
  const runtime = new AgentRuntime({
    runStore,
    settings: sandboxSettings,
    contextTokenBudget,
    durabilityMaxRetries,
    outputTokenBudget,
    getEndpoint: async (id) =>
      id ? endpointStore.get(id) : endpointStore.getDefault(),
    getWorkspace: (id) => workspaceStore.get(id),
    getGitHubToken: async () => {
      const settings = await toolSettingsStore.get()
      return settings.github.enabled ? settings.github.token : undefined
    },
    onRunFinished: async (run) => {
      await reconcileIssueAfterAgentRun({ issueStore, runStore }, run)
    },
  })

  const router = Router()

  router.get(
    '/runs',
    asyncHandler(async (_request, response) => {
      response.json({ runs: await runStore.list() })
    }),
  )

  router.get(
    '/runs/:id',
    asyncHandler(async (request, response) => {
      response.json({
        run: await runStore.get(getRouteParam(request.params.id, 'id')),
      })
    }),
  )

  router.delete(
    '/runs/:id',
    asyncHandler(async (request, response) => {
      const id = getRouteParam(request.params.id, 'id')
      const run = await runStore.get(id)

      await issueStore.unlinkAgentRunReferences(run)
      await runStore.remove(id)

      if (request.query.cleanupWorkspace === 'true') {
        const workspace = await workspaceStore
          .get(run.workspaceId)
          .catch(() => undefined)

        if (workspace?.kind === 'task_worktree') {
          const cache = workspace.parentWorkspaceId
            ? await workspaceStore
                .get(workspace.parentWorkspaceId)
                .catch(() => undefined)
            : undefined

          if (cache) {
            const settings = await toolSettingsStore.get()
            await removeWorktreeFromCache({
              cache,
              target: workspace,
              settings: sandboxSettings,
              githubToken: settings.github.enabled
                ? settings.github.token
                : undefined,
            })
          }

          await workspaceStore.remove(workspace.id)
        }
      }

      response.status(204).send()
    }),
  )

  router.post(
    '/runs',
    asyncHandler(async (request, response) => {
      const input = createAgentRunSchema.parse(request.body)
      await workspaceStore.get(input.workspaceId)

      const run = await runStore.create(input)

      response.status(201).json({ run })
    }),
  )

  router.post(
    '/runs/:id/messages',
    asyncHandler(async (request, response) => {
      const input = appendAgentRunMessageSchema.parse(request.body)
      const run = await runStore.appendMessage(
        getRouteParam(request.params.id, 'id'),
        {
          role: 'user',
          content: input.content,
        },
      )

      response.json({ run })
    }),
  )

  router.post(
    '/runs/:id/rewind',
    asyncHandler(async (request, response) => {
      const input = rewindAgentRunSchema.parse(request.body)
      const run = await runStore.rewind(
        getRouteParam(request.params.id, 'id'),
        input.messageId,
      )

      response.json({ run })
    }),
  )

  router.post(
    '/runs/:id/continue',
    asyncHandler(async (request, response) => {
      const input = continueAgentRunSchema.parse(request.body)
      const run = await runtime.continue(
        getRouteParam(request.params.id, 'id'),
        input.endpointId,
        input.model,
      )

      response.json({ run })
    }),
  )

  router.post('/runs/:id/continue/stream', async (request, response, next) => {
    let streaming = false

    try {
      const input = continueAgentRunSchema.parse(request.body)
      const id = getRouteParam(request.params.id, 'id')

      response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      response.setHeader('Cache-Control', 'no-cache, no-transform')
      response.setHeader('Connection', 'keep-alive')
      response.setHeader('X-Accel-Buffering', 'no')
      response.flushHeaders()
      streaming = true

      await runtime.continueStream(
        id,
        input.endpointId,
        input.model,
        (event) => {
          if (!response.destroyed && !response.writableEnded) {
            sendSse(response, event)
          }
        },
      )

      if (!response.destroyed && !response.writableEnded) {
        response.end()
      }
    } catch (error) {
      if (streaming) {
        sendSse(response, {
          type: 'error',
          error: getErrorMessage(error),
        })
        response.end()
        return
      }

      next(error)
    }
  })

  return router
}

const getRouteParam = (value: string | string[] | undefined, name: string) => {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  throw badRequest(`Route parameter '${name}' is required`)
}

const sendSse = (response: Response, payload: unknown) => {
  response.write(`data: ${JSON.stringify(payload)}\n\n`)
  const flush = (response as Response & { flush?: () => void }).flush

  if (flush) {
    flush.call(response)
  }
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown agent streaming error'
}
