import { createContext, useCallback, useEffect, useState } from 'react'
import { api, type AuthUser } from '@/lib/api'

type AuthContextValue = {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: () => void
  logout: () => Promise<void>
  refetch: () => Promise<void>
}

const defaultAuthContext: AuthContextValue = {
  user: null,
  isLoading: false,
  isAuthenticated: false,
  login: () => {},
  logout: async () => {},
  refetch: async () => {},
}

export const AuthContext = createContext<AuthContextValue>(defaultAuthContext)

export const AuthProvider = ({
  children,
  requireAuth = true,
}: {
  children: React.ReactNode
  requireAuth?: boolean
}) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      const { user } = await api.getCurrentUser()
      setUser(user)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      await refetch()
      setIsLoading(false)
    }
    init()
  }, [refetch])

  useEffect(() => {
    if (!isLoading && requireAuth && !user) {
      const handleMessage = (event: MessageEvent) => {
        if (event.data === 'auth:complete') {
          refetch()
        }
      }
      window.addEventListener('message', handleMessage)
      return () => window.removeEventListener('message', handleMessage)
    }
  }, [isLoading, requireAuth, user, refetch])

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
    await api.logout()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}