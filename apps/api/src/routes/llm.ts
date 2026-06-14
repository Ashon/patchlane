import { Router, type Response } from 'express'
import { llmChatRequestSchema } from '@patchlane/shared'
import type { LlmEndpointStore } from '../llm/endpointStore'
import {
  createChatCompletion,
  createStreamingChatCompletion,
  testEndpointConnection,
} from '../llm/openaiClient'
import { testCodexRuntimeConnection } from '../agent/codexRuntime'
import { testOpenCodeRuntimeConnection } from '../agent/opencodeRuntime'
import { asyncHandler } from '../http/asyncHandler'
import { badRequest } from '../http/errors'

type LlmRouterOptions = {
  store: LlmEndpointStore
}

export const createLlmRouter = ({ store }: LlmRouterOptions) => {
  const router = Router()

  router.get(
    '/endpoints',
    asyncHandler(async (_request, response) => {
      response.json({ endpoints: await store.list() })
    }),
  )

  router.post(
    '/endpoints',
    asyncHandler(async (request, response) => {
      const endpoint = await store.create(request.body)
      response.status(201).json({ endpoint })
    }),
  )

  router.patch(
    '/endpoints/:id',
    asyncHandler(async (request, response) => {
      const endpoint = await store.update(
        getRouteParam(request.params.id, 'id'),
        request.body,
      )
      response.json({ endpoint })
    }),
  )

  router.delete(
    '/endpoints/:id',
    asyncHandler(async (request, response) => {
      await store.remove(getRouteParam(request.params.id, 'id'))
      response.status(204).send()
    }),
  )

  router.post(
    '/endpoints/:id/test',
    asyncHandler(async (request, response) => {
      const endpoint = await store.get(getRouteParam(request.params.id, 'id'))
      const result =
        endpoint.runtimeType === 'opencode_cli'
          ? await testOpenCodeRuntimeConnection(endpoint)
          : endpoint.runtimeType === 'codex_cli'
            ? await testCodexRuntimeConnection(endpoint)
            : await testEndpointConnection(endpoint)
      response.json({ result })
    }),
  )

  router.post(
    '/chat',
    asyncHandler(async (request, response) => {
      const parsed = llmChatRequestSchema.parse(request.body)
      const endpoint = parsed.endpointId
        ? await store.get(parsed.endpointId)
        : await store.getDefault()

      if (!endpoint.enabled) {
        throw badRequest(`Agent runtime '${endpoint.id}' is disabled`)
      }

      if (endpoint.runtimeType !== 'openai_compatible') {
        throw badRequest(
          `Agent runtime '${endpoint.id}' does not support chat completions`,
        )
      }

      const completion = await createChatCompletion(endpoint, parsed)

      response.json({
        endpointId: endpoint.id,
        model: completion.model,
        choices: completion.choices.map((choice) => ({
          index: choice.index,
          message: choice.message,
          finishReason: choice.finish_reason,
        })),
      })
    }),
  )

  router.post('/chat/stream', async (request, response, next) => {
    let streaming = false

    try {
      const parsed = llmChatRequestSchema.parse(request.body)
      const endpoint = parsed.endpointId
        ? await store.get(parsed.endpointId)
        : await store.getDefault()

      if (!endpoint.enabled) {
        throw badRequest(`Agent runtime '${endpoint.id}' is disabled`)
      }

      if (endpoint.runtimeType !== 'openai_compatible') {
        throw badRequest(
          `Agent runtime '${endpoint.id}' does not support chat completions`,
        )
      }

      response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      response.setHeader('Cache-Control', 'no-cache, no-transform')
      response.setHeader('Connection', 'keep-alive')
      response.setHeader('X-Accel-Buffering', 'no')
      response.flushHeaders()
      streaming = true

      sendSse(response, {
        type: 'meta',
        endpointId: endpoint.id,
        model: parsed.model || endpoint.defaultModel,
      })

      let closed = false
      request.on('close', () => {
        closed = true
      })

      const stream = await createStreamingChatCompletion(endpoint, parsed)

      for await (const chunk of stream) {
        if (closed) {
          break
        }

        const choice = chunk.choices[0]
        const delta = choice?.delta
        const content = typeof delta?.content === 'string' ? delta.content : ''
        const reasoning = getReasoningDelta(delta)

        if (content || reasoning) {
          sendSse(response, {
            type: 'delta',
            content,
            reasoning,
          })
        }

        if (choice?.finish_reason) {
          sendSse(response, {
            type: 'finish',
            finishReason: choice.finish_reason,
          })
        }
      }

      if (!closed) {
        sendSse(response, { type: 'done' })
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
}

const getReasoningDelta = (delta: unknown) => {
  if (!delta || typeof delta !== 'object') {
    return ''
  }

  const candidate = delta as {
    reasoning?: unknown
    reasoning_content?: unknown
    reasoningContent?: unknown
  }

  if (typeof candidate.reasoning === 'string') {
    return candidate.reasoning
  }

  if (typeof candidate.reasoning_content === 'string') {
    return candidate.reasoning_content
  }

  if (typeof candidate.reasoningContent === 'string') {
    return candidate.reasoningContent
  }

  return ''
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown streaming error'
}
