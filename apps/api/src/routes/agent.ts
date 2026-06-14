import { Router, type Response } from 'express'
import {
  appendAgentRunMessageSchema,
  continueAgentRunSchema,
  createAgentRunSchema,
  rewindAgentRunSchema,
  updateAgentRunRuntimeSchema,
  type AgentRuntime as AgentRuntimeName,
  type AgentRuntimeConnectorType,
  type SandboxSettings,
} from '@patchlane/shared'
import { AgentRuntime } from '../agent/agentRuntime'
import type { AgentRunStore } from '../agent/agentRunStore'
import { CodexRuntime } from '../agent/codexRuntime'
import { OpenCodeRuntime } from '../agent/opencodeRuntime'
import { agentRunCancellationMessage } from '../agent/runtimeCancellation'
import { asyncHandler } from '../http/asyncHandler'
import { badRequest } from '../http/errors'
import { reconcileIssueAfterAgentRun } from '../issues/issueReconciliation'
import { getRequestLogger } from '../logging/accessLog'
import { createChildLogger } from '../logging/logger'
import type { IssueStore } from '../issues/issueStore'
import type { LlmEndpointStore } from '../llm/endpointStore'
import { createChatCompletion } from '../llm/openaiClient'
import { removeWorktreeFromCache } from '../sandbox/gitSandbox'
import type { SandboxWorkspaceStore } from '../sandbox/sandboxWorkspaceStore'
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
  const agentLogger = createChildLogger({ component: 'agent' })
  const patchlaneRuntime = new AgentRuntime({
    runStore,
    settings: sandboxSettings,
    logger: agentLogger,
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
    addIssueComment: (issueId, input) =>
      issueStore.addIssueComment(issueId, input),
    onRunFinished: async (run) => {
      await reconcileIssueAfterAgentRun({ issueStore, runStore }, run)
    },
  })
  const opencodeRuntime = new OpenCodeRuntime({
    runStore,
    logger: agentLogger,
    getConnector: (id) => endpointStore.get(id),
    getWorkspace: (id) => workspaceStore.get(id),
    addIssueComment: (issueId, input) =>
      issueStore.addIssueComment(issueId, input),
    onRunFinished: async (run) => {
      await reconcileIssueAfterAgentRun({ issueStore, runStore }, run)
    },
  })
  const codexRuntime = new CodexRuntime({
    runStore,
    logger: agentLogger,
    getConnector: (id) => endpointStore.get(id),
    getWorkspace: (id) => workspaceStore.get(id),
    addIssueComment: (issueId, input) =>
      issueStore.addIssueComment(issueId, input),
    onRunFinished: async (run) => {
      await reconcileIssueAfterAgentRun({ issueStore, runStore }, run)
    },
  })
  const activeRunControllers = new Map<string, AbortController>()

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

  router.get(
    '/runs/:id/events',
    asyncHandler(async (request, response) => {
      response.json({
        events: await runStore.listEvents(
          getRouteParam(request.params.id, 'id'),
        ),
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

      const title =
        input.title ??
        (input.agentRuntime === 'opencode' || input.agentRuntime === 'codex'
          ? undefined
          : await generateAgentRunTitle({
              endpointId: input.endpointId,
              endpointStore,
              model: input.model,
              task: input.task,
            }))
      const run = await runStore.create({ ...input, title })
      getRequestLogger(response).info(
        {
          component: 'agent',
          event: 'agent.run.created',
          runId: run.id,
          agentRuntime: run.agentRuntime,
          runKind: run.kind,
          workspaceId: run.workspaceId,
          endpointId: run.endpointId,
          issueId: run.issueId,
          subtaskId: run.subtaskId,
        },
        'Agent run created',
      )

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
      getRequestLogger(response).info(
        {
          component: 'agent',
          event: 'agent.run.message_appended',
          runId: run.id,
          agentRuntime: run.agentRuntime,
          status: run.status,
        },
        'Agent run user message appended',
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
      getRequestLogger(response).info(
        {
          component: 'agent',
          event: 'agent.run.rewound',
          runId: run.id,
          agentRuntime: run.agentRuntime,
          status: run.status,
          messageId: input.messageId,
        },
        'Agent run rewound',
      )

      response.json({ run })
    }),
  )

  router.post(
    '/runs/:id/runtime',
    asyncHandler(async (request, response) => {
      const id = getRouteParam(request.params.id, 'id')
      const input = updateAgentRunRuntimeSchema.parse(request.body)
      const current = await runStore.get(id)

      if (current.status === 'running' || activeRunControllers.has(id)) {
        throw badRequest('Stop this run before changing its runtime')
      }

      if (current.status === 'completed' || current.status === 'cancelled') {
        throw badRequest(
          `Agent run '${id}' cannot change runtime from status ${current.status}`,
        )
      }

      await validateAgentRuntimeConnector(
        input.agentRuntime,
        input.endpointId,
        endpointStore,
      )
      const run = await runStore.updateRuntime(id, input)
      getRequestLogger(response).info(
        {
          component: 'agent',
          event: 'agent.run.runtime_updated',
          runId: run.id,
          agentRuntime: run.agentRuntime,
          endpointId: run.endpointId,
          model: run.model,
        },
        'Agent run runtime updated',
      )

      response.json({ run })
    }),
  )

  router.post(
    '/runs/:id/continue',
    asyncHandler(async (request, response) => {
      const input = continueAgentRunSchema.parse(request.body)
      const id = getRouteParam(request.params.id, 'id')
      const runtime = await getRuntimeForRun(id)
      const controller = beginActiveRun(id, activeRunControllers)
      getRequestLogger(response).info(
        {
          component: 'agent',
          event: 'agent.run.continue_requested',
          runId: id,
          endpointId: input.endpointId,
          model: input.model,
          streaming: false,
        },
        'Agent run continuation requested',
      )

      try {
        const run = await runtime.continue(
          id,
          input.endpointId,
          input.model,
          controller.signal,
        )

        response.json({ run })
      } finally {
        endActiveRun(id, controller, activeRunControllers)
      }
    }),
  )

  router.post(
    '/runs/:id/stop',
    asyncHandler(async (request, response) => {
      const id = getRouteParam(request.params.id, 'id')
      const current = await runStore.get(id)

      if (isTerminalRunStatus(current.status)) {
        response.json({ run: current })
        return
      }

      await runStore.requestCancellation(id)
      activeRunControllers.get(id)?.abort(agentRunCancellationMessage)
      const run = await runStore.cancel(id, agentRunCancellationMessage)
      await reconcileIssueAfterAgentRun({ issueStore, runStore }, run)
      getRequestLogger(response).warn(
        {
          component: 'agent',
          event: 'agent.run.stop_requested',
          runId: run.id,
          agentRuntime: run.agentRuntime,
          status: run.status,
        },
        'Agent run stop requested',
      )

      response.json({ run })
    }),
  )

  router.post('/runs/:id/continue/stream', async (request, response, next) => {
    let streaming = false
    let controller: AbortController | undefined
    let id: string | undefined

    try {
      const input = continueAgentRunSchema.parse(request.body)
      id = getRouteParam(request.params.id, 'id')
      const runtime = await getRuntimeForRun(id)
      controller = beginActiveRun(id, activeRunControllers)
      getRequestLogger(response).info(
        {
          component: 'agent',
          event: 'agent.run.continue_requested',
          runId: id,
          endpointId: input.endpointId,
          model: input.model,
          streaming: true,
        },
        'Agent run stream continuation requested',
      )

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
        controller.signal,
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
    } finally {
      if (id && controller) {
        endActiveRun(id, controller, activeRunControllers)
      }
    }
  })

  async function getRuntimeForRun(id: string) {
    const run = await runStore.get(id)

    if (run.agentRuntime === 'opencode') {
      return opencodeRuntime
    }

    if (run.agentRuntime === 'codex') {
      return codexRuntime
    }

    return patchlaneRuntime
  }

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

const beginActiveRun = (
  id: string,
  controllers: Map<string, AbortController>,
) => {
  const existing = controllers.get(id)

  if (existing && !existing.signal.aborted) {
    throw badRequest('This agent run is already running')
  }

  const controller = new AbortController()
  controllers.set(id, controller)

  return controller
}

const endActiveRun = (
  id: string,
  controller: AbortController,
  controllers: Map<string, AbortController>,
) => {
  if (controllers.get(id) === controller) {
    controllers.delete(id)
  }
}

const isTerminalRunStatus = (status: string) => {
  return status === 'completed' || status === 'cancelled' || status === 'failed'
}

const validateAgentRuntimeConnector = async (
  agentRuntime: AgentRuntimeName,
  endpointId: string | undefined,
  endpointStore: LlmEndpointStore,
) => {
  if (!endpointId) {
    return
  }

  const endpoint = await endpointStore.get(endpointId)

  if (!isConnectorTypeForRuntime(agentRuntime, endpoint.runtimeType)) {
    throw badRequest(
      `Endpoint '${endpoint.id}' cannot be used with ${agentRuntime} runtime`,
    )
  }
}

const isConnectorTypeForRuntime = (
  agentRuntime: AgentRuntimeName,
  connectorType: AgentRuntimeConnectorType,
) => {
  if (agentRuntime === 'opencode') {
    return connectorType === 'opencode_cli'
  }

  if (agentRuntime === 'codex') {
    return connectorType === 'codex_cli'
  }

  return connectorType === 'openai_compatible'
}

const generateAgentRunTitle = async ({
  endpointId,
  endpointStore,
  model,
  task,
}: {
  endpointId?: string
  endpointStore: LlmEndpointStore
  model?: string
  task: string
}) => {
  const endpoint = await getTitleEndpoint(endpointStore, endpointId)

  if (!endpoint) {
    return undefined
  }

  try {
    const completion = await createChatCompletion(endpoint, {
      maxTokens: 32,
      messages: [
        {
          role: 'system',
          content: [
            'You write concise titles for coding agent runs.',
            'Return only one title, no markdown, no quotes, no trailing punctuation.',
            'Use the same language as the task when it is clear.',
            'Keep it under 60 characters and prefer 3 to 8 words.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: `Task:\n${task.slice(0, 4_000)}`,
        },
      ],
      model,
      temperature: 0.2,
    })

    return cleanGeneratedAgentRunTitle(completion.choices[0]?.message?.content)
  } catch {
    return undefined
  }
}

const getTitleEndpoint = async (
  endpointStore: LlmEndpointStore,
  endpointId?: string,
) => {
  try {
    const endpoint = endpointId
      ? await endpointStore.get(endpointId)
      : await endpointStore.getDefault()

    return endpoint.enabled ? endpoint : undefined
  } catch {
    return undefined
  }
}

const cleanGeneratedAgentRunTitle = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined
  }

  const content = value
    .replace(/<think>[\s\S]*?<\/think>/giu, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/giu, '')
    .trim()
  const title = content
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  if (!title) {
    return undefined
  }

  const cleaned = title
    .replace(/^[-*#\d.)\s]+/u, '')
    .replace(/^(title|제목)\s*[:：]\s*/iu, '')
    .replace(/^["'`“”‘’]+|["'`“”‘’.。]+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)

  return cleaned.length >= 2 ? cleaned : undefined
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown agent streaming error'
}
