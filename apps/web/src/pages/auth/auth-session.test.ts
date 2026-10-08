import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadAuthSession } from './auth-session'

test('local mode opens without requesting a Google session', async () => {
  const session = await loadAuthSession({
    getAuthConfig: async () => ({ enabled: false }),
    getCurrentUser: async () => {
      assert.fail('Local mode must not request /auth/me')
    },
  })

  assert.deepEqual(session, { requiresAuth: false, user: null })
})

test('Google mode still requires sign-in without a session', async () => {
  const session = await loadAuthSession({
    getAuthConfig: async () => ({ enabled: true }),
    getCurrentUser: async () => ({ user: null }),
  })

  assert.deepEqual(session, { requiresAuth: true, user: null })
})

test('Google mode retains the authenticated user', async () => {
  const user = {
    id: 'user-1',
    googleId: 'google-1',
    email: 'user@example.test',
    name: 'Test User',
    role: 'user' as const,
    createdAt: '2026-10-02T00:00:00Z',
    updatedAt: '2026-10-02T00:00:00Z',
  }
  const session = await loadAuthSession({
    getAuthConfig: async () => ({ enabled: true }),
    getCurrentUser: async () => ({ user }),
  })

  assert.deepEqual(session, { requiresAuth: true, user })
})

test('unavailable auth settings never fall back to local access', async () => {
  await assert.rejects(
    loadAuthSession({
      getAuthConfig: async () => {
        throw new Error('API unavailable')
      },
      getCurrentUser: async () => {
        assert.fail('Do not load a session without authentication settings')
      },
    }),
    /API unavailable/,
  )
})

test('malformed auth settings never fall back to local access', async () => {
  for (const enabled of [undefined, null, 0, 'false']) {
    await assert.rejects(
      loadAuthSession({
        getAuthConfig: async () => ({ enabled: enabled as boolean }),
        getCurrentUser: async () => ({ user: null }),
      }),
      /Invalid authentication configuration/,
    )
  }
})

test('session failures never fall back to local access', async () => {
  await assert.rejects(
    loadAuthSession({
      getAuthConfig: async () => ({ enabled: true }),
      getCurrentUser: async () => {
        throw new Error('Session unavailable')
      },
    }),
    /Session unavailable/,
  )
})
