import { Router } from 'express'
import type { AgentRunStore } from '../agent/agentRunStore'
import { asyncHandler } from '../http/asyncHandler'
import { badRequest } from '../http/errors'

type ExecutionsRouterOptions = {
  runStore: AgentRunStore
}

export const createExecutionsRouter = ({
  runStore,
}: ExecutionsRouterOptions) => {
  const router = Router()

  router.get(
    '/',
    asyncHandler(async (request, response) => {
      response.json({
        executions: await runStore.listExecutions({
          issueId: getOptionalQueryString(request.query.issueId),
          projectId: getOptionalQueryString(request.query.projectId),
          subtaskId:
            getOptionalQueryString(request.query.taskId) ??
            getOptionalQueryString(request.query.subtaskId),
        }),
      })
    }),
  )

  router.get(
    '/:id',
    asyncHandler(async (request, response) => {
      response.json({
        execution: await runStore.get(getRouteParam(request.params.id, 'id')),
      })
    }),
  )

  router.get(
    '/:id/events',
    asyncHandler(async (request, response) => {
      response.json({
        events: await runStore.listEvents(
          getRouteParam(request.params.id, 'id'),
        ),
      })
    }),
  )

  return router
}

const getOptionalQueryString = (value: unknown) => {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

const getRouteParam = (value: string | string[] | undefined, name: string) => {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  throw badRequest(`Route parameter '${name}' is required`)
}
