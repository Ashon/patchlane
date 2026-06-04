import { type FormEvent, useMemo, useState } from 'react'
import type {
  AgentProject,
  Issue,
  IssuePriority,
  LlmEndpoint,
} from '@patchlane/shared'
import { useQueryClient } from '@tanstack/react-query'
import { FileText, Folder, Loader2, Plus, Rows3 } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { navigationItems, settingsPages } from '@/components/app/app-navigation'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { getErrorMessage } from '@/lib/errors'
import { EmptyState, Field } from '@/components/issues/common'
import { formatIssueReference, upsertIssue } from '@/components/issues/utils'

const priorities = ['low', 'medium', 'high', 'urgent'] satisfies IssuePriority[]
type CommandView = 'menu' | 'project-picker' | 'issue-form'

const CommandMeta = ({ children }: { children: string }) => (
  <CommandShortcut className="max-w-24 shrink-0 self-center truncate tracking-normal">
    {children}
  </CommandShortcut>
)

const commandItemClassName = 'mx-0'
const commandItemStackedClassName = 'mx-0 h-auto min-h-10 items-center py-1.5'

const CommandItemContent = ({
  subtitle,
  title,
}: {
  subtitle?: string
  title: string
}) => (
  <div className="min-w-0 flex-1 overflow-hidden">
    <div className="truncate text-sm font-medium leading-4">{title}</div>
    {subtitle ? (
      <div className="truncate text-xs leading-4 text-muted-foreground">
        {subtitle}
      </div>
    ) : null}
  </div>
)

const commandListClassName =
  'max-h-80 scroll-py-2 overflow-x-hidden overflow-y-auto p-1'
const commandProjectListClassName =
  'max-h-72 scroll-py-2 overflow-x-hidden overflow-y-auto p-1'

export const AppCommandPalette = ({
  defaultEndpoint,
  endpoints,
  issues,
  onOpenChange,
  open,
  projects,
}: {
  defaultEndpoint: LlmEndpoint | null
  endpoints: LlmEndpoint[]
  issues: Issue[]
  onOpenChange: (open: boolean) => void
  open: boolean
  projects: AgentProject[]
}) => {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const routeProjectId = useMemo(
    () => getRouteProjectId(location.pathname),
    [location.pathname],
  )
  const defaultProject = useMemo(() => {
    const routeProject =
      projects.find((project) => project.id === routeProjectId) ?? null

    return (
      routeProject ?? (projects.length === 1 ? (projects[0] ?? null) : null)
    )
  }, [projects, routeProjectId])
  const defaultEndpointId =
    defaultProject?.defaultEndpointId ??
    defaultEndpoint?.id ??
    endpoints[0]?.id ??
    ''
  const issuesByProject = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  )
  const visibleIssues = useMemo(
    () =>
      issues
        .slice()
        .sort((first, second) =>
          second.updatedAt.localeCompare(first.updatedAt),
        )
        .slice(0, 24),
    [issues],
  )
  const [view, setView] = useState<CommandView>('menu')
  const [projectSearch, setProjectSearch] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    () => defaultProject?.id ?? null,
  )
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<IssuePriority>('medium')
  const [endpointId, setEndpointId] = useState(defaultEndpointId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? null
  const selectedEndpointId =
    endpointId ||
    selectedProject?.defaultEndpointId ||
    defaultEndpoint?.id ||
    endpoints[0]?.id ||
    ''

  const close = () => onOpenChange(false)

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setView('menu')
      setProjectSearch('')
      setError(null)
    }

    onOpenChange(nextOpen)
  }

  const navigateWithSearch = (
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
    close()
    navigate({ pathname, search: search ? `?${search}` : '' })
  }

  const startIssueFlow = () => {
    if (selectedProject) {
      setView('issue-form')
      return
    }

    setView('project-picker')
  }

  const selectProject = (project: AgentProject) => {
    setSelectedProjectId(project.id)
    setEndpointId(
      project.defaultEndpointId ??
        defaultEndpoint?.id ??
        endpoints[0]?.id ??
        '',
    )
    setProjectSearch('')
    setError(null)
    setView('issue-form')
  }

  const createIssue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!selectedProject || saving) {
      return
    }

    setSaving(true)
    setError(null)

    try {
      const response = await api.createIssue({
        description: description.trim(),
        endpointId: selectedEndpointId || undefined,
        priority,
        projectId: selectedProject.id,
        title: title.trim(),
      })

      upsertIssue(queryClient, response.issue)
      close()
      navigateToIssue(
        navigate,
        location.search,
        selectedProject.id,
        response.issue.id,
      )
    } catch (createError) {
      setError(getErrorMessage(createError))
    } finally {
      setSaving(false)
    }
  }

  const renderCommandMenu = () => (
    <Command className="bg-transparent" shouldFilter>
      <CommandInput autoFocus placeholder="Type a command or search..." />
      <CommandList className={commandListClassName}>
        <CommandEmpty>
          <div className="p-2">
            <EmptyState>No command found</EmptyState>
          </div>
        </CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem
            className={commandItemStackedClassName}
            keywords={['new issue', 'quick issue', 'create']}
            onSelect={startIssueFlow}
            value="create issue new quick"
          >
            <Plus className="h-4 w-4" />
            <CommandItemContent
              subtitle="Register work for a project"
              title="Create issue"
            />
            <CommandMeta>Action</CommandMeta>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigation">
          {navigationItems.map((item) => {
            const Icon = item.icon

            return (
              <CommandItem
                className={commandItemClassName}
                key={item.value}
                keywords={[item.path, item.value]}
                onSelect={() =>
                  navigateWithSearch(item.path, { issue: null, run: null })
                }
                value={`${item.label} ${item.path}`}
              >
                <Icon className="h-4 w-4" />
                <span className="block min-w-0 flex-1 overflow-hidden truncate">
                  {item.label}
                </span>
                <CommandMeta>Page</CommandMeta>
              </CommandItem>
            )
          })}
          <CommandItem
            className={commandItemClassName}
            keywords={['sandboxes', 'workspaces', 'workspace']}
            onSelect={() =>
              navigateWithSearch('/workspaces', { issue: null, run: null })
            }
            value="Workspaces /workspaces"
          >
            <Folder className="h-4 w-4" />
            <span className="block min-w-0 flex-1 overflow-hidden truncate">
              Workspaces
            </span>
            <CommandMeta>Page</CommandMeta>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Settings">
          {settingsPages.map((item) => {
            const Icon = item.icon

            return (
              <CommandItem
                className={commandItemClassName}
                key={item.value}
                keywords={[item.path, item.value, 'settings']}
                onSelect={() =>
                  navigateWithSearch(item.path, { issue: null, run: null })
                }
                value={`${item.label} settings ${item.path}`}
              >
                <Icon className="h-4 w-4" />
                <span className="block min-w-0 flex-1 overflow-hidden truncate">
                  {item.label}
                </span>
                <CommandMeta>Settings</CommandMeta>
              </CommandItem>
            )
          })}
        </CommandGroup>

        {projects.length ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projects">
              {projects.map((project) => (
                <CommandItem
                  className={commandItemStackedClassName}
                  key={project.id}
                  keywords={[
                    project.description,
                    project.code,
                    project.repositoryUrl ?? '',
                    project.repositoryRef ?? '',
                  ]}
                  onSelect={() =>
                    navigateWithSearch(`/projects/${project.id}/issues`, {
                      issue: null,
                      run: null,
                    })
                  }
                  value={`${project.name} project ${project.id}`}
                >
                  <Folder className="h-4 w-4" />
                  <CommandItemContent
                    subtitle={project.repositoryUrl ?? project.description}
                    title={project.name}
                  />
                  <CommandMeta>Project</CommandMeta>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}

        {visibleIssues.length ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Issues">
              {visibleIssues.map((issue) => {
                const project = issuesByProject.get(issue.projectId)
                const reference = formatIssueReference(issue, project)

                return (
                  <CommandItem
                    className={commandItemStackedClassName}
                    key={issue.id}
                    keywords={[
                      issue.description,
                      reference,
                      issue.status,
                      issue.priority,
                      project?.name ?? '',
                      project?.code ?? '',
                    ]}
                    onSelect={() =>
                      navigateWithSearch(
                        `/projects/${issue.projectId}/issues`,
                        {
                          issue: issue.id,
                          run: null,
                        },
                      )
                    }
                    value={`${reference} ${issue.title} issue ${issue.id}`}
                  >
                    <FileText className="h-4 w-4" />
                    <CommandItemContent
                      subtitle={`${project?.name ?? 'Unknown project'} · ${issue.status}`}
                      title={`${reference} ${issue.title}`}
                    />
                    <CommandMeta>{issue.priority}</CommandMeta>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </Command>
  )

  const renderProjectPicker = () => (
    <Command className="bg-transparent" shouldFilter>
      <CommandInput
        autoFocus
        onValueChange={setProjectSearch}
        placeholder="Select a project..."
        value={projectSearch}
      />
      <CommandList className={commandProjectListClassName}>
        <CommandEmpty>
          <div className="p-2">
            <EmptyState>No project found</EmptyState>
          </div>
        </CommandEmpty>
        <CommandGroup className="p-0">
          {projects.map((project) => (
            <CommandItem
              className={commandItemStackedClassName}
              key={project.id}
              keywords={[
                project.description,
                project.code,
                project.repositoryUrl ?? '',
                project.repositoryRef ?? '',
              ]}
              onSelect={() => selectProject(project)}
              value={`${project.name} ${project.id}`}
            >
              <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <CommandItemContent
                subtitle={project.repositoryUrl ?? project.description}
                title={project.name}
              />
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )

  return (
    <CommandDialog
      className={view === 'issue-form' ? 'max-w-lg' : 'max-w-sm'}
      description="Search pages, projects, issues, and actions."
      onOpenChange={handleOpenChange}
      open={open}
      title="Command menu"
    >
      {view === 'issue-form' && selectedProject ? (
        <div className="p-2">
          <form className="grid gap-3" onSubmit={createIssue}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold">Create issue</div>
                <div className="truncate text-xs text-muted-foreground">
                  Register work for a project
                </div>
              </div>
              <Button
                className="shrink-0"
                onClick={() => setView('menu')}
                size="sm"
                type="button"
                variant="ghost"
              >
                Back
              </Button>
            </div>

            <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border bg-muted/20 px-2.5 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold">
                    {selectedProject.name}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {selectedProject.repositoryUrl ??
                      selectedProject.description}
                  </div>
                </div>
              </div>
              <Button
                className="shrink-0"
                onClick={() => {
                  setSelectedProjectId(null)
                  setView('project-picker')
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                <Rows3 className="h-3.5 w-3.5" />
                Change
              </Button>
            </div>

            <Field label="Title">
              <Input
                autoFocus
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Issue title"
                required
                value={title}
              />
            </Field>

            <Field label="Description">
              <Textarea
                className="min-h-24 resize-none"
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Expected change, constraints, verification"
                required
                value={description}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
              <Field label="Priority">
                <Select
                  onValueChange={(value) => setPriority(value as IssuePriority)}
                  value={priority}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priorities.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Endpoint">
                {endpoints.length ? (
                  <Select
                    onValueChange={setEndpointId}
                    value={selectedEndpointId}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Endpoint" />
                    </SelectTrigger>
                    <SelectContent>
                      {endpoints.map((endpoint) => (
                        <SelectItem key={endpoint.id} value={endpoint.id}>
                          {endpoint.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="rounded-md border bg-muted/20 px-2.5 py-2 text-xs text-muted-foreground">
                    No endpoints configured
                  </div>
                )}
              </Field>
            </div>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
                {error}
              </div>
            ) : null}

            <div className="flex justify-end border-t pt-3">
              <Button disabled={saving} type="submit">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create issue
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {view === 'project-picker' ? renderProjectPicker() : null}
      {view === 'menu' ? renderCommandMenu() : null}
    </CommandDialog>
  )
}

const getRouteProjectId = (pathname: string) => {
  const match = /^\/projects\/([^/]+)/u.exec(pathname)

  return match?.[1]
}

const navigateToIssue = (
  navigate: ReturnType<typeof useNavigate>,
  currentSearch: string,
  projectId: string,
  issueId: string,
) => {
  const params = new URLSearchParams(currentSearch)
  params.set('issue', issueId)
  params.delete('run')

  const search = params.toString()
  navigate({
    pathname: `/projects/${projectId}/issues`,
    search: search ? `?${search}` : '',
  })
}
