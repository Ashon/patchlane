import { type FormEvent, useMemo, useState } from 'react'
import type { Issue } from '@patchlane/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ClipboardList,
  ListChecks,
  Pencil,
} from 'lucide-react'
import { parseAsString, useQueryState } from 'nuqs'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '@patchlane/ui/badge'
import { Button } from '@patchlane/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@patchlane/ui/dialog'
import { EmptyState, ProjectRepositoryBadge } from '@/components/issues/common'
import { emptyIssueDraft } from '@/components/issues/constants'
import { ProjectForm } from '@/components/issues/project-form'
import { ProjectIssuesView } from '@/components/issues/project-issues-view'
import { ProjectTasksView } from '@/components/issues/project-tasks-view'
import { buildTaskWorkItems } from '@/components/issues/task-work-items'
import type {
  IssueDraft,
  ProjectDetailTab,
  ProjectDraft,
} from '@/components/issues/types'
import {
  getErrorMessage,
  getProjectLinkedRunIds,
  normalizeIssueDraft,
  normalizeProjectDraft,
  toProjectDraft,
  upsertAgentRuns,
  upsertIssue,
  upsertProject,
} from '@/components/issues/utils'
import {
  ErrorBanner,
  Page,
  PageHeader,
} from '@/components/layout/page-primitives'
import { api } from '@/lib/api'
import { getQueryErrorMessage } from '@/lib/errors'
import { queryKeys } from '@/lib/query-client'
import { useAgentRunController } from '@/pages/agent/agent-run-controller'

