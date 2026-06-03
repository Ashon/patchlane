import { type FormEvent, useMemo, useState } from 'react'
import type { CreateAgentProjectInput } from '@patchlane/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Layers3, Loader2, Plus, RefreshCw } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  EmptyState,
  MetricBadge,
  ProjectRepositoryBadge,
} from '@/components/issues/common'
import { ProjectForm } from '@/components/issues/project-form'
import type { ProjectDraft } from '@/components/issues/types'
import {
  getErrorMessage,
  normalizeProjectDraft,
  toProjectDraft,
  upsertProject,
} from '@/components/issues/utils'
import {
  ErrorBanner,
  Page,
  PageHeader,
  PageScroll,
} from '@/components/layout/page-primitives'
import { api } from '@/lib/api'
import { getQueryErrorMessage } from '@/lib/errors'
import { queryKeys } from '@/lib/query-client'
import { useAgentRunController } from '@/pages/agent/agent-run-controller'

export const ProjectsListPage = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { agentRunning } = useAgentRunController()
  const [localError, setLocalError] = useState<string | null>(null)
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
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(() =>
    toProjectDraft(null, selectedEndpoint?.id),
  )
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [savingProject, setSavingProject] = useState(false)
  const visibleError =
    localError ?? getQueryErrorMessage(projectsQuery.error, issuesQuery.error)

  const buildRoute = (
    pathname: string,
    updates: Record<string, string | null>,
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

  const openProject = (id: string) => {
    navigate(
      buildRoute(`/projects/${id}/issues`, {
        issue: null,
        project: null,
      }),
    )
  }

  const refreshProjects = async () => {
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

  const resetDraft = () => {
    setLocalError(null)
    setProjectDraft(toProjectDraft(null, selectedEndpoint?.id))
    setProjectDialogOpen(true)
  }

  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSavingProject(true)
    setLocalError(null)

    try {
      const response = await api.createProject(
        normalizeProjectDraft(projectDraft) as CreateAgentProjectInput,
      )
      const workspaceResponse = await api.listSandboxWorkspaces()

      upsertProject(queryClient, response.project)
      queryClient.setQueryData(queryKeys.sandboxWorkspaces, workspaceResponse)
      setProjectDraft(toProjectDraft(null, selectedEndpoint?.id))
      setProjectDialogOpen(false)
      openProject(response.project.id)
    } catch (saveError) {
      setLocalError(getErrorMessage(saveError))
    } finally {
      setSavingProject(false)
    }
  }

  return (
    <Page>
      <main className="flex min-h-[520px] flex-col xl:min-h-0">
        <PageHeader
          actions={
            <div className="flex items-center gap-1">
            <Button
              disabled={loading}
              onClick={() => void refreshProjects()}
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
              onClick={resetDraft}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Plus />
              New
            </Button>
          </div>
          }
          description="Repository-scoped coding workspaces and issues"
          icon={<Layers3 className="h-4 w-4" />}
          title="Projects"
        />

        <ErrorBanner message={visibleError} />

        <PageScroll>
          {projects.length ? (
            <div className="divide-y">
              {projects.map((project) => {
                const projectIssues = issues.filter(
                  (issue) => issue.projectId === project.id,
                )
                const activeCount = projectIssues.filter((issue) =>
                  ['planning', 'running', 'awaiting_user', 'review'].includes(
                    issue.status,
                  ),
                ).length

                return (
                  <button
                    className="grid w-full gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/70 md:grid-cols-[minmax(0,1fr)_auto]"
                    key={project.id}
                    onClick={() => openProject(project.id)}
                    type="button"
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold">
                          {project.name}
                        </span>
                        <ProjectRepositoryBadge project={project} />
                        {project.repositoryRef ? (
                          <Badge variant="outline">
                            {project.repositoryRef}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {project.repositoryUrl || 'Repository not configured'}
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {project.description}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 md:justify-end">
                      <MetricBadge
                        label="Issues"
                        value={projectIssues.length}
                      />
                      <MetricBadge label="Active" value={activeCount} />
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="p-3">
              <EmptyState>No projects</EmptyState>
            </div>
          )}
        </PageScroll>
      </main>

      <Dialog onOpenChange={setProjectDialogOpen} open={projectDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Connect a repository or workspace, then manage issues and scoped
              agent tasks.
            </DialogDescription>
          </DialogHeader>
          <ProjectForm
            draft={projectDraft}
            endpoints={endpoints}
            onChange={(patch) =>
              setProjectDraft((current) => ({ ...current, ...patch }))
            }
            onSubmit={createProject}
            saving={savingProject}
            submitLabel="Create"
            workspaces={workspaces}
          />
        </DialogContent>
      </Dialog>
    </Page>
  )
}
