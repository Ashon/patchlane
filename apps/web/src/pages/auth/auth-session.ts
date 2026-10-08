import type { AuthUser } from '@/lib/api'

type AuthClient = {
  getAuthConfig: () => Promise<{ enabled: boolean }>
  getCurrentUser: () => Promise<{ user: AuthUser | null }>
}

export const loadAuthSession = async (client: AuthClient) => {
  const config = await client.getAuthConfig()

  if (config.enabled === false) {
    return { requiresAuth: false, user: null }
  }

  if (config.enabled !== true) {
    throw new Error('Invalid authentication configuration')
  }

  const { user } = await client.getCurrentUser()
  return { requiresAuth: true, user }
}
