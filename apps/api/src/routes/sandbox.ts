import { Router } from 'express'
import {
  createSandboxWorkspaceSchema,
  sandboxExecRequestSchema,
  type SandboxSettings,
} from '@agent-fleet/shared'
import { asyncHandler } from '../http/asyncHandler'
import { badRequest } from '../http/errors'
import { executeSandboxCommand } from '../sandbox/sandboxExecutor'
import { cloneRepositoryIntoSandbox } from '../sandbox/gitSandbox'
import type { SandboxWorkspaceStore } from '../sandbox/sandboxWorkspaceStore'
import type { ToolSettingsStore } from '../tools/toolSettingsStore'

type SandboxRouterOptions = {
  settings: SandboxSettings
  workspaceStore: SandboxWorkspaceStore
  toolSettingsStore: ToolSettingsStore
}

export const createSandboxRouter = ({
  settings,
  workspaceStore,
  toolSettingsStore,
}: SandboxRouterOptions) => {
  const router = Router()

  router.get('/settings', (_request, response) => {
    response.json({ settings })
  })

  router.get(
    '/workspaces',
    asyncHandler(async (_request, response) => {
      response.json({ workspaces: await workspaceStore.list() })
    }),
  )

  router.post(
    '/workspaces',
    asyncHandler(async (request, response) => {
      const input = createSandboxWorkspaceSchema.parse(request.body)
      const workspace = await workspaceStore.create(input)

      if (input.repositoryUrl) {
        try {
          const toolSettings = await toolSettingsStore.get()
          await cloneRepositoryIntoSandbox({
            repositoryUrl: input.repositoryUrl,
            ref: input.ref,
            settings,
            target: workspace,
            githubToken: toolSettings.github.enabled
              ? toolSettings.github.token
              : undefined,
          })
        } catch (error) {
          const message = getErrorMessage(error)
          await workspaceStore.markError(workspace.id, message)
          throw badRequest(message)
        }
      }

      response
        .status(201)
        .json({ workspace: await workspaceStore.get(workspace.id) })
    }),
  )

  router.post(
    '/workspaces/:id/exec',
    asyncHandler(async (request, response) => {
      const workspace = await workspaceStore.get(
        getRouteParam(request.params.id, 'id'),
      )
      const input = sandboxExecRequestSchema.parse(request.body)
      const result = await executeSandboxCommand(settings, workspace, input)

      response.json({ result })
    }),
  )

  router.delete(
    '/workspaces/:id',
    asyncHandler(async (request, response) => {
      await workspaceStore.remove(getRouteParam(request.params.id, 'id'))
      response.status(204).send()
    }),
  )

  return router
}

const getRouteParam = (value: string | string[] | undefined, name: string) => {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  throw badRequest(`Route parameter '${name}' is required`)
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown sandbox error'
}
