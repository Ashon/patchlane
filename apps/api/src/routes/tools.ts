import { Router } from 'express'
import { isAuthenticated } from '../auth/authMiddleware'
import type { ToolSettingsStore } from '../tools/toolSettingsStore'
import { asyncHandler } from '../http/asyncHandler'
import { badRequest } from '../http/errors'
import { testGitHubToken } from '../tools/githubClient'

type ToolsRouterOptions = {
  store: ToolSettingsStore
  requireAuth?: boolean
}

export const createToolsRouter = ({ store, requireAuth = false }: ToolsRouterOptions) => {
  const router = Router()
  const authMiddleware = requireAuth ? isAuthenticated : (_req: unknown, _res: unknown, next: () => void) => next()

  router.get(
    '/settings',
    authMiddleware,
    asyncHandler(async (_request, response) => {
      response.json({ settings: await store.getPublic() })
    }),
  )

  router.patch(
    '/settings/github',
    authMiddleware,
    asyncHandler(async (request, response) => {
      response.json({ settings: await store.updateGitHub(request.body) })
    }),
  )

  router.post(
    '/github/test',
    authMiddleware,
    asyncHandler(async (_request, response) => {
      const settings = await store.get()

      if (!settings.github.enabled) {
        throw badRequest('GitHub tool is disabled')
      }

      if (!settings.github.token) {
        throw badRequest('GitHub PAT is not configured')
      }

      const result = await testGitHubToken(settings.github.token)
      const publicSettings = result.ok
        ? await store.markGitHubValidated(
            result.username,
            result.scopes,
            result.checkedAt,
          )
        : await store.getPublic()

      response.json({ result, settings: publicSettings })
    }),
  )

  return router
}