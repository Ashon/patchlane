import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AgentProject,
  AgentRun,
  AgentRunMessageMetadata,
  Issue,
  IssueStatus,
  LlmEndpoint,
  SandboxWorkspace,
} from '@patchlane/shared'
import { parseAsString, useQueryState } from 'nuqs'
import { useLocation, useNavigate } from 'react-router-dom'
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
import { getErrorMessage, getQueryErrorMessage } from '@/lib/errors'
import { queryKeys } from '@/lib/query-client'

type AppRoute = {
  pathname: string
  search?: string
}

type AgentRunControllerValue = {
  agentReplyDraft: string
  agentRunning: boolean
  agentTaskDraft: string
  endpoint: LlmEndpoint | null
  endpoints: LlmEndpoint[]
  error: string | null
  issues: Issue[]
  issuesError: string | null
  loading: boolean
  onAgentReplyChange: (value: string) => void
  onAgentTaskChange: (value: string) => void
  onContinueAgentRun: (run: AgentRun) => void
  onCreateAgentRun: (event: FormEvent<HTMLFormElement>) => void
  onDeleteAgentRun: (run: AgentRun) => void
  onOpenAgentRun: (runId: string) => void
  onPlanIssue: (issue: Issue) => Promise<void>
  onRewindAgentRun: (run: AgentRun, messageId: string) => void
  onSelectAgentRun: (run: AgentRun) => void
  onSendAgentMessage: () => void
  onStartIssueRun: (issue: Issue) => Promise<void>
  onStartNewAgentRun: () => void
  onStopAgentRun: () => void
  projects: AgentProject[]
  runDeletingId: string | null
  runs: AgentRun[]
  selectedRun: AgentRun | null
  selectedRunStreaming: boolean
  selectedWorkspace: SandboxWorkspace | null
  workspaces: SandboxWorkspace[]
}

const AgentRunControllerContext = createContext<AgentRunControllerValue | null>(
  null,
)

