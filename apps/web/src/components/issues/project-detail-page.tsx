import { type FormEvent, useMemo, useState } from 'react'
import type { Issue } from '@agent-fleet/shared'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ClipboardList,
  ListChecks,
  Loader2,
  Pencil,
  RefreshCw,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-client'
import { emptyIssueDraft } from './constants'
import { EmptyState, ProjectRepositoryBadge } from './common'
import { ProjectForm } from './project-form'
import { ProjectIssuesView } from './project-issues-view'
import { ProjectTasksView } from './project-tasks-view'
import type { IssueDraft, ProjectDetailPageProps, ProjectDraft } from './types'
import {
  getErrorMessage,
  getProjectLinkedRunIds,
  normalizeIssueDraft,
  normalizeProjectDraft,
  toProjectDraft,
  upsertAgentRuns,
  upsertIssue,
  upsertProject,
} from './utils'

export const ProjectDetailPage = ({
  agentRuns,
  endpoints,
  error,
  issues,
  loading,
  onBack,
  onNavigateTab,
  onOpenRun,
  onSelectIssue,
  onStartIssueRun,
  projectId,
  projects,
  selectedEndpoint,
  selectedIssueId,
  tab,
  workspaces,
}: ProjectDetailPageProps) => {
  const queryClient = useQueryClient()
  const [localError, setLocalError] = useState<string | null>(null)
  const [projectDraft, setProjectDraft] = useState<ProjectDraft | null>(null)
  const [issueDraft, setIssueDraft] = useState<IssueDraft>(emptyIssueDraft)
  const [savingProject, setSavingProject] = useState(false)
  const [savingIssue, setSavingIssue] = useState(false)
  const [runningIssueId, setRunningIssueId] = useState<string | null>(null)
  const [editProjectOpen, setEditProjectOpen] = useState(false)

  const project = projects.find((item) => item.id === projectId) ?? null
  const projectIssues = useMemo(
    () => issues.filter((issue) => issue.projectId === projectId),
    [issues, projectId],
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
        (run) => run.projectId === projectId || linkedRunIds.has(run.id),
      ),
    [agentRuns, linkedRunIds, projectId],
  )
  const workspace = project?.workspaceId
    ? workspaces.find((item) => item.id === project.workspaceId)
    : undefined
  const visibleError = localError ?? error
  const activeProjectDraft =
    projectDraft?.targetId === projectId
      ? projectDraft
      : toProjectDraft(project, selectedEndpoint?.id)

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
      ...(current?.targetId === projectId ? current : activeProjectDraft),
      ...patch,
      targetId: projectId,
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
      return
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
      onSelectIssue(response.issue.id)
      setIssueDraft((current) => ({
        ...emptyIssueDraft,
        endpointId: current.endpointId,
      }))
    } catch (saveError) {
      setLocalError(getErrorMessage(saveError))
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
      onSelectIssue(response.issue.id)
      onNavigateTab('tasks')
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
      onSelectIssue(issue.id)
      await onStartIssueRun(issue)
    } catch (actionError) {
      setLocalError(getErrorMessage(actionError))
    } finally {
      setRunningIssueId(null)
    }
  }

  if (!project) {
    return (
      <section className="flex h-full min-h-0 items-center justify-center bg-background p-3">
        <EmptyState>
          {loading ? 'Loading project' : 'Project not found'}
        </EmptyState>
      </section>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex min-h-10 flex-col gap-2 border-b px-3 py-2 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Button onClick={onBack} size="icon-sm" type="button" variant="ghost">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{project.name}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {project.repositoryUrl || 'Repository not configured'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
      </header>

      {visibleError ? (
        <div className="border-b border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {visibleError}
        </div>
      ) : null}

      <div className="border-b bg-muted/20 px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            onClick={() => onNavigateTab('issues')}
            size="sm"
            type="button"
            variant={tab === 'issues' ? 'secondary' : 'ghost'}
          >
            <ClipboardList className="h-4 w-4" />
            Issues
          </Button>
          <Button
            onClick={() => onNavigateTab('tasks')}
            size="sm"
            type="button"
            variant={tab === 'tasks' ? 'secondary' : 'ghost'}
          >
            <ListChecks className="h-4 w-4" />
            Tasks
          </Button>
        </div>
      </div>

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

        {tab === 'issues' ? (
          <ProjectIssuesView
            createIssue={createIssue}
            endpoints={endpoints}
            issueDraft={issueDraft}
            issues={projectIssues}
            onAnalyze={analyzeIssue}
            onIssueDraftChange={setIssueDraft}
            onOpenRun={onOpenRun}
            onSelectIssue={onSelectIssue}
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
            onOpenRun={onOpenRun}
            runs={projectRuns}
          />
        )}
      </div>
    </section>
  )
}
