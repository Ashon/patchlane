import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AgentRun,
  AgentRunMessageMetadata,
  CreateLlmEndpointInput,
  CreateSandboxWorkspaceInput,
  GitHubToolTestResult,
  Issue,
  IssueStatus,
  LlmEndpoint,
  LlmEndpointTestResult,
  PublicToolSettings,
  SandboxWorkspace,
} from '@agent-fleet/shared'
import { parseAsString, useQueryState } from 'nuqs'
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { AgentTasksPage } from '@/components/agent/agent-tasks-page'
import { AppShell } from '@/components/app/app-shell'
import {
  applyThemeMode,
  getInitialSupervisorChatOpen,
  getStoredThemeMode,
  themeStorageKey,
} from '@/components/app/app-theme'
import {
  emptyEndpointDraft as emptyDraft,
  emptyGitHubToolDraft,
  emptySandboxWorkspaceDraft,
  type EndpointDraft,
  type GitHubToolDraft,
  type SandboxWorkspaceDraft,
  type ThemeMode,
} from '@/components/app/app-types'
import { ChatPanel } from '@/components/chat/chat-panel'
import { ProjectDetailPage } from '@/components/issues/project-detail-page'
import { ProjectsListPage } from '@/components/issues/projects-list-page'
import type { ProjectDetailTab } from '@/components/issues/types'
import { EndpointSettingsPage } from '@/components/settings/endpoint-settings-page'
import { SettingsShell } from '@/components/settings/settings-shell'
import {
  normalizeGitHubToolDraft,
  ToolSettingsPage,
} from '@/components/settings/tool-settings-page'
import { WorkspaceManagementPage } from '@/components/workspaces/workspace-management-page'
import { api } from '@/lib/api'
import {
  finalizeAssistantSegmentMessage,
  getVisibleAgentAssistantText,
  mergeToolResultMessage,
  mergeToolStartMessage,
  mergeVisibleAgentRunMessages,
  parseToolInputArguments,
  type PendingToolMessage,
} from '@/lib/agent-run-message-merge'
import { queryKeys } from '@/lib/query-client'

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fetchingCount = useIsFetching()
  const [selectedId, setSelectedId] = useQueryState(
    'endpoint',
    parseAsString.withOptions({ history: 'replace', shallow: true }),
  )
  const [selectedChatEndpointId, setSelectedChatEndpointId] = useQueryState(
    'chatEndpoint',
    parseAsString.withOptions({ history: 'replace', shallow: true }),
  )
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useQueryState(
    'workspace',
    parseAsString.withOptions({ history: 'replace', shallow: true }),
  )
  const [selectedAgentRunId, setSelectedAgentRunId] = useQueryState(
    'run',
    parseAsString.withOptions({ history: 'replace', shallow: true }),
  )
  const [selectedIssueId, setSelectedIssueId] = useQueryState(
    'issue',
    parseAsString.withOptions({ history: 'replace', shallow: true }),
  )
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredThemeMode)
  const [supervisorChatOpen, setSupervisorChatOpen] = useState(
    getInitialSupervisorChatOpen,
  )
  const [draft, setDraft] = useState<EndpointDraft>(emptyDraft)
  const [githubDraft, setGithubDraft] =
    useState<GitHubToolDraft>(emptyGitHubToolDraft)
  const [workspaceDraft, setWorkspaceDraft] = useState<SandboxWorkspaceDraft>(
    emptySandboxWorkspaceDraft,
  )
  const [agentTaskDraft, setAgentTaskDraft] = useState('')
  const [agentReplyDraft, setAgentReplyDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [toolSaving, setToolSaving] = useState(false)
  const [workspaceCreating, setWorkspaceCreating] = useState(false)
  const [agentRunning, setAgentRunning] = useState(false)
  const [streamingAgentRunId, setStreamingAgentRunId] = useState<string | null>(
    null,
  )
  const [agentRunDeletingId, setAgentRunDeletingId] = useState<string | null>(
    null,
  )
  const [testingId, setTestingId] = useState<string | null>(null)
  const [githubTesting, setGithubTesting] = useState(false)
  const [testResults, setTestResults] = useState<
    Record<string, LlmEndpointTestResult>
  >({})
  const [githubTestResult, setGithubTestResult] =
    useState<GitHubToolTestResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toolError, setToolError] = useState<string | null>(null)
  const [sandboxError, setSandboxError] = useState<string | null>(null)
  const agentStreamAbortRef = useRef<AbortController | null>(null)
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
  const sandboxSettingsQuery = useQuery({
    queryKey: queryKeys.sandboxSettings,
    queryFn: api.getSandboxSettings,
  })
  const sandboxWorkspacesQuery = useQuery({
    queryKey: queryKeys.sandboxWorkspaces,
    queryFn: api.listSandboxWorkspaces,
  })
  const agentRunsQuery = useQuery({
    queryKey: queryKeys.agentRuns,
    queryFn: api.listAgentRuns,
    enabled: !agentRunning,
  })
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects,
    queryFn: api.listProjects,
  })
  const issuesQuery = useQuery({
    queryKey: queryKeys.issues,
    queryFn: api.listIssues,
    enabled: !agentRunning,
  })

  const endpoints = useMemo(
    () => endpointsQuery.data?.endpoints ?? [],
    [endpointsQuery.data?.endpoints],
  )
  const toolSettings = toolSettingsQuery.data?.settings ?? null
  const sandboxSettings = sandboxSettingsQuery.data?.settings ?? null
  const sandboxWorkspaces = useMemo(
    () => sandboxWorkspacesQuery.data?.workspaces ?? [],
    [sandboxWorkspacesQuery.data?.workspaces],
  )
  const agentRuns = useMemo(
    () => agentRunsQuery.data?.runs ?? [],
    [agentRunsQuery.data?.runs],
  )
  const hasActiveAgentTasks = useMemo(
    () =>
      agentRuns.some(
        (run) => run.status === 'running' || run.status === 'idle',
      ),
    [agentRuns],
  )
  const projects = useMemo(
    () => projectsQuery.data?.projects ?? [],
    [projectsQuery.data?.projects],
  )
  const issues = useMemo(
    () => issuesQuery.data?.issues ?? [],
    [issuesQuery.data?.issues],
  )
  const loading = fetchingCount > 0
  const apiOnline = healthQuery.isError ? false : (healthQuery.data?.ok ?? null)

  const selectedEndpoint = useMemo(
    () =>
      selectedId && selectedId !== 'new'
        ? (endpoints.find((endpoint) => endpoint.id === selectedId) ?? null)
        : null,
    [endpoints, selectedId],
  )
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
  const selectedWorkspace = useMemo(
    () =>
      sandboxWorkspaces.find(
        (workspace) => workspace.id === selectedWorkspaceId,
      ) ?? null,
    [sandboxWorkspaces, selectedWorkspaceId],
  )
  const selectedAgentRun = useMemo(
    () => agentRuns.find((run) => run.id === selectedAgentRunId) ?? null,
    [agentRuns, selectedAgentRunId],
  )
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
      return selectedAgentRun
        ? `Agent Tasks / ${selectedAgentRun.title}`
        : 'Agent Tasks'
    }

    if (location.pathname.startsWith('/settings')) {
      return 'Settings'
    }

    if (location.pathname.startsWith('/workspaces')) {
      return 'Workspaces'
    }

    return 'Agent Fleet'
  }, [issues, location.pathname, projects, selectedAgentRun, selectedIssueId])
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
  const isSelectedAgentRunStreaming =
    Boolean(streamingAgentRunId) && selectedAgentRunId === streamingAgentRunId
  const endpointError =
    error ?? getQueryErrorMessage(healthQuery.error, endpointsQuery.error)
  const toolSettingsError =
    toolError ?? getQueryErrorMessage(toolSettingsQuery.error)
  const sandboxLoadError =
    sandboxError ??
    getQueryErrorMessage(
      sandboxSettingsQuery.error,
      sandboxWorkspacesQuery.error,
      agentRunsQuery.error,
    )
  const issuesLoadError = getQueryErrorMessage(
    projectsQuery.error,
    issuesQuery.error,
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

  const selectEndpoint = useCallback(
    (endpoint: LlmEndpoint) => {
      void setSelectedId(endpoint.id)
      setDraft({
        name: endpoint.name,
        baseUrl: endpoint.baseUrl,
        defaultModel: endpoint.defaultModel,
        apiKeyEnvVar: endpoint.apiKeyEnvVar || '',
        enabled: endpoint.enabled,
      })
    },
    [setSelectedId],
  )

  const applyToolSettings = useCallback(
    (settings: PublicToolSettings) => {
      queryClient.setQueryData<{ settings: PublicToolSettings }>(
        queryKeys.toolSettings,
        { settings },
      )
      setGithubDraft({
        enabled: settings.github.enabled,
        token: '',
        clearToken: false,
      })
    },
    [queryClient],
  )

  const selectWorkspace = useCallback(
    (workspace: SandboxWorkspace) => {
      void setSelectedWorkspaceId(workspace.id)
    },
    [setSelectedWorkspaceId],
  )

  const selectAgentRun = useCallback(
    (run: AgentRun) => {
      navigate(buildRoute('/agent', { run: run.id }))
    },
    [buildRoute, navigate],
  )

  const startNewAgentRun = useCallback(() => {
    setAgentReplyDraft('')
    setAgentTaskDraft('')
    setSandboxError(null)
    navigate(buildRoute('/agent', { run: null }))
  }, [buildRoute, navigate])

  const upsertAgentRun = useCallback(
    (run: AgentRun) => {
      queryClient.setQueryData<{ runs: AgentRun[] }>(
        queryKeys.agentRuns,
        (current) => ({
          runs: [
            run,
            ...(current?.runs ?? []).filter((item) => item.id !== run.id),
          ],
        }),
      )
      selectAgentRun(run)
    },
    [queryClient, selectAgentRun],
  )

  const upsertAgentRunPreservingVisibleMessages = useCallback(
    (
      run: AgentRun,
      options: { skipServerAssistantMessages?: boolean } = {},
    ) => {
      let mergedRun = run

      queryClient.setQueryData<{ runs: AgentRun[] }>(
        queryKeys.agentRuns,
        (current) => {
          const existingRun = current?.runs.find((item) => item.id === run.id)
          mergedRun = {
            ...run,
            messages: existingRun
              ? mergeVisibleAgentRunMessages(
                  existingRun.messages,
                  run.messages,
                  options,
                )
              : run.messages,
          }

          return {
            runs: [
              mergedRun,
              ...(current?.runs ?? []).filter((item) => item.id !== run.id),
            ],
          }
        },
      )
      selectAgentRun(mergedRun)
    },
    [queryClient, selectAgentRun],
  )

  const upsertAgentRunsInCache = useCallback(
    (runs?: AgentRun[]) => {
      if (!runs?.length) {
        return
      }

      queryClient.setQueryData<{ runs: AgentRun[] }>(
        queryKeys.agentRuns,
        (current) => ({
          runs: [
            ...runs,
            ...(current?.runs ?? []).filter(
              (run) => !runs.some((item) => item.id === run.id),
            ),
          ],
        }),
      )
    },
    [queryClient],
  )

  const upsertIssue = useCallback(
    (issue: Issue) => {
      queryClient.setQueryData<{ issues: Issue[] }>(
        queryKeys.issues,
        (current) => ({
          issues: [
            issue,
            ...(current?.issues ?? []).filter((item) => item.id !== issue.id),
          ],
        }),
      )
      void setSelectedIssueId(issue.id)
    },
    [queryClient, setSelectedIssueId],
  )

  const syncIssueFromRun = useCallback(
    async (issueId: string, run: AgentRun) => {
      const status = getIssueStatusFromRun(run)
      const response = await api.updateIssue(issueId, {
        branchName: run.branchName,
        prUrl: run.prUrl,
        status,
      })
      upsertIssue(response.issue)
    },
    [upsertIssue],
  )

  const refreshIssues = useCallback(async () => {
    const response = await api.listIssues()
    queryClient.setQueryData(queryKeys.issues, response)
  }, [queryClient])

  const updateAgentRunInPlace = useCallback(
    (runId: string, updater: (run: AgentRun) => AgentRun) => {
      queryClient.setQueryData<{ runs: AgentRun[] }>(
        queryKeys.agentRuns,
        (current) => ({
          runs: (current?.runs ?? []).map((run) =>
            run.id === runId ? updater(run) : run,
          ),
        }),
      )
    },
    [queryClient],
  )

  const refreshData = useCallback(() => {
    setError(null)
    setToolError(null)
    setSandboxError(null)
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
    if (!hasActiveAgentTasks || agentRunning) {
      return
    }

    const intervalId = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentRuns })
      void queryClient.invalidateQueries({ queryKey: queryKeys.issues })
    }, 2_000)

    return () => window.clearInterval(intervalId)
  }, [agentRunning, hasActiveAgentTasks, queryClient])

  useEffect(() => {
    if (toolSettings) {
      setGithubDraft((current) => ({
        enabled: toolSettings.github.enabled,
        token: current.token,
        clearToken: current.clearToken,
      }))
    }
  }, [toolSettings])

  useEffect(() => {
    if (!endpoints.length) {
      if (selectedId && selectedId !== 'new') {
        void setSelectedId(null)
      }
      return
    }

    if (!selectedId) {
      void setSelectedId(endpoints[0]!.id)
      return
    }

    if (
      selectedId !== 'new' &&
      !endpoints.some((endpoint) => endpoint.id === selectedId)
    ) {
      void setSelectedId(endpoints[0]!.id)
    }
  }, [endpoints, selectedId, setSelectedId])

  useEffect(() => {
    if (
      selectedChatEndpointId &&
      !endpoints.some((endpoint) => endpoint.id === selectedChatEndpointId)
    ) {
      void setSelectedChatEndpointId(null)
    }
  }, [endpoints, selectedChatEndpointId, setSelectedChatEndpointId])

  useEffect(() => {
    if (selectedEndpoint) {
      setDraft({
        name: selectedEndpoint.name,
        baseUrl: selectedEndpoint.baseUrl,
        defaultModel: selectedEndpoint.defaultModel,
        apiKeyEnvVar: selectedEndpoint.apiKeyEnvVar || '',
        enabled: selectedEndpoint.enabled,
      })
      return
    }

    if (selectedId === 'new' || !selectedId) {
      setDraft(emptyDraft)
    }
  }, [selectedEndpoint, selectedId])

  useEffect(() => {
    if (!sandboxWorkspaces.length) {
      if (selectedWorkspaceId) {
        void setSelectedWorkspaceId(null)
      }
      return
    }

    if (
      !selectedWorkspaceId ||
      !sandboxWorkspaces.some(
        (workspace) => workspace.id === selectedWorkspaceId,
      )
    ) {
      void setSelectedWorkspaceId(sandboxWorkspaces[0]!.id)
    }
  }, [sandboxWorkspaces, selectedWorkspaceId, setSelectedWorkspaceId])

  useEffect(() => {
    if (
      selectedAgentRunId &&
      !agentRuns.some((run) => run.id === selectedAgentRunId)
    ) {
      void setSelectedAgentRunId(null)
    }
  }, [agentRuns, selectedAgentRunId, setSelectedAgentRunId])

  useEffect(() => {
    if (
      selectedIssueId &&
      !issues.some((issue) => issue.id === selectedIssueId)
    ) {
      void setSelectedIssueId(null)
    }
  }, [issues, selectedIssueId, setSelectedIssueId])

  const startNewEndpoint = () => {
    setDraft(emptyDraft)
    setError(null)
    navigate(buildRoute('/settings/endpoints', { endpoint: 'new' }))
  }

  const saveEndpoint = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const input = normalizeDraft(draft)
      const response = selectedEndpoint
        ? await api.updateEndpoint(selectedEndpoint.id, input)
        : await api.createEndpoint(input)

      const endpointResponse = await api.listEndpoints()
      queryClient.setQueryData(queryKeys.endpoints, endpointResponse)
      selectEndpoint(response.endpoint)
    } catch (saveError) {
      setError(getErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  const deleteEndpoint = async () => {
    if (!selectedEndpoint) {
      return
    }

    setSaving(true)
    setError(null)

    try {
      await api.deleteEndpoint(selectedEndpoint.id)
      const response = await api.listEndpoints()
      queryClient.setQueryData(queryKeys.endpoints, response)

      if (response.endpoints[0]) {
        selectEndpoint(response.endpoints[0])
      } else {
        startNewEndpoint()
      }
    } catch (deleteError) {
      setError(getErrorMessage(deleteError))
    } finally {
      setSaving(false)
    }
  }

  const testEndpoint = async (endpoint: LlmEndpoint) => {
    setTestingId(endpoint.id)
    setError(null)

    try {
      const response = await api.testEndpoint(endpoint.id)
      setTestResults((current) => ({
        ...current,
        [endpoint.id]: response.result,
      }))
    } catch (testError) {
      setTestResults((current) => ({
        ...current,
        [endpoint.id]: {
          ok: false,
          latencyMs: 0,
          models: [],
          error: getErrorMessage(testError),
        },
      }))
    } finally {
      setTestingId(null)
    }
  }

  const saveGitHubToolSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setToolSaving(true)
    setToolError(null)

    try {
      const response = await api.updateGitHubToolSettings(
        normalizeGitHubToolDraft(githubDraft),
      )
      applyToolSettings(response.settings)
      setGithubTestResult(null)
    } catch (saveError) {
      setToolError(getErrorMessage(saveError))
    } finally {
      setToolSaving(false)
    }
  }

  const testGitHubTool = async () => {
    setGithubTesting(true)
    setToolError(null)

    try {
      const response = await api.testGitHubTool()
      setGithubTestResult(response.result)
      applyToolSettings(response.settings)
    } catch (testError) {
      setGithubTestResult(null)
      setToolError(getErrorMessage(testError))
    } finally {
      setGithubTesting(false)
    }
  }

  const createWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setWorkspaceCreating(true)
    setSandboxError(null)

    try {
      const response = await api.createSandboxWorkspace(
        normalizeWorkspaceDraft(workspaceDraft),
      )
      const listResponse = await api.listSandboxWorkspaces()
      queryClient.setQueryData(queryKeys.sandboxWorkspaces, listResponse)
      selectWorkspace(response.workspace)
      setWorkspaceDraft(emptySandboxWorkspaceDraft)
    } catch (createError) {
      setSandboxError(getErrorMessage(createError))

      try {
        const listResponse = await api.listSandboxWorkspaces()
        queryClient.setQueryData(queryKeys.sandboxWorkspaces, listResponse)
      } catch {
        // Keep the original create error visible.
      }
    } finally {
      setWorkspaceCreating(false)
    }
  }

  const deleteWorkspace = async (workspace: SandboxWorkspace) => {
    setWorkspaceCreating(true)
    setSandboxError(null)

    try {
      await api.deleteSandboxWorkspace(workspace.id)
      const response = await api.listSandboxWorkspaces()
      queryClient.setQueryData(queryKeys.sandboxWorkspaces, response)
    } catch (deleteError) {
      setSandboxError(getErrorMessage(deleteError))
    } finally {
      setWorkspaceCreating(false)
    }
  }

  const createAgentRun = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!selectedWorkspace) {
      return
    }

    setAgentRunning(true)
    setSandboxError(null)

    try {
      const response = await api.createAgentRun({
        workspaceId: selectedWorkspace.id,
        endpointId: defaultEndpoint?.id,
        title: getAgentRunTitle(agentTaskDraft),
        task: agentTaskDraft,
      })

      upsertAgentRun({ ...response.run, status: 'running' })
      setAgentTaskDraft('')
      await streamAgentRun(response.run)
    } catch (runError) {
      setSandboxError(getErrorMessage(runError))
    } finally {
      setAgentRunning(false)
    }
  }

  const continueAgentRun = async (run: AgentRun) => {
    await streamAgentRun(run)
  }

  const rewindAgentRun = async (run: AgentRun, messageId: string) => {
    if (agentRunning) {
      return
    }

    setSandboxError(null)

    try {
      const response = await api.rewindAgentRun(run.id, { messageId })
      setAgentReplyDraft('')
      upsertAgentRun(response.run)
    } catch (rewindError) {
      setSandboxError(getErrorMessage(rewindError))
    }
  }

  const streamAgentRun = async (run: AgentRun, trackedIssueId?: string) => {
    const controller = new AbortController()
    let activeAssistantMessageId: string | null = null
    let activeAssistantContent = ''
    let activeAssistantMetadata: AgentRunMessageMetadata | undefined
    const pendingToolMessages: PendingToolMessage[] = []
    let finalRun: AgentRun | null = null

    agentStreamAbortRef.current = controller
    setAgentRunning(true)
    setStreamingAgentRunId(run.id)
    setSandboxError(null)
    await Promise.all([
      queryClient.cancelQueries({ queryKey: queryKeys.agentRuns }),
      queryClient.cancelQueries({ queryKey: queryKeys.issues }),
    ])

    const createAssistantSegment = (metadata?: AgentRunMessageMetadata) => {
      const id = `stream-${crypto.randomUUID()}`
      activeAssistantMessageId = id
      activeAssistantContent = ''
      activeAssistantMetadata = metadata

      updateAgentRunInPlace(run.id, (current) => ({
        ...current,
        status: 'running',
        messages: [
          ...current.messages,
          {
            id,
            role: 'assistant',
            content: '',
            metadata,
            createdAt: new Date().toISOString(),
          },
        ],
      }))

      return id
    }

    const ensureAssistantSegment = (metadata?: AgentRunMessageMetadata) => {
      if (activeAssistantMessageId) {
        if (metadata) {
          activeAssistantMetadata = metadata
        }

        return activeAssistantMessageId
      }

      return createAssistantSegment(metadata)
    }

    const consumeAssistantSegment = () => {
      const id = activeAssistantMessageId

      if (!id) {
        return null
      }

      const content = activeAssistantContent
      const metadata = activeAssistantMetadata
      activeAssistantMessageId = null
      activeAssistantContent = ''
      activeAssistantMetadata = undefined

      return { id, content, metadata }
    }

    const discardAssistantSegment = () => {
      const id = activeAssistantMessageId

      if (!id) {
        return
      }

      activeAssistantMessageId = null
      activeAssistantContent = ''
      activeAssistantMetadata = undefined

      updateAgentRunInPlace(run.id, (current) => ({
        ...current,
        status: 'running',
        messages: current.messages.filter((message) => message.id !== id),
      }))
    }

    const consumePendingToolMessage = (toolName: string) => {
      const index = pendingToolMessages.findIndex(
        (message) => message.toolName === toolName,
      )

      if (index < 0) {
        return null
      }

      const [message] = pendingToolMessages.splice(index, 1)

      return message ?? null
    }

    const finalizeAssistantSegment = (
      serverMessages: AgentRun['messages'] = [],
    ) => {
      const assistantSegment = consumeAssistantSegment()

      if (!assistantSegment) {
        return
      }

      updateAgentRunInPlace(run.id, (current) => ({
        ...current,
        status: 'running',
        messages: finalizeAssistantSegmentMessage(
          current.messages,
          assistantSegment,
          serverMessages,
        ),
      }))
    }

    const syncActiveAssistantSegmentFromServer = (
      serverMessages: AgentRun['messages'],
    ) => {
      if (!activeAssistantMessageId) {
        return
      }

      const serverAssistant = serverMessages
        .slice()
        .reverse()
        .find(
          (message) =>
            message.role === 'assistant' &&
            getVisibleAgentAssistantText(message.content),
        )

      if (!serverAssistant) {
        return
      }

      activeAssistantContent = serverAssistant.content
      activeAssistantMetadata =
        serverAssistant.metadata ?? activeAssistantMetadata

      updateAgentRunInPlace(run.id, (current) => ({
        ...current,
        status: 'running',
        messages: current.messages.map((message) =>
          message.id === activeAssistantMessageId
            ? {
                ...message,
                content: serverAssistant.content,
                metadata: serverAssistant.metadata ?? message.metadata,
              }
            : message,
        ),
      }))
    }

    try {
      await api.streamAgentRun(
        run.id,
        {
          endpointId: defaultEndpoint?.id,
        },
        {
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === 'run') {
              syncActiveAssistantSegmentFromServer(event.run.messages)
              upsertAgentRunPreservingVisibleMessages(event.run, {
                skipServerAssistantMessages: Boolean(activeAssistantMessageId),
              })
              return
            }

            if (event.type === 'done') {
              finalizeAssistantSegment(event.run.messages)
              finalRun = event.run
              upsertAgentRunPreservingVisibleMessages(event.run)
              if (event.run.issueId) {
                void refreshIssues()
              }
              return
            }

            if (event.type === 'assistant_delta') {
              const assistantMessageId = ensureAssistantSegment(event.metadata)
              activeAssistantContent += event.content

              updateAgentRunInPlace(run.id, (current) => {
                const existing = current.messages.find(
                  (message) => message.id === assistantMessageId,
                )

                if (existing) {
                  return {
                    ...current,
                    status: 'running',
                    messages: current.messages.map((message) =>
                      message.id === assistantMessageId
                        ? {
                            ...message,
                            content: activeAssistantContent,
                            metadata: event.metadata ?? message.metadata,
                          }
                        : message,
                    ),
                  }
                }

                return {
                  ...current,
                  status: 'running',
                  messages: [
                    ...current.messages,
                    {
                      id: assistantMessageId,
                      role: 'assistant',
                      content: activeAssistantContent,
                      metadata: event.metadata,
                      createdAt: new Date().toISOString(),
                    },
                  ],
                }
              })
              return
            }

            if (event.type === 'assistant_reset') {
              discardAssistantSegment()
              return
            }

            if (event.type === 'tool_start') {
              const now = new Date().toISOString()
              const assistantSegment = consumeAssistantSegment()
              const shouldReuseAssistantMessageId =
                Boolean(assistantSegment) &&
                !getVisibleAgentAssistantText(assistantSegment?.content ?? '')
              const parsedToolInput = parseToolInputArguments(event.toolInput)
              const nextToolMessageId = shouldReuseAssistantMessageId
                ? assistantSegment!.id
                : `tool-${crypto.randomUUID()}`
              pendingToolMessages.push({
                id: nextToolMessageId,
                toolInput: parsedToolInput,
                toolName: event.toolName,
              })
              const toolMessage: AgentRun['messages'][number] = {
                id: nextToolMessageId,
                role: 'tool',
                toolName: event.toolName,
                toolInput: parsedToolInput,
                content: `Running ${event.toolName}...`,
                metadata: event.metadata,
                createdAt: now,
              }

              updateAgentRunInPlace(run.id, (current) => ({
                ...current,
                status: 'running',
                messages: mergeToolStartMessage(
                  current.messages,
                  assistantSegment,
                  toolMessage,
                ),
              }))
              return
            }

            if (event.type === 'tool_result') {
              const now = new Date().toISOString()
              const pendingTool = consumePendingToolMessage(event.toolName)
              const resultMessage: AgentRun['messages'][number] = {
                id:
                  pendingTool?.id ??
                  `tool-${crypto.randomUUID()}`,
                role: 'tool',
                toolName: event.toolName,
                toolInput: pendingTool?.toolInput,
                content: event.content,
                metadata: event.metadata,
                createdAt: now,
              }

              updateAgentRunInPlace(run.id, (current) => ({
                ...current,
                status: 'running',
                messages: mergeToolResultMessage(
                  current.messages,
                  resultMessage,
                ),
              }))
              return
            }

            if (event.type === 'error') {
              if (event.run) {
                finalizeAssistantSegment(event.run.messages)
                finalRun = event.run
                upsertAgentRunPreservingVisibleMessages(event.run)
              }

              throw new Error(event.error)
            }
          },
        },
      )

      if (trackedIssueId && finalRun) {
        await syncIssueFromRun(trackedIssueId, finalRun)
      }
    } catch (runError) {
      if (!isAbortError(runError)) {
        setSandboxError(getErrorMessage(runError))
        if (trackedIssueId && finalRun) {
          await syncIssueFromRun(trackedIssueId, finalRun)
        }
      }
    } finally {
      agentStreamAbortRef.current = null
      setStreamingAgentRunId((current) => (current === run.id ? null : current))
      setAgentRunning(false)
    }
  }

  const sendAgentMessage = async () => {
    if (!selectedAgentRun || agentRunning || !agentReplyDraft.trim()) {
      return
    }

    setAgentRunning(true)
    setSandboxError(null)

    try {
      const updated = await api.appendAgentRunMessage(selectedAgentRun.id, {
        content: agentReplyDraft,
      })
      setAgentReplyDraft('')
      upsertAgentRun({ ...updated.run, status: 'running' })
      await streamAgentRun(updated.run)
    } catch (runError) {
      setSandboxError(getErrorMessage(runError))
    } finally {
      setAgentRunning(false)
    }
  }

  const stopAgentRun = () => {
    agentStreamAbortRef.current?.abort()
  }

  const deleteAgentRun = async (run: AgentRun) => {
    setAgentRunDeletingId(run.id)
    setSandboxError(null)

    try {
      await api.deleteAgentRun(run.id)
      const [runsResponse, issuesResponse, workspaceResponse] =
        await Promise.all([
          api.listAgentRuns(),
          api.listIssues(),
          api.listSandboxWorkspaces(),
        ])
      queryClient.setQueryData(queryKeys.agentRuns, runsResponse)
      queryClient.setQueryData(queryKeys.issues, issuesResponse)
      queryClient.setQueryData(queryKeys.sandboxWorkspaces, workspaceResponse)
    } catch (deleteError) {
      setSandboxError(getErrorMessage(deleteError))
    } finally {
      setAgentRunDeletingId(null)
    }
  }

  const startIssueRun = async (issue: Issue) => {
    setSandboxError(null)

    const project = projects.find((item) => item.id === issue.projectId)
    const response = await api.startIssue(issue.id, {
      endpointId:
        issue.endpointId ?? project?.defaultEndpointId ?? defaultEndpoint?.id,
    })
    upsertIssue(response.issue)
    upsertAgentRunsInCache(response.runs)

    if (!response.run) {
      return
    }

    upsertAgentRun({ ...response.run, status: 'running' })
    await streamAgentRun(response.run, response.issue.id)
  }

  const openAgentRun = (runId: string) => {
    const existingRun = agentRuns.find((run) => run.id === runId)

    if (existingRun) {
      selectAgentRun(existingRun)
      return
    }

    void api
      .getAgentRun(runId)
      .then((response) => {
        upsertAgentRun(response.run)
      })
      .catch((openError) => {
        setSandboxError(getErrorMessage(openError))
      })
  }

  const ProjectDetailRoute = () => {
    const { projectId, tab } = useParams<{ projectId: string; tab?: string }>()

    if (!projectId) {
      return <Navigate replace to={buildRoute('/projects')} />
    }

    if (!tab) {
      return (
        <Navigate
          replace
          to={buildRoute(`/projects/${projectId}/issues`, { project: null })}
        />
      )
    }

    const selectedTab: ProjectDetailTab = tab === 'tasks' ? 'tasks' : 'issues'
    const projectExists = projects.some((project) => project.id === projectId)

    if (!loading && projects.length > 0 && !projectExists) {
      return (
        <Navigate
          replace
          to={buildRoute('/projects', { issue: null, project: null })}
        />
      )
    }

    return (
      <ProjectDetailPage
        agentRuns={agentRuns}
        endpoints={endpoints}
        error={issuesLoadError}
        issues={issues}
        loading={loading}
        onBack={() =>
          navigate(buildRoute('/projects', { issue: null, project: null }))
        }
        onNavigateTab={(nextTab) =>
          navigate(buildRoute(`/projects/${projectId}/${nextTab}`))
        }
        onOpenRun={openAgentRun}
        onSelectIssue={(id) => void setSelectedIssueId(id)}
        onStartIssueRun={startIssueRun}
        projectId={projectId}
        projects={projects}
        selectedEndpoint={defaultEndpoint}
        selectedIssueId={selectedIssueId}
        tab={selectedTab}
        workspaces={sandboxWorkspaces}
      />
    )
  }

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
              <Route
                element={<Navigate replace to={buildRoute('/projects')} />}
                path="/"
              />
              <Route
                element={<Navigate replace to={buildRoute('/projects')} />}
                path="/chat"
              />
              <Route
                element={
                  <ProjectsListPage
                    endpoints={endpoints}
                    error={issuesLoadError}
                    issues={issues}
                    loading={loading}
                    onOpenProject={(id) =>
                      navigate(
                        buildRoute(`/projects/${id}/issues`, {
                          issue: null,
                          project: null,
                        }),
                      )
                    }
                    projects={projects}
                    selectedEndpoint={defaultEndpoint}
                    workspaces={sandboxWorkspaces}
                  />
                }
                path="/projects"
              />
              <Route
                element={<ProjectDetailRoute />}
                path="/projects/:projectId"
              />
              <Route
                element={<ProjectDetailRoute />}
                path="/projects/:projectId/:tab"
              />
              <Route
                element={<Navigate replace to={buildRoute('/projects')} />}
                path="/issues"
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
                    <EndpointSettingsPage
                      draft={draft}
                      endpointError={endpointError}
                      endpoints={endpoints}
                      loading={loading}
                      onDeleteEndpoint={() => void deleteEndpoint()}
                      onDraftChange={setDraft}
                      onSaveEndpoint={saveEndpoint}
                      onSelectEndpoint={selectEndpoint}
                      onStartNewEndpoint={startNewEndpoint}
                      onTestEndpoint={(endpoint) => void testEndpoint(endpoint)}
                      saving={saving}
                      selectedEndpoint={selectedEndpoint}
                      selectedEndpointId={selectedId}
                      testingId={testingId}
                      testResults={testResults}
                    />
                </SettingsShell>
              }
              path="/settings/endpoints"
            />
            <Route
              element={
                <SettingsShell>
                  <ToolSettingsPage
                    draft={githubDraft}
                    error={toolSettingsError}
                    formatDateTime={formatDateTime}
                    onChange={setGithubDraft}
                    onSubmit={saveGitHubToolSettings}
                    onTest={() => void testGitHubTool()}
                    saving={toolSaving}
                    settings={toolSettings}
                    testResult={githubTestResult}
                    testing={githubTesting}
                  />
                </SettingsShell>
              }
              path="/settings/tools"
            />
            <Route
              element={
                <WorkspaceManagementPage
                  error={sandboxLoadError}
                  onCreateWorkspace={createWorkspace}
                  onDeleteWorkspace={(workspace) =>
                    void deleteWorkspace(workspace)
                  }
                  onSelectWorkspace={selectWorkspace}
                  onWorkspaceDraftChange={setWorkspaceDraft}
                  selectedWorkspace={selectedWorkspace}
                  settings={sandboxSettings}
                  workspaceCreating={workspaceCreating}
                  workspaceDraft={workspaceDraft}
                  workspaces={sandboxWorkspaces}
                />
              }
              path="/workspaces"
            />
            <Route
              element={
                <AgentTasksPage
                  agentReplyDraft={agentReplyDraft}
                  agentRunning={agentRunning}
                  agentTaskDraft={agentTaskDraft}
                  endpoint={defaultEndpoint}
                  error={sandboxLoadError}
                  onAgentReplyChange={setAgentReplyDraft}
                  onAgentTaskChange={setAgentTaskDraft}
                  onContinueAgentRun={(run) => void continueAgentRun(run)}
                  onDeleteAgentRun={(run) => void deleteAgentRun(run)}
                  onCreateAgentRun={createAgentRun}
                  onRewindAgentRun={(run, messageId) =>
                    void rewindAgentRun(run, messageId)
                  }
                  onSendAgentMessage={() => void sendAgentMessage()}
                  onSelectAgentRun={selectAgentRun}
                  onStartNewAgentRun={startNewAgentRun}
                  onStopAgentRun={stopAgentRun}
                  issues={issues}
                  projects={projects}
                  runs={agentRuns}
                  runDeletingId={agentRunDeletingId}
                  selectedRun={selectedAgentRun}
                  selectedRunStreaming={isSelectedAgentRunStreaming}
                  selectedWorkspace={selectedWorkspace}
                />
              }
              path="/agent"
            />
            <Route
              element={<Navigate replace to={buildRoute('/projects')} />}
              path="*"
            />
      </Routes>
    </AppShell>
  )
}