export const AgentRunControllerProvider = ({
  children,
}: {
  children: ReactNode
}) => {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useQueryState(
    'workspace',
    parseAsString.withOptions({ history: 'replace', shallow: true }),
  )
  const [selectedAgentRunId, setSelectedAgentRunId] = useQueryState(
    'run',
    parseAsString.withOptions({ history: 'replace', shallow: true }),
  )
  const [, setSelectedIssueId] = useQueryState(
    'issue',
    parseAsString.withOptions({ history: 'replace', shallow: true }),
  )
  const [agentTaskDraft, setAgentTaskDraft] = useState('')
  const [agentReplyDraft, setAgentReplyDraft] = useState('')
  const [agentRunning, setAgentRunning] = useState(false)
  const [streamingAgentRunId, setStreamingAgentRunId] = useState<string | null>(
    null,
  )
  const [agentRunDeletingId, setAgentRunDeletingId] = useState<string | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const agentStreamAbortRef = useRef<AbortController | null>(null)

  const endpointsQuery = useQuery({
    queryKey: queryKeys.endpoints,
    queryFn: api.listEndpoints,
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
  const workspaces = useMemo(
    () => sandboxWorkspacesQuery.data?.workspaces ?? [],
    [sandboxWorkspacesQuery.data?.workspaces],
  )
  const runs = useMemo(
    () => agentRunsQuery.data?.runs ?? [],
    [agentRunsQuery.data?.runs],
  )
  const projects = useMemo(
    () => projectsQuery.data?.projects ?? [],
    [projectsQuery.data?.projects],
  )
  const issues = useMemo(
    () => issuesQuery.data?.issues ?? [],
    [issuesQuery.data?.issues],
  )
  const endpoint = useMemo(
    () =>
      endpoints.find((candidate) => candidate.enabled) ?? endpoints[0] ?? null,
    [endpoints],
  )
  const selectedWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ??
      null,
    [selectedWorkspaceId, workspaces],
  )
  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedAgentRunId) ?? null,
    [runs, selectedAgentRunId],
  )
  const selectedRunStreaming =
    Boolean(streamingAgentRunId) && selectedAgentRunId === streamingAgentRunId
  const hasActiveAgentTasks = useMemo(
    () => runs.some((run) => run.status === 'running' || run.status === 'idle'),
    [runs],
  )
  const loading =
    endpointsQuery.isFetching ||
    sandboxWorkspacesQuery.isFetching ||
    agentRunsQuery.isFetching ||
    projectsQuery.isFetching ||
    issuesQuery.isFetching
  const issuesError = getQueryErrorMessage(
    projectsQuery.error,
    issuesQuery.error,
  )
  const visibleError =
    error ??
    getQueryErrorMessage(sandboxWorkspacesQuery.error, agentRunsQuery.error)

  const buildRoute = useCallback(
    (
      pathname: string,
      updates: Record<string, string | null> = {},
    ): AppRoute => {
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

  const selectAgentRun = useCallback(
    (run: AgentRun) => {
      navigate(buildRoute('/agent', { run: run.id }))
    },
    [buildRoute, navigate],
  )

  const startNewAgentRun = useCallback(() => {
    setAgentReplyDraft('')
    setAgentTaskDraft('')
    setError(null)
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
    (nextRuns?: AgentRun[]) => {
      if (!nextRuns?.length) {
        return
      }

      queryClient.setQueryData<{ runs: AgentRun[] }>(
        queryKeys.agentRuns,
        (current) => ({
          runs: [
            ...nextRuns,
            ...(current?.runs ?? []).filter(
              (run) => !nextRuns.some((item) => item.id === run.id),
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

  const streamAgentRun = useCallback(
    async (run: AgentRun, trackedIssueId?: string) => {
      const controller = new AbortController()
      let activeAssistantMessageId: string | null = null
      let activeAssistantContent = ''
      let activeAssistantMetadata: AgentRunMessageMetadata | undefined
      const pendingToolMessages: PendingToolMessage[] = []
      let finalRun: AgentRun | null = null

      agentStreamAbortRef.current = controller
      setAgentRunning(true)
      setStreamingAgentRunId(run.id)
      setError(null)
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
            endpointId: endpoint?.id,
          },
          {
            signal: controller.signal,
            onEvent: (event) => {
              if (event.type === 'run') {
                syncActiveAssistantSegmentFromServer(event.run.messages)
                upsertAgentRunPreservingVisibleMessages(event.run, {
                  skipServerAssistantMessages: Boolean(
                    activeAssistantMessageId,
                  ),
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
                const assistantMessageId = ensureAssistantSegment(
                  event.metadata,
                )
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
                  id: pendingTool?.id ?? `tool-${crypto.randomUUID()}`,
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
                if (event.toolName === 'add_issue_comment') {
                  void refreshIssues()
                }
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
          setError(getErrorMessage(runError))
          if (trackedIssueId && finalRun) {
            await syncIssueFromRun(trackedIssueId, finalRun)
          }
        }
      } finally {
        agentStreamAbortRef.current = null
        setStreamingAgentRunId((current) =>
          current === run.id ? null : current,
        )
        setAgentRunning(false)
      }
    },
    [
      endpoint?.id,
      queryClient,
      refreshIssues,
      syncIssueFromRun,
      updateAgentRunInPlace,
      upsertAgentRunPreservingVisibleMessages,
    ],
  )

  const createAgentRun = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      if (!selectedWorkspace) {
        return
      }

      setAgentRunning(true)
      setError(null)

      try {
        const response = await api.createAgentRun({
          workspaceId: selectedWorkspace.id,
          endpointId: endpoint?.id,
          task: agentTaskDraft,
        })

        upsertAgentRun({ ...response.run, status: 'running' })
        setAgentTaskDraft('')
        await streamAgentRun(response.run)
      } catch (runError) {
        setError(getErrorMessage(runError))
      } finally {
        setAgentRunning(false)
      }
    },
    [
      agentTaskDraft,
      endpoint,
      selectedWorkspace,
      streamAgentRun,
      upsertAgentRun,
    ],
  )

  const continueAgentRun = useCallback(
    (run: AgentRun) => {
      void streamAgentRun(run)
    },
    [streamAgentRun],
  )

  const rewindAgentRun = useCallback(
    async (run: AgentRun, messageId: string) => {
      if (agentRunning) {
        return
      }

      setError(null)

      try {
        const response = await api.rewindAgentRun(run.id, { messageId })
        setAgentReplyDraft('')
        upsertAgentRun(response.run)
      } catch (rewindError) {
        setError(getErrorMessage(rewindError))
      }
    },
    [agentRunning, upsertAgentRun],
  )

  const sendAgentMessage = useCallback(async () => {
    if (!selectedRun || agentRunning || !agentReplyDraft.trim()) {
      return
    }

    setAgentRunning(true)
    setError(null)

    try {
      const updated = await api.appendAgentRunMessage(selectedRun.id, {
        content: agentReplyDraft,
      })
      setAgentReplyDraft('')
      upsertAgentRun({ ...updated.run, status: 'running' })
      await streamAgentRun(updated.run)
    } catch (runError) {
      setError(getErrorMessage(runError))
    } finally {
      setAgentRunning(false)
    }
  }, [
    agentReplyDraft,
    agentRunning,
    selectedRun,
    streamAgentRun,
    upsertAgentRun,
  ])

  const stopAgentRun = useCallback(() => {
    agentStreamAbortRef.current?.abort()
  }, [])

  const deleteAgentRun = useCallback(
    async (run: AgentRun) => {
      setAgentRunDeletingId(run.id)
      setError(null)

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
        setError(getErrorMessage(deleteError))
      } finally {
        setAgentRunDeletingId(null)
      }
    },
    [queryClient],
  )

  const startIssueRun = useCallback(
    async (issue: Issue) => {
      setError(null)

      const project = projects.find((item) => item.id === issue.projectId)
      const response = await api.continueIssueWorkflow(issue.id, {
        endpointId:
          issue.endpointId ?? project?.defaultEndpointId ?? endpoint?.id,
      })
      upsertIssue(response.issue)
      upsertAgentRunsInCache(response.runs)

      if (!response.run) {
        return
      }

      upsertAgentRun({ ...response.run, status: 'running' })
      await streamAgentRun(response.run, response.issue.id)
    },
    [
      endpoint?.id,
      projects,
      streamAgentRun,
      upsertAgentRun,
      upsertAgentRunsInCache,
      upsertIssue,
    ],
  )

  const planIssue = useCallback(
    async (issue: Issue) => {
      setError(null)

      const project = projects.find((item) => item.id === issue.projectId)
      const response = await api.planIssue(issue.id, {
        endpointId:
          issue.endpointId ?? project?.defaultEndpointId ?? endpoint?.id,
      })
      upsertIssue(response.issue)
    },
    [endpoint?.id, projects, upsertIssue],
  )

  const openAgentRun = useCallback(
    (runId: string) => {
      const existingRun = runs.find((run) => run.id === runId)

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
          setError(getErrorMessage(openError))
        })
    },
    [runs, selectAgentRun, upsertAgentRun],
  )

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
    if (!workspaces.length) {
      if (selectedWorkspaceId) {
        void setSelectedWorkspaceId(null)
      }
      return
    }

    if (
      !selectedWorkspaceId ||
      !workspaces.some((workspace) => workspace.id === selectedWorkspaceId)
    ) {
      void setSelectedWorkspaceId(workspaces[0]!.id)
    }
  }, [selectedWorkspaceId, setSelectedWorkspaceId, workspaces])

  useEffect(() => {
    if (
      selectedAgentRunId &&
      !runs.some((run) => run.id === selectedAgentRunId)
    ) {
      void setSelectedAgentRunId(null)
    }
  }, [runs, selectedAgentRunId, setSelectedAgentRunId])

  const value = useMemo<AgentRunControllerValue>(
    () => ({
      agentReplyDraft,
      agentRunning,
      agentTaskDraft,
      endpoint,
      endpoints,
      error: visibleError,
      issues,
      issuesError,
      loading,
      onAgentReplyChange: setAgentReplyDraft,
      onAgentTaskChange: setAgentTaskDraft,
      onContinueAgentRun: continueAgentRun,
      onCreateAgentRun: createAgentRun,
      onDeleteAgentRun: deleteAgentRun,
      onOpenAgentRun: openAgentRun,
      onPlanIssue: planIssue,
      onRewindAgentRun: rewindAgentRun,
      onSelectAgentRun: selectAgentRun,
      onSendAgentMessage: sendAgentMessage,
      onStartIssueRun: startIssueRun,
      onStartNewAgentRun: startNewAgentRun,
      onStopAgentRun: stopAgentRun,
      projects,
      runDeletingId: agentRunDeletingId,
      runs,
      selectedRun,
      selectedRunStreaming,
      selectedWorkspace,
      workspaces,
    }),
    [
      agentReplyDraft,
      agentRunDeletingId,
      agentRunning,
      agentTaskDraft,
      continueAgentRun,
      createAgentRun,
      deleteAgentRun,
      endpoint,
      endpoints,
      issues,
      issuesError,
      loading,
      openAgentRun,
      planIssue,
      projects,
      rewindAgentRun,
      runs,
      selectAgentRun,
      selectedRun,
      selectedRunStreaming,
      selectedWorkspace,
      sendAgentMessage,
      startIssueRun,
      startNewAgentRun,
      stopAgentRun,
      visibleError,
      workspaces,
    ],
  )

  return (
    <AgentRunControllerContext.Provider value={value}>
      {children}
    </AgentRunControllerContext.Provider>
  )
}

export const useAgentRunController = () => {
  const controller = useContext(AgentRunControllerContext)

  if (!controller) {
    throw new Error(
      'useAgentRunController must be used inside AgentRunControllerProvider',
    )
  }

  return controller
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

const isAbortError = (error: unknown) => {
  return error instanceof DOMException && error.name === 'AbortError'
}
