import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import {
  applyThemeMode,
  getStoredThemeMode,
  themeStorageKey,
} from '@/components/app/app-theme'
import { AppCommandPalette } from '@/components/app/app-command-palette'
import type { ThemeMode } from '@/components/app/app-types'
import { AppShell } from '@/components/layout/app-shell'
import { SettingsShell } from '@/components/layout/settings-shell'
import { AgentRunControllerProvider } from '@/pages/agent/agent-run-controller'
import { AgentTasksPage } from '@/pages/agent/agent-tasks-page'
import { EndpointSettingsPage } from '@/pages/settings/endpoint-settings-page'
import { ToolSettingsPage } from '@/pages/settings/tool-settings-page'
import { StatisticsPage } from '@/pages/stats/statistics-page'
import { WorkspaceManagementPage } from '@/pages/workspaces/workspace-management-page'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-client'

export default function App() {
  return (
    <AgentRunControllerProvider>
      <AppContent />
    </AgentRunControllerProvider>
  )
}

const AppContent = () => {
  const location = useLocation()
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredThemeMode)
  const [commandMenuOpen, setCommandMenuOpen] = useState(false)

  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: api.health,
  })
  const endpointsQuery = useQuery({
    queryKey: queryKeys.endpoints,
    queryFn: api.listEndpoints,
  })
  const toolSettingsQuery = useQuery({
    queryKey: queryKeys.toolSettings,
    queryFn: api.getToolSettings,
  })

  const endpoints = useMemo(
    () => endpointsQuery.data?.endpoints ?? [],
    [endpointsQuery.data?.endpoints],
  )
  const toolSettings = toolSettingsQuery.data?.settings ?? null
  const enabledCount = endpoints.filter((endpoint) => endpoint.enabled).length
  const githubReady = Boolean(
    toolSettings?.github.enabled && toolSettings.github.tokenConfigured,
  )
  const apiOnline = healthQuery.isError ? false : (healthQuery.data?.ok ?? null)

  const buildRoute = useCallback(
    (pathname: string, updates: Record<string, string | null> = {}) => {
      const params = new URLSearchParams(location.search)

      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value)
        } else {
          params.delete(key)
        }
      }

      const search = params.toString()
      return { pathname, search: search ? `?${search}` : '' }
    },
    [location.search],
  )

  useEffect(() => {
    window.localStorage.setItem(themeStorageKey, themeMode)
    applyThemeMode(themeMode)

    if (themeMode !== 'system') {
      return
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const syncSystemTheme = () => applyThemeMode('system')

    mediaQuery.addEventListener('change', syncSystemTheme)

    return () => mediaQuery.removeEventListener('change', syncSystemTheme)
  }, [themeMode])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        (!event.metaKey && !event.ctrlKey) ||
        event.key.toLowerCase() !== 'k'
      ) {
        return
      }

      event.preventDefault()
      setCommandMenuOpen(true)
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <AppShell
        apiOnline={apiOnline}
        buildRoute={buildRoute}
        enabledEndpointCount={enabledCount}
        endpointCount={endpoints.length}
        githubReady={githubReady}
        onCommandMenuOpen={() => setCommandMenuOpen(true)}
        onThemeModeChange={setThemeMode}
        themeMode={themeMode}
      >
        <Routes>
          <Route
            element={<Navigate replace to={buildRoute('/workspaces')} />}
            path="/"
          />
          <Route
            element={<Navigate replace to={buildRoute('/workspaces')} />}
            path="/chat"
          />
          <Route
            element={
              <Navigate replace to={buildRoute('/settings/endpoints')} />
            }
            path="/settings"
          />
          <Route
            element={
              <SettingsShell>
                <EndpointSettingsPage />
              </SettingsShell>
            }
            path="/settings/endpoints"
          />
          <Route
            element={
              <SettingsShell>
                <ToolSettingsPage />
              </SettingsShell>
            }
            path="/settings/tools"
          />
          <Route element={<WorkspaceManagementPage />} path="/workspaces" />
          <Route element={<AgentTasksPage />} path="/agent" />
          <Route element={<StatisticsPage />} path="/stats" />
          <Route
            element={<Navigate replace to={buildRoute('/workspaces')} />}
            path="*"
          />
        </Routes>
      </AppShell>
      {commandMenuOpen ? (
        <AppCommandPalette
          onOpenChange={setCommandMenuOpen}
          open={commandMenuOpen}
        />
      ) : null}
    </>
  )
}
