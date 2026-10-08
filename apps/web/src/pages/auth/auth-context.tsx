import { createContext, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type AuthUser } from '@/lib/api'
import { loadAuthSession } from './auth-session'

type AuthContextValue = {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  error: string | null
  login: () => void
  logout: () => Promise<void>
  refetch: () => Promise<void>
}

const defaultAuthContext: AuthContextValue = {
  user: null,
  isLoading: false,
  isAuthenticated: false,
  error: null,
  login: () => {},
  logout: async () => {},
  refetch: async () => {},
}

export const AuthContext = createContext<AuthContextValue>(defaultAuthContext)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const sessionQuery = useQuery({
    queryKey: ['auth-session'],
    queryFn: () => loadAuthSession(api),
    retry: false,
    staleTime: 0,
  })
  const { refetch: refetchSession } = sessionQuery
  const user = sessionQuery.data?.user ?? null
  const requiresAuth = sessionQuery.data?.requiresAuth !== false
  const isLoading = sessionQuery.isPending || sessionQuery.isRefetching
  const isAuthenticated =
    !sessionQuery.isError && !!sessionQuery.data && (!requiresAuth || !!user)
  const error = sessionQuery.isError
    ? 'Unable to check sign-in settings. Check that the API is running and try again.'
    : null

  const refetch = useCallback(async () => {
    await refetchSession()
  }, [refetchSession])

  useEffect(() => {
    if (requiresAuth && !user) {
      const handleMessage = (event: MessageEvent) => {
        if (
          event.data === 'auth:complete' &&
          event.origin ===
            new URL(api.getLoginUrl(), window.location.href).origin
        ) {
          void refetch()
        }
      }
      window.addEventListener('message', handleMessage)
      return () => window.removeEventListener('message', handleMessage)
    }
  }, [requiresAuth, user, refetch])

  const login = () => {
    const width = 500
    const height = 600
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2
    window.open(
      api.getLoginUrl(),
      'google-login',
      `width=${width},height=${height},left=${left},top=${top}`,
    )
  }

  const logout = useCallback(async () => {
    if (!requiresAuth) {
      return
    }
    await api.logout()
    await refetch()
  }, [requiresAuth, refetch])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        error,
        login,
        logout,
        refetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
