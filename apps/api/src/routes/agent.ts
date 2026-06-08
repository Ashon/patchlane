import { Router, type Response } from 'express'
import {
  appendAgentRunMessageSchema,
  continueAgentRunSchema,
  createAgentRunSchema,
  rewindAgentRunSchema,
  type SandboxSettings,
} from '@patchlane/shared'
import { AgentRuntime } from '../agent/agentRuntime'
import type { AgentRunStore } from '../agent/agentRunStore'
import { OpenCodeRuntime } from '../agent/opencodeRuntime'
import { asyncHandler } from '../http/asyncHandler'
import { badRequest } from '../http/errors'
import { reconcileIssueAfterAgentRun } from '../issues/issueReconciliation'
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
  const patchlaneRuntime = new AgentRuntime({
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
    addIssueComment: (issueId, input) =>
      issueStore.addIssueComment(issueId, input),
    onRunFinished: async (run) => {
      await reconcileIssueAfterAgentRun({ issueStore, runStore }, run)
    },
  })
  const opencodeRuntime = new OpenCodeRuntime({
    runStore,
    getConnector: (id) => endpointStore.get(id),
    getWorkspace: (id) => workspaceStore.get(id),
    addIssueComment: (issueId, input) =>
      issueStore.addIssueComment(issueId, input),
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

      const title =
        input.title ??
        (input.agentRuntime === 'opencode'
          ? undefined
          : await generateAgentRunTitle({
              endpointId: input.endpointId,
              endpointStore,
              model: input.model,
              task: input.task,
            }))
      const run = await runStore.create({ ...input, title })

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
      const id = getRouteParam(request.params.id, 'id')
      const runtime = await getRuntimeForRun(id)
      const run = await runtime.continue(id, input.endpointId, input.model)

      response.json({ run })
    }),
  )

  router.post('/runs/:id/continue/stream', async (request, response, next) => {
    let streaming = false

    try {
      const input = continueAgentRunSchema.parse(request.body)
      const id = getRouteParam(request.params.id, 'id')
      const runtime = await getRuntimeForRun(id)

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

  async function getRuntimeForRun(id: string) {
    const run = await runStore.get(id)

    return run.agentRuntime === 'opencode' ? opencodeRuntime : patchlaneRuntime
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
