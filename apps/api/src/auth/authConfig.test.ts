import { mkdtempSync, rmSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from '@jest/globals'
import { createApiApp } from '../app'
import { env } from '../config/env'

const get = (app: ReturnType<typeof createApiApp>['app'], url: string) =>
  new Promise<{ status: number; body: unknown; cacheControl: unknown }>(
    (resolve, reject) => {
      const request = new IncomingMessage(new Socket())
      request.method = 'GET'
      request.url = url
      const response = new ServerResponse(request)
      // Exercise the Express middleware stack without opening a network port.
      response.end = ((body: string) => {
        try {
          resolve({
            status: response.statusCode,
            body: JSON.parse(body),
            cacheControl: response.getHeader('cache-control'),
          })
        } catch (error) {
          reject(error)
        }
        return response
      }) as typeof response.end
      app(request, response)
    },
  )

describe('API authentication discovery', () => {
  it.each([false, true])(
    'reports auth enabled=%s and enforces that mode on workspace routes',
    async (enabled) => {
      const root = mkdtempSync(path.join(tmpdir(), 'patchlane-auth-'))
      const api = createApiApp({
        ...env,
        databaseFile: path.join(root, 'test.sqlite'),
        llmEndpointsFile: path.join(root, 'endpoints.json'),
        toolSettingsFile: path.join(root, 'tools.json'),
        agentRunsFile: path.join(root, 'runs.json'),
        sandboxWorkspacesFile: path.join(root, 'workspaces.json'),
        sandbox: { ...env.sandbox, rootDir: path.join(root, 'sandboxes') },
        auth: { enabled },
        googleOAuth: {
          ...env.googleOAuth,
          clientId: undefined,
          clientSecret: undefined,
        },
      })

      try {
        const config = await get(api.app, '/auth/config')
        expect(config.status).toBe(200)
        expect(config.body).toEqual({ enabled })
        expect(config.cacheControl).toBe('no-store')

        const workspaces = await get(api.app, '/api/sandbox/workspaces')
        expect(workspaces.status).toBe(enabled ? 401 : 200)
        expect(workspaces.body).toEqual(
          enabled ? { error: 'Unauthorized' } : { workspaces: [] },
        )
      } finally {
        api.database.sqlite.close()
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
})
