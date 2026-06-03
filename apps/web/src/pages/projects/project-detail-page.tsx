import { type FormEvent, useMemo, useState } from 'react'
import type { Issue } from '@patchlane/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ClipboardList,
  ListChecks,
  Loader2,
  Pencil,
  RefreshCw,
} from 'lucide-react'
import { parseAsString, useQueryState } from 'nuqs'
import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState, ProjectRepositoryBadge } from '@/components/issues/common'
import { emptyIssueDraft } from '@/components/issues/constants'
import { ProjectForm } from '@/components/issues/project-form'
import { ProjectIssuesView } from '@/components/issues/project-issues-view'
import { ProjectTasksView } from '@/components/issues/project-tasks-view'
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
  PageToolbar,
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
  const queryClient = useQueryClient()
  const {
    agentRunning,
    onOpenAgentRun,
    onStartIssueRun,
    runs: agentRuns,
  } = useAgentRunController()
  const [localError, setLocalError] = useState<string | null>(null)
  const [projectDraft, setProjectDraft] = useState<ProjectDraft | null>(null)
  const [issueDraft, setIssueDraft] = useState<IssueDraft>(emptyIssueDraft)
  const [savingProject, setSavingProject] = useState(false)
  const [savingIssue, setSavingIssue] = useState(false)
  const [runningIssueId, setRunningIssueId] = useState<string | null>(null)
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
      endpoints.find((endpoint) => endpoint.enabled) ?? endpoints[0] ?? null,
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

  const projectExists = projects.some((project) => project.id === activeProjectId)
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

  const refreshProject = async () => {
    const [
      projectResponse,
      issueResponse,
      workspaceResponse,
      agentRunResponse,
    ] = await Promise.all([
      api.listProjects(),
      api.listIssues(),
      api.listSandboxWorkspaces(),
      api.listAgentRuns(),
    ])
    queryClient.setQueryData(queryKeys.projects, projectResponse)
    queryClient.setQueryData(queryKeys.issues, issueResponse)
    queryClient.setQueryData(queryKeys.sandboxWorkspaces, workspaceResponse)
    queryClient.setQueryData(queryKeys.agentRuns, agentRunResponse)
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

  const analyzeIssue = async (issue: Issue) => {
    setRunningIssueId(issue.id)
    setLocalError(null)

    try {
      const response = await api.analyzeIssue(issue.id, {
        endpointId:
          issue.endpointId ??
          project?.defaultEndpointId ??
          selectedEndpoint?.id,
      })
      upsertIssue(queryClient, response.issue)
      upsertAgentRuns(queryClient, response.runs)
      void setSelectedIssueId(response.issue.id)
      navigate(buildRoute(`/projects/${activeProjectId}/tasks`))
    } catch (actionError) {
      setLocalError(getErrorMessage(actionError))
    } finally {
      setRunningIssueId(null)
    }
  }

  const startIssue = async (issue: Issue) => {
    setRunningIssueId(issue.id)
    setLocalError(null)

    try {
      void setSelectedIssueId(issue.id)
      await onStartIssueRun(issue)
    } catch (actionError) {
      setLocalError(getErrorMessage(actionError))
    } finally {
      setRunningIssueId(null)
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

  return (
    <Page>
      <PageHeader
        actions={
          <>
          <ProjectRepositoryBadge project={project} />
          <Badge variant="secondary">{projectIssues.length} issues</Badge>
          <Badge variant="secondary">{projectRuns.length} tasks</Badge>
          {workspace ? <Badge variant="outline">{workspace.name}</Badge> : null}
          <Button
            disabled={loading}
            onClick={() => void refreshProject()}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
          <Button
            onClick={() => setEditProjectOpen(true)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          </>
        }
        description={project.repositoryUrl || 'Repository not configured'}
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

      <PageToolbar>
          <Button
            onClick={() => navigate(buildRoute(`/projects/${activeProjectId}/issues`))}
            size="sm"
            type="button"
            variant={selectedTab === 'issues' ? 'secondary' : 'ghost'}
          >
            <ClipboardList className="h-4 w-4" />
            Issues
          </Button>
          <Button
            onClick={() => navigate(buildRoute(`/projects/${activeProjectId}/tasks`))}
            size="sm"
            type="button"
            variant={selectedTab === 'tasks' ? 'secondary' : 'ghost'}
          >
            <ListChecks className="h-4 w-4" />
            Tasks
          </Button>
      </PageToolbar>

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
            issueDraft={issueDraft}
            issues={projectIssues}
            onAnalyze={analyzeIssue}
            onIssueDraftChange={setIssueDraft}
            onOpenRun={onOpenAgentRun}
            onSelectIssue={(id) => void setSelectedIssueId(id)}
            onStart={startIssue}
            project={project}
            runById={runById}
            runningIssueId={runningIssueId}
            savingIssue={savingIssue}
            selectedEndpoint={selectedEndpoint}
            selectedIssue={selectedIssue}
            workspaces={workspaces}
          />
        ) : (
          <ProjectTasksView
            issues={projectIssues}
            onOpenRun={onOpenAgentRun}
            runs={projectRuns}
          />
        )}
      </div>
    </Page>
  )
}
