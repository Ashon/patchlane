import { useCallback, useEffect, useMemo, useState } from 'react'
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query'
import { parseAsString, useQueryState } from 'nuqs'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import {
  applyThemeMode,
  getInitialSupervisorChatOpen,
  getStoredThemeMode,
  themeStorageKey,
} from '@/components/app/app-theme'
import type { ThemeMode } from '@/components/app/app-types'
import { ChatPanel } from '@/components/chat/chat-panel'
import { AppShell } from '@/components/layout/app-shell'
import { SettingsShell } from '@/components/layout/settings-shell'
import {
  AgentRunControllerProvider,
  useAgentRunController,
} from '@/pages/agent/agent-run-controller'
import { AgentTasksPage } from '@/pages/agent/agent-tasks-page'
import { ProjectDetailPage } from '@/pages/projects/project-detail-page'
import { ProjectsListPage } from '@/pages/projects/projects-list-page'
import { EndpointSettingsPage } from '@/pages/settings/endpoint-settings-page'
import { ToolSettingsPage } from '@/pages/settings/tool-settings-page'
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
  const queryClient = useQueryClient()
  const fetchingCount = useIsFetching()
  const {
    issues,
    projects,
    selectedRun,
  } = useAgentRunController()
  const [selectedChatEndpointId, setSelectedChatEndpointId] = useQueryState(
    'chatEndpoint',
    parseAsString.withOptions({ history: 'replace', shallow: true }),
  )
  const [selectedIssueId] = useQueryState(
    'issue',
    parseAsString.withOptions({ history: 'replace', shallow: true }),
  )
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredThemeMode)
  const [supervisorChatOpen, setSupervisorChatOpen] = useState(
    getInitialSupervisorChatOpen,
  )

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
  const defaultEndpoint = useMemo(
    () =>
      endpoints.find((endpoint) => endpoint.enabled) ?? endpoints[0] ?? null,
    [endpoints],
  )
  const selectedChatEndpoint = useMemo(() => {
    if (!selectedChatEndpointId) {
      return defaultEndpoint
    }

    return (
      endpoints.find((endpoint) => endpoint.id === selectedChatEndpointId) ??
      defaultEndpoint
    )
  }, [defaultEndpoint, endpoints, selectedChatEndpointId])
  const enabledCount = endpoints.filter((endpoint) => endpoint.enabled).length
  const githubReady = Boolean(
    toolSettings?.github.enabled && toolSettings.github.tokenConfigured,
  )
  const loading = fetchingCount > 0
  const apiOnline = healthQuery.isError ? false : (healthQuery.data?.ok ?? null)

  const supervisorContextLabel = useMemo(() => {
    if (location.pathname.startsWith('/projects')) {
      const selectedIssue =
        issues.find((issue) => issue.id === selectedIssueId) ?? null

      if (selectedIssue) {
        const issueProject =
          projects.find((project) => project.id === selectedIssue.projectId) ??
          null

        return `Projects / ${issueProject?.name ?? 'Unknown project'} / ${selectedIssue.title}`
      }

      return 'Projects'
    }

    if (location.pathname.startsWith('/agent')) {
      return selectedRun ? `Agent Tasks / ${selectedRun.title}` : 'Agent Tasks'
    }

    if (location.pathname.startsWith('/settings')) {
      return 'Settings'
    }

    if (location.pathname.startsWith('/workspaces')) {
      return 'Workspaces'
    }

    return 'Agent Fleet'
  }, [issues, location.pathname, projects, selectedIssueId, selectedRun])

  const supervisorChatSystemPrompt = useMemo(
    () =>
      [
        'You are the Supervisor Chat for Agent Fleet.',
        'Help coordinate project issues, agent tasks, workspace setup, endpoints, and verification across the whole app.',
        `Current app context: ${supervisorContextLabel}.`,
        'If the user asks for an app action you cannot perform through this chat endpoint, explain the exact page or control they should use.',
      ].join('\n'),
    [supervisorContextLabel],
  )

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

  const refreshData = useCallback(() => {
    void queryClient.invalidateQueries()
  }, [queryClient])

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
    if (
      selectedChatEndpointId &&
      !endpoints.some((endpoint) => endpoint.id === selectedChatEndpointId)
    ) {
      void setSelectedChatEndpointId(null)
    }
  }, [endpoints, selectedChatEndpointId, setSelectedChatEndpointId])

  return (
    <AppShell
      apiOnline={apiOnline}
      buildRoute={buildRoute}
      enabledEndpointCount={enabledCount}
      endpointCount={endpoints.length}
      githubReady={githubReady}
      loading={loading}
      onRefresh={refreshData}
      onSupervisorChatOpenChange={setSupervisorChatOpen}
      onThemeModeChange={setThemeMode}
      projectCount={projects.length}
      supervisorChatOpen={supervisorChatOpen}
      supervisorPanel={
        <ChatPanel
          contextLabel={supervisorContextLabel}
          endpoint={selectedChatEndpoint}
          endpoints={endpoints}
          loading={loading}
          onEndpointChange={(id) => void setSelectedChatEndpointId(id)}
          systemPrompt={supervisorChatSystemPrompt}
          title="Supervisor Chat"
          variant="sidebar"
        />
      }
      themeMode={themeMode}
    >
      <Routes>
        <Route element={<Navigate replace to={buildRoute('/projects')} />} path="/" />
        <Route element={<Navigate replace to={buildRoute('/projects')} />} path="/chat" />
        <Route element={<ProjectsListPage />} path="/projects" />
        <Route element={<ProjectDetailPage />} path="/projects/:projectId" />
        <Route element={<ProjectDetailPage />} path="/projects/:projectId/:tab" />
        <Route element={<Navigate replace to={buildRoute('/projects')} />} path="/issues" />
        <Route
          element={<Navigate replace to={buildRoute('/settings/endpoints')} />}
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
        <Route element={<Navigate replace to={buildRoute('/projects')} />} path="*" />
      </Routes>
    </AppShell>
  )
}