export const ProjectDetailPage = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { projectId, tab } = useParams<{ projectId: string; tab?: string }>()
  const [selectedIssueId, setSelectedIssueId] = useQueryState(
    'issue',
    parseAsString.withOptions({ history: 'replace', shallow: true }),
  )
  const [, setSelectedAgentRunId] = useQueryState(
    'run',
    parseAsString.withOptions({ history: 'replace', shallow: true }),
  )
  const queryClient = useQueryClient()
  const {
    agentReplyDraft,
    agentRunning,
    endpoint,
    error: agentRunError,
    onAgentReplyChange,
    onContinueAgentRun,
    onPlanIssue,
    onRewindAgentRun,
    onSendAgentMessage,
    onStartIssueRun,
    onStopAgentRun,
    runs: agentRuns,
    selectedRun,
    selectedRunStreaming,
  } = useAgentRunController()
  const [localError, setLocalError] = useState<string | null>(null)
  const [projectDraft, setProjectDraft] = useState<ProjectDraft | null>(null)
  const [issueDraft, setIssueDraft] = useState<IssueDraft>(emptyIssueDraft)
  const [savingProject, setSavingProject] = useState(false)
  const [savingIssue, setSavingIssue] = useState(false)
  const [planningIssueId, setPlanningIssueId] = useState<string | null>(null)
  const [runningIssueId, setRunningIssueId] = useState<string | null>(null)
  const [finalizingIssueId, setFinalizingIssueId] = useState<string | null>(
    null,
  )
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null)
  const [editProjectOpen, setEditProjectOpen] = useState(false)
  const endpointsQuery = useQuery({
    queryKey: queryKeys.endpoints,
    queryFn: api.listEndpoints,
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
  const workspacesQuery = useQuery({
    queryKey: queryKeys.sandboxWorkspaces,
    queryFn: api.listSandboxWorkspaces,
  })
  const endpoints = useMemo(
    () => endpointsQuery.data?.endpoints ?? [],
    [endpointsQuery.data?.endpoints],
  )
  const projects = useMemo(
    () => projectsQuery.data?.projects ?? [],
    [projectsQuery.data?.projects],
  )
  const issues = useMemo(
    () => issuesQuery.data?.issues ?? [],
    [issuesQuery.data?.issues],
  )
  const workspaces = useMemo(
    () => workspacesQuery.data?.workspaces ?? [],
    [workspacesQuery.data?.workspaces],
  )
  const selectedEndpoint = useMemo(
    () =>
      endpoints.find(
        (endpoint) =>
          endpoint.runtimeType === 'openai_compatible' && endpoint.enabled,
      ) ??
      endpoints.find((endpoint) => endpoint.runtimeType === 'openai_compatible') ??
      null,
    [endpoints],
  )
  const loading =
    endpointsQuery.isFetching ||
    projectsQuery.isFetching ||
    issuesQuery.isFetching ||
    workspacesQuery.isFetching
  const error = getQueryErrorMessage(projectsQuery.error, issuesQuery.error)
  const activeProjectId = projectId ?? ''
  const selectedTab: ProjectDetailTab = tab === 'tasks' ? 'tasks' : 'issues'

  const buildRoute = (
    pathname: string,
    updates: Record<string, string | null> = {},
  ) => {
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
  }

  const projectExists = projects.some(
    (project) => project.id === activeProjectId,
  )
  const project = projects.find((item) => item.id === activeProjectId) ?? null
  const projectIssues = useMemo(
    () => issues.filter((issue) => issue.projectId === activeProjectId),
    [activeProjectId, issues],
  )
  const selectedIssue =
    projectIssues.find((issue) => issue.id === selectedIssueId) ?? null
  const runById = useMemo(
    () => new Map(agentRuns.map((run) => [run.id, run])),
    [agentRuns],
  )
  const linkedRunIds = useMemo(
    () => getProjectLinkedRunIds(projectIssues),
    [projectIssues],
  )
  const projectRuns = useMemo(
    () =>
      agentRuns.filter(
        (run) => run.projectId === activeProjectId || linkedRunIds.has(run.id),
      ),
    [activeProjectId, agentRuns, linkedRunIds],
  )
  const projectTaskItems = useMemo(
    () => buildTaskWorkItems({ issues: projectIssues, runs: projectRuns }),
    [projectIssues, projectRuns],
  )
  const selectedProjectRun =
    selectedRun && projectRuns.some((run) => run.id === selectedRun.id)
      ? selectedRun
      : null
  const selectedProjectRunStreaming =
    selectedProjectRun && selectedRun?.id === selectedProjectRun.id
      ? selectedRunStreaming
      : false
  const openProjectTaskRun = (runId: string) => {
    navigate(
      buildRoute(`/projects/${activeProjectId}/tasks`, {
        issue: null,
        run: runId,
      }),
    )
  }
  const workspace = project?.workspaceId
    ? workspaces.find((item) => item.id === project.workspaceId)
    : undefined
  const visibleError = localError ?? error
  const activeProjectDraft =
    projectDraft?.targetId === activeProjectId
      ? projectDraft
      : toProjectDraft(project, selectedEndpoint?.id)

  if (!projectId) {
    return <Navigate replace to={buildRoute('/projects')} />
  }

  if (!tab) {
    return (
      <Navigate
        replace
        to={buildRoute(`/projects/${activeProjectId}/issues`, {
          project: null,
        })}
      />
    )
  }

  if (!loading && projects.length > 0 && !projectExists) {
    return (
      <Navigate
        replace
        to={buildRoute('/projects', { issue: null, project: null })}
      />
    )
  }

  const updateProjectDraft = (patch: Partial<ProjectDraft>) => {
    setProjectDraft((current) => ({
      ...(current?.targetId === activeProjectId ? current : activeProjectDraft),
      ...patch,
      targetId: activeProjectId,
    }))
  }

  const saveProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!project) {
      return
    }

    setSavingProject(true)
    setLocalError(null)

    try {
      const response = await api.updateProject(
        project.id,
        normalizeProjectDraft(activeProjectDraft),
      )
      const workspaceResponse = await api.listSandboxWorkspaces()

      upsertProject(queryClient, response.project)
      queryClient.setQueryData(queryKeys.sandboxWorkspaces, workspaceResponse)
      setProjectDraft(toProjectDraft(response.project))
    } catch (saveError) {
      setLocalError(getErrorMessage(saveError))
    } finally {
      setSavingProject(false)
    }
  }

  const createIssue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!project) {
      return false
    }

    setSavingIssue(true)
    setLocalError(null)

    try {
      const response = await api.createIssue(
        normalizeIssueDraft(
          issueDraft,
          project.id,
          issueDraft.endpointId ||
            project.defaultEndpointId ||
            selectedEndpoint?.id,
        ),
      )
      upsertIssue(queryClient, response.issue)
      void setSelectedIssueId(response.issue.id)
      setIssueDraft((current) => ({
        ...emptyIssueDraft,
        endpointId: current.endpointId,
      }))
      return true
    } catch (saveError) {
      setLocalError(getErrorMessage(saveError))
      return false
    } finally {
      setSavingIssue(false)
    }
  }

  const startIssue = async (issue: Issue) => {
    setRunningIssueId(issue.id)
    setLocalError(null)

    try {
      void setSelectedIssueId(issue.id)
      await onStartIssueRun(issue, {
        onRunStarted: (run) => openProjectTaskRun(run.id),
      })
    } catch (actionError) {
      setLocalError(getErrorMessage(actionError))
    } finally {
      setRunningIssueId(null)
    }
  }

  const planIssue = async (issue: Issue) => {
    setPlanningIssueId(issue.id)
    setLocalError(null)

    try {
      void setSelectedIssueId(issue.id)
      await onPlanIssue(issue)
    } catch (actionError) {
      setLocalError(getErrorMessage(actionError))
    } finally {
      setPlanningIssueId(null)
    }
  }

  const startIssueTask = async (
    issue: Issue,
    task: Issue['subtasks'][number],
  ) => {
    setUpdatingTaskId(task.id)
    setLocalError(null)

    try {
      const response = await api.startIssueTask(issue.id, task.id, {
        agentRuntime: project?.defaultAgentRuntime ?? 'patchlane',
        agentRuntimeConnectorId: project?.defaultAgentRuntimeConnectorId,
        endpointId:
          issue.endpointId || project?.defaultEndpointId || selectedEndpoint?.id,
      })

      upsertIssue(queryClient, response.issue)
      upsertAgentRuns(queryClient, response.runs ?? [response.run])
      openProjectTaskRun(response.run.id)
    } catch (actionError) {
      setLocalError(getErrorMessage(actionError))
    } finally {
      setUpdatingTaskId(null)
    }
  }

  const updateIssueTaskStatus = async (
    issue: Issue,
    task: Issue['subtasks'][number],
    status: Issue['subtasks'][number]['status'],
  ) => {
    setUpdatingTaskId(task.id)
    setLocalError(null)

    try {
      const response = await api.updateIssueTask(issue.id, task.id, { status })
      upsertIssue(queryClient, response.issue)
    } catch (actionError) {
      setLocalError(getErrorMessage(actionError))
    } finally {
      setUpdatingTaskId(null)
    }
  }

  const finalizeIssue = async (issue: Issue) => {
    setFinalizingIssueId(issue.id)
    setLocalError(null)

    try {
      const response = await api.finalizeIssue(issue.id)
      upsertIssue(queryClient, response.issue)
    } catch (actionError) {
      setLocalError(getErrorMessage(actionError))
    } finally {
      setFinalizingIssueId(null)
    }
  }

  if (!project) {
    return (
      <Page className="items-center justify-center p-3">
        <EmptyState>
          {loading ? 'Loading project' : 'Project not found'}
        </EmptyState>
      </Page>
    )
  }

  const projectDetailNavigation = (
    <>
      <Button
        onClick={() =>
          navigate(buildRoute(`/projects/${activeProjectId}/issues`))
        }
        size="sm"
        type="button"
        variant={selectedTab === 'issues' ? 'default' : 'ghost'}
      >
        <ClipboardList className="h-4 w-4" />
        Issues
      </Button>
      <Button
        onClick={() =>
          navigate(buildRoute(`/projects/${activeProjectId}/tasks`))
        }
        size="sm"
        type="button"
        variant={selectedTab === 'tasks' ? 'default' : 'ghost'}
      >
        <ListChecks className="h-4 w-4" />
        Tasks
      </Button>
    </>
  )

  return (
    <Page>
      <PageHeader
        actions={
          <>
            <ProjectRepositoryBadge
              className="h-7 px-2 text-xs"
              project={project}
            />
            <Badge className="h-7 px-2 text-xs" variant="secondary">
              {projectIssues.length} issues
            </Badge>
            <Badge className="h-7 px-2 text-xs" variant="secondary">
              {projectTaskItems.length} tasks
            </Badge>
            {workspace ? (
              <Badge className="h-7 px-2 text-xs" variant="outline">
                {workspace.name}
              </Badge>
            ) : null}
            <Button
              className="bg-background"
              onClick={() => setEditProjectOpen(true)}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </>
        }
        description={project.repositoryUrl || undefined}
        leading={
          <Button
            onClick={() =>
              navigate(buildRoute('/projects', { issue: null, project: null }))
            }
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
        title={project.name}
      />

      <ErrorBanner message={visibleError} />

      <div className="min-h-0 flex-1 overflow-hidden">
        <Dialog onOpenChange={setEditProjectOpen} open={editProjectOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Project</DialogTitle>
              <DialogDescription>Update the project settings</DialogDescription>
            </DialogHeader>
            <ProjectForm
              draft={activeProjectDraft}
              endpoints={endpoints}
              onChange={updateProjectDraft}
              onSubmit={saveProject}
              saving={savingProject}
              submitLabel="Save"
              workspaces={workspaces}
            />
          </DialogContent>
        </Dialog>

        {selectedTab === 'issues' ? (
          <ProjectIssuesView
            createIssue={createIssue}
            endpoints={endpoints}
            finalizingIssueId={finalizingIssueId}
            issueDraft={issueDraft}
            issues={projectIssues}
            onFinalize={finalizeIssue}
            onIssueDraftChange={setIssueDraft}
            onOpenRun={openProjectTaskRun}
            onPlan={planIssue}
            onSelectIssue={(id) => void setSelectedIssueId(id)}
            onStart={startIssue}
            onStartTask={startIssueTask}
            onUpdateTaskStatus={updateIssueTaskStatus}
            planningIssueId={planningIssueId}
            project={project}
            runById={runById}
            runningIssueId={runningIssueId}
            savingIssue={savingIssue}
            selectedEndpoint={selectedEndpoint}
            selectedIssue={selectedIssue}
            toolbarLeading={projectDetailNavigation}
            updatingTaskId={updatingTaskId}
            workspaces={workspaces}
          />
        ) : (
          <ProjectTasksView
            agentReplyDraft={agentReplyDraft}
            endpoint={endpoint}
            error={agentRunError}
            issues={projectIssues}
            onAgentReplyChange={onAgentReplyChange}
            onContinueRun={onContinueAgentRun}
            onRewindRun={onRewindAgentRun}
            onSelectRun={(runId) => void setSelectedAgentRunId(runId)}
            onSendMessage={onSendAgentMessage}
            onStopRun={onStopAgentRun}
            project={project}
            runs={projectRuns}
            selectedRun={selectedProjectRun}
            selectedRunStreaming={selectedProjectRunStreaming}
            toolbarLeading={projectDetailNavigation}
          />
        )}
      </div>
    </Page>
  )
}
