import { Router } from 'express'
import passport from 'passport'
import type { AuthStore } from './authStore'
import { isAuthenticated, isAdmin, type AuthUser } from './authMiddleware'

type AuthRouterOptions = {
  authStore: AuthStore
  baseUrl: string
}

export const createAuthRouter = ({ authStore: store, baseUrl }: AuthRouterOptions) => {
  const router = Router()

  router.get('/auth/google', (_request, response, next) => {
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      prompt: 'consent',
    })(_request, response, next)
  })

  router.get(
    '/auth/google/callback',
    passport.authenticate('google', {
      successRedirect: `${baseUrl}/auth/callback`,
      failureRedirect: `${baseUrl}/auth/callback?error=failed`,
    }),
  )

  router.get('/auth/callback', (_request, response) => {
    response.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <script>
            if (window.opener) {
              window.opener.postMessage('auth:complete', '*');
            }
            window.close();
          </script>
        </head>
        <body>
          <p>Authentication complete. You can close this window.</p>
        </body>
      </html>
    `)
  })

  router.get('/auth/me', isAuthenticated, (request, response) => {
    response.json({ user: request.user as AuthUser })
  })

  router.post('/auth/logout', (request, response) => {
    request.logout((err: Error | null) => {
      if (err) {
        return response.status(500).json({ error: 'Logout failed' })
      }
      request.session?.destroy(() => {
        response.json({ ok: true })
      })
    })
  })

  router.get('/auth/users', isAuthenticated, isAdmin, (_request, response) => {
    response.json({ users: store.list() })
  })

  return router
}