import { type FormEvent, useState } from 'react'
import type { CreateAgentProjectInput } from '@agent-fleet/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Layers3, Loader2, Plus, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-client'
import { EmptyState, MetricBadge, ProjectRepositoryBadge } from './common'
import { ProjectForm } from './project-form'
import type { ProjectDraft, ProjectsListPageProps } from './types'
import {
  getErrorMessage,
  normalizeProjectDraft,
  toProjectDraft,
  upsertProject,
} from './utils'

export const ProjectsListPage = ({
  endpoints,
  error,
  issues,
  loading,
  onOpenProject,
  projects,
  selectedEndpoint,
  workspaces,
}: ProjectsListPageProps) => {
  const queryClient = useQueryClient()
  const [localError, setLocalError] = useState<string | null>(null)
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(() =>
    toProjectDraft(null, selectedEndpoint?.id),
  )
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [savingProject, setSavingProject] = useState(false)
  const visibleError = localError ?? error

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
      onOpenProject(response.project.id)
    } catch (saveError) {
      setLocalError(getErrorMessage(saveError))
    } finally {
      setSavingProject(false)
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <main className="flex min-h-[520px] flex-col xl:min-h-0">
        <div className="flex min-h-10 items-center justify-between border-b px-3 py-2">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Layers3 className="h-4 w-4" />
              Projects
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              Repository-scoped coding workspaces and issues
            </p>
          </div>
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
        </div>

        {visibleError ? (
          <div className="border-b border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {visibleError}
          </div>
        ) : null}

        <ScrollArea className="min-h-0 flex-1">
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
                    onClick={() => onOpenProject(project.id)}
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
        </ScrollArea>
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
    </section>
  )
}