const normalizeDraft = (draft: EndpointDraft): CreateLlmEndpointInput => ({
  ...draft,
  apiKeyEnvVar: draft.apiKeyEnvVar?.trim() || undefined,
  baseUrl: draft.baseUrl.trim(),
  defaultModel: draft.defaultModel.trim(),
  name: draft.name.trim(),
})

const normalizeWorkspaceDraft = (
  draft: SandboxWorkspaceDraft,
): CreateSandboxWorkspaceInput => ({
  name: draft.name.trim() || undefined,
  repositoryUrl: draft.repositoryUrl.trim() || undefined,
  ref: draft.ref.trim() || undefined,
})

const getAgentRunTitle = (task: string) => {
  return task.split('\n').find(Boolean)?.slice(0, 80) || 'Agent task'
}

const getIssueStatusFromRun = (run: AgentRun): IssueStatus => {
  if (run.prUrl) {
    return 'review'
  }

  if (run.status === 'completed') {
    return 'completed'
  }

  if (run.status === 'failed') {
    return 'failed'
  }

  if (run.status === 'awaiting_user') {
    return 'awaiting_user'
  }

  return 'running'
}

const getQueryErrorMessage = (...errors: Array<unknown | null>) => {
  const error = errors.find(Boolean)
  return error ? getErrorMessage(error) : null
}

const isAbortError = (error: unknown) => {
  return error instanceof DOMException && error.name === 'AbortError'
}

const formatDateTime = (value?: string) => {
  if (!value) {
    return 'Never'
  }

  return new Date(value).toLocaleString()
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown error'
}
