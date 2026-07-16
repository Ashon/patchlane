import { Router, type Response } from 'express'
import { supervisorChatRequestSchema } from '@patchlane/shared'
import type { LlmEndpointStore } from '../llm/endpointStore'
import { runSupervisorChat } from '../supervisor/supervisorRuntime'
import { badRequest } from '../http/errors'

type SupervisorRouterOptions = {
  endpointStore: LlmEndpointStore
}

export const createSupervisorRouter = ({
  endpointStore,
}: SupervisorRouterOptions) => {
  const router = Router()

  router.post('/chat/stream', async (request, response, next) => {
    let streaming = false
    const controller = new AbortController()
    request.on('close', () => controller.abort())

    try {
      const parsed = supervisorChatRequestSchema.parse(request.body)
      const endpoint = parsed.endpointId
        ? await endpointStore.get(parsed.endpointId)
        : await endpointStore.getDefault()

      if (!endpoint.enabled) {
        throw badRequest(`Agent runtime '${endpoint.id}' is disabled`)
      }

      if (endpoint.runtimeType !== 'openai_compatible') {
        throw badRequest(
          `Agent runtime '${endpoint.id}' does not support tool orchestration`,
        )
      }

      response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      response.setHeader('Cache-Control', 'no-cache, no-transform')
      response.setHeader('Connection', 'keep-alive')
      response.setHeader('X-Accel-Buffering', 'no')
      response.flushHeaders()
      streaming = true

      const baseUrl = `${request.protocol}://${request.get('host')}`

      sendSse(response, {
        type: 'meta',
        endpointId: endpoint.id,
        model: parsed.model || endpoint.defaultModel,
      })

      await runSupervisorChat({
        endpoint,
        request: parsed,
        baseUrl,
        signal: controller.signal,
        onEvent: (event) => {
          if (!response.writableEnded) {
            sendSse(response, event)
          }
        },
      })

      if (!response.writableEnded) {
        sendSse(response, { type: 'done' })
        response.end()
      }
    } catch (error) {
      if (streaming) {
        if (!response.writableEnded) {
          sendSse(response, { type: 'error', error: getErrorMessage(error) })
          response.end()
        }
        return
      }

      next(error)
    }
  })

  return router
}

const sendSse = (response: Response, payload: unknown) => {
  response.write(`data: ${JSON.stringify(payload)}\n\n`)
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown supervisor error'
