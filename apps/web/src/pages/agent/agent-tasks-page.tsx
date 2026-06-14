import type {
  AgentProject,
  AgentRun,
  AgentRuntime,
  Issue,
  LlmEndpoint,
  SandboxWorkspace,
} from '@patchlane/shared'
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  Bot,
  Loader2,
  MoreHorizontal,
  Plus,
  Square,
  Trash2,
} from 'lucide-react'
import { Badge } from '@patchlane/ui/badge'
import { Button } from '@patchlane/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@patchlane/ui/select'
import { Textarea } from '@patchlane/ui/textarea'
import { EmptyState, Field } from '@/components/app/panel-primitives'
import { StateBadge } from '@/components/app/status-badges'
import { AgentTaskConversation } from '@/components/agent/agent-task-conversation'
import {
  AgentRunStatusBadge,
  IssueReferenceBadge,
  IssueTaskStatusBadge,
} from '@/components/issues/common'
import {
  buildTaskWorkItems,
  type TaskWorkItem,
} from '@/components/issues/task-work-items'
import { TaskRunMetricBadge } from '@/components/issues/task-list-meta'
import { formatIssueReference } from '@/components/issues/utils'
import {
  ErrorBanner,
  PageHeader,
  PageList,
  PageListItem,
  PagePane,
  PageScroll,
  PageSplit,
} from '@/components/layout/page-primitives'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useResizableDefaultLayout,
} from '@patchlane/ui/resizable'
import { cn } from '@/lib/utils'
import { useAgentRunController } from './agent-run-controller'

const agentTaskPanelIds = ['task-list', 'task-content']
const agentTaskResizableMediaQuery = '(min-width: 640px)'

export const AgentTasksPage = () => {
  const {
    agentReplyDraft,
    agentRunning,
    agentRuntimeConnector,
    agentRuntimeDraft,
    agentTaskDraft,
    endpoint,
    endpoints,
    error,
    issues,
    onAgentReplyChange,
    onAgentRunRuntimeChange,
    onAgentRuntimeChange,
    onAgentTaskChange,
    onContinueAgentRun,
    onCreateAgentRun,
    onDeleteAgentRun,
    onRewindAgentRun,
    onSelectAgentRun,
    onSendAgentMessage,
    onStartNewAgentRun,
    onStopAgentRun,
    projects,
    runDeletingId,
    runs,
    selectedRun,
    selectedRunStreaming,
    selectedWorkspace,
  } = useAgentRunController()
  const issueById = useMemo(
    () => new Map(issues.map((issue) => [issue.id, issue])),
    [issues],
  )
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  )
  const taskItems = useMemo(
    () => buildTaskWorkItems({ issues, runs }),
    [issues, runs],
  )
  const agentTaskLayout = useResizableDefaultLayout({
    id: 'patchlane-agent-tasks-layout',
    panelIds: agentTaskPanelIds,
  })
  const [resizableLayoutEnabled, setResizableLayoutEnabled] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia(agentTaskResizableMediaQuery).matches,
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia(agentTaskResizableMediaQuery)
    const syncResizableLayout = () =>
      setResizableLayoutEnabled(mediaQuery.matches)

    syncResizableLayout()
    mediaQuery.addEventListener('change', syncResizableLayout)

    return () => mediaQuery.removeEventListener('change', syncResizableLayout)
  }, [])

  const taskListPane = (
    <AgentTaskListPane
      agentRunning={agentRunning}
      issueById={issueById}
      onSelectAgentRun={onSelectAgentRun}
      onStartNewAgentRun={onStartNewAgentRun}
      projectById={projectById}
      items={taskItems}
      selectedRun={selectedRun}
      variant={resizableLayoutEnabled ? 'resizable' : 'stacked'}
    />
  )
  const taskContentPane = (
    <AgentTaskContentPane
      agentReplyDraft={agentReplyDraft}
      agentRunning={agentRunning}
      agentRuntimeConnector={agentRuntimeConnector}
      agentRuntimeDraft={agentRuntimeDraft}
      agentTaskDraft={agentTaskDraft}
      endpoint={endpoint}
      endpoints={endpoints}
      error={error}
      issueById={issueById}
      projectById={projectById}
      onAgentReplyChange={onAgentReplyChange}
      onAgentRunRuntimeChange={onAgentRunRuntimeChange}
      onAgentRuntimeChange={onAgentRuntimeChange}
      onAgentTaskChange={onAgentTaskChange}
      onContinueAgentRun={onContinueAgentRun}
      onCreateAgentRun={onCreateAgentRun}
      onDeleteAgentRun={onDeleteAgentRun}
      onRewindAgentRun={onRewindAgentRun}
      onSendAgentMessage={onSendAgentMessage}
      onStopAgentRun={onStopAgentRun}
      runDeletingId={runDeletingId}
      selectedRun={selectedRun}
      selectedRunStreaming={selectedRunStreaming}
      selectedWorkspace={selectedWorkspace}
    />
  )

  if (resizableLayoutEnabled) {
    return (
      <section className="h-full min-h-0 overflow-hidden bg-background">
        <ResizablePanelGroup
          className="min-w-0"
          defaultLayout={agentTaskLayout.defaultLayout}
          direction="horizontal"
          id="patchlane-agent-tasks-layout"
          onLayoutChanged={agentTaskLayout.onLayoutChanged}
        >
          <ResizablePanel
            className="min-w-0 overflow-hidden"
            defaultSize="30%"
            id="task-list"
            maxSize="520px"
            minSize="240px"
          >
            {taskListPane}
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel
            className="min-w-0 overflow-hidden"
            defaultSize="70%"
            id="task-content"
            minSize="320px"
          >
            {taskContentPane}
          </ResizablePanel>
        </ResizablePanelGroup>
      </section>
    )
  }

  return (
    <PageSplit variant="wide-list">
      {taskListPane}
      {taskContentPane}
    </PageSplit>
  )
}

const AgentTaskListPane = ({
  agentRunning,
  items,
  issueById,
  onSelectAgentRun,
  onStartNewAgentRun,
  projectById,
  selectedRun,
  variant,
}: {
  agentRunning: boolean
  items: TaskWorkItem[]
  issueById: Map<string, Issue>
  onSelectAgentRun: (run: AgentRun) => void
  onStartNewAgentRun: () => void
  projectById: Map<string, AgentProject>
  selectedRun: AgentRun | null
  variant: 'resizable' | 'stacked'
}) => {
  return (
    <PagePane
      className={cn(
        'overflow-hidden',
        variant === 'resizable' ? 'h-full' : 'border-b',
      )}
      minHeight="compact"
    >
      <PageHeader
        actions={
          <Button
            disabled={agentRunning}
            onClick={onStartNewAgentRun}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus />
            New
          </Button>
        }
        description="Coding agent runs and task history"
        icon={<Bot className="h-4 w-4" />}
        title="Agent tasks"
      />
      <PageScroll className="min-h-[220px] min-w-0">
        {items.length ? (
          <PageList>
            {items.map((item) => {
              if (item.type === 'issueTask') {
                const run = item.run

                return (
                  <AgentIssueTaskCard
                    item={item}
                    key={item.id}
                    onSelect={run ? () => onSelectAgentRun(run) : undefined}
                    project={projectById.get(item.issue.projectId)}
                    selected={run ? selectedRun?.id === run.id : false}
                  />
                )
              }

              return (
                <AgentRunCard
                  key={item.id}
                  onSelect={() => onSelectAgentRun(item.run)}
                  issue={
                    item.run.issueId
                      ? issueById.get(item.run.issueId)
                      : undefined
                  }
                  project={
                    item.run.projectId
                      ? projectById.get(item.run.projectId)
                      : undefined
                  }
                  run={item.run}
                  selected={selectedRun?.id === item.run.id}
                />
              )
            })}
          </PageList>
        ) : (
          <div className="p-2">
            <EmptyState>No tasks</EmptyState>
          </div>
        )}
      </PageScroll>
    </PagePane>
  )
}

const AgentTaskContentPane = ({
  agentReplyDraft,
  agentRunning,
  agentRuntimeConnector,
  agentRuntimeDraft,
  agentTaskDraft,
  endpoint,
  endpoints,
  error,
  issueById,
  projectById,
  onAgentReplyChange,
  onAgentRunRuntimeChange,
  onAgentRuntimeChange,
  onAgentTaskChange,
  onContinueAgentRun,
  onCreateAgentRun,
  onDeleteAgentRun,
  onRewindAgentRun,
  onSendAgentMessage,
  onStopAgentRun,
  runDeletingId,
  selectedRun,
  selectedRunStreaming,
  selectedWorkspace,
}: {
  agentReplyDraft: string
  agentRunning: boolean
  agentRuntimeConnector: LlmEndpoint | null
  agentRuntimeDraft: AgentRuntime
  agentTaskDraft: string
  endpoint: LlmEndpoint | null
  endpoints: LlmEndpoint[]
  error: string | null
  issueById: Map<string, Issue>
  projectById: Map<string, AgentProject>
  onAgentReplyChange: (value: string) => void
  onAgentRunRuntimeChange: (run: AgentRun, runtime: AgentRuntime) => void
  onAgentRuntimeChange: (value: AgentRuntime) => void
  onAgentTaskChange: (value: string) => void
  onContinueAgentRun: (run: AgentRun) => void
  onCreateAgentRun: (event: FormEvent<HTMLFormElement>) => void
  onDeleteAgentRun: (run: AgentRun) => void
  onRewindAgentRun: (run: AgentRun, messageId: string) => void
  onSendAgentMessage: () => void
  onStopAgentRun: () => void
  runDeletingId: string | null
  selectedRun: AgentRun | null
  selectedRunStreaming: boolean
  selectedWorkspace: SandboxWorkspace | null
}) => {
  const selectedIssue = selectedRun?.issueId
    ? issueById.get(selectedRun.issueId)
    : undefined
  const selectedProject = selectedIssue
    ? projectById.get(selectedIssue.projectId)
    : selectedRun?.projectId
      ? projectById.get(selectedRun.projectId)
      : undefined
  const selectedRunStoppable = selectedRun
    ? isStoppableAgentRun(selectedRun)
    : false

  return (
    <PagePane className="h-full" minHeight="detail">
      <PageHeader
        actions={
          <AgentTaskHeaderActions>
            {!selectedWorkspace ? (
              <StateBadge tone="warning">No workspace</StateBadge>
            ) : null}
            {selectedRun ? (
              <>
                <AgentRunStatusBadge status={selectedRun.status} />
                <TaskRunMetricBadge
                  className="max-w-[220px] sm:max-w-[280px]"
                  includeAwaitingUser={false}
                  run={selectedRun}
                />
              </>
            ) : null}
            {selectedRun?.context ? (
              <AgentRunContextBadge context={selectedRun.context} />
            ) : null}
            {selectedRunStoppable ? (
              <Button
                className="border-destructive/40 bg-background text-destructive shadow-xs hover:bg-destructive/10 hover:text-destructive dark:border-destructive/50"
                disabled={runDeletingId === selectedRun?.id}
                onClick={() => void onStopAgentRun()}
                size="xs"
                type="button"
                variant="outline"
              >
                <Square />
                Stop
              </Button>
            ) : null}
            {selectedRun ? (
              <TaskActionsMenu
                deleting={runDeletingId === selectedRun.id}
                onDelete={() => onDeleteAgentRun(selectedRun)}
              />
            ) : null}
          </AgentTaskHeaderActions>
        }
        description={getAgentTaskHeaderDescription(
          selectedRun,
          selectedWorkspace,
          selectedIssue,
          selectedProject,
        )}
        icon={<Bot className="h-4 w-4" />}
        title={
          selectedRun
            ? getAgentTaskHeaderTitle(selectedRun, selectedIssue)
            : 'Agent task'
        }
      />
      <div className="min-h-0 flex-1">
        {selectedRun ? (
          <AgentTaskConversation
            draft={agentReplyDraft}
            endpoint={endpoint}
            endpoints={endpoints}
            error={error}
            isStreaming={selectedRunStreaming}
            onChange={onAgentReplyChange}
            onContinue={() => onContinueAgentRun(selectedRun)}
            onRewind={(messageId) => onRewindAgentRun(selectedRun, messageId)}
            onRuntimeChange={(runtime) =>
              onAgentRunRuntimeChange(selectedRun, runtime)
            }
            onSend={onSendAgentMessage}
            onStop={onStopAgentRun}
            run={selectedRun}
          />
        ) : (
          <form className="space-y-2.5 p-3" onSubmit={onCreateAgentRun}>
            <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_180px]">
              <Field label="Workspace">
                <div className="flex h-9 items-center rounded-md border bg-background px-3 text-sm text-muted-foreground">
                  <span className="truncate">
                    {selectedWorkspace?.name ?? 'No workspace'}
                  </span>
                </div>
              </Field>
              <Field label="Agent runtime">
                <Select
                  onValueChange={(value) =>
                    onAgentRuntimeChange(parseAgentRuntime(value))
                  }
                  value={agentRuntimeDraft}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="patchlane">Patchlane</SelectItem>
                    <SelectItem value="opencode">OpenCode</SelectItem>
                    <SelectItem value="codex">Codex</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="New task">
              <Textarea
                className="min-h-[160px] bg-background"
                onChange={(event) => onAgentTaskChange(event.target.value)}
                placeholder="Implement the requested change, run verification, commit to a branch, push, and open a PR."
                required
                value={agentTaskDraft}
              />
            </Field>
            <ErrorBanner message={error} variant="card" />
            <Button
              disabled={
                agentRunning ||
                !selectedWorkspace ||
                !agentRuntimeConnector ||
                selectedWorkspace.status !== 'ready'
              }
              type="submit"
            >
              {agentRunning ? <Loader2 className="animate-spin" /> : <Bot />}
              Start agent run
            </Button>
          </form>
        )}
      </div>
    </PagePane>
  )
}

const parseAgentRuntime = (value: string): AgentRuntime => {
  if (value === 'opencode' || value === 'codex') {
    return value
  }

  return 'patchlane'
}

const isStoppableAgentRun = (run: AgentRun) => {
  return run.status === 'idle' || run.status === 'running'
}

const AgentTaskHeaderActions = ({ children }: { children: ReactNode }) => {
  return (
    <div className="flex min-w-0 max-w-full items-center gap-1.5">
      {children}
    </div>
  )
}

const AgentIssueTaskCard = ({
  item,
  onSelect,
  project,
  selected,
}: {
  item: Extract<TaskWorkItem, { type: 'issueTask' }>
  onSelect?: () => void
  project?: AgentProject
  selected: boolean
}) => {
  const mainContent = (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-left">
      <IssueReferenceBadge issue={item.issue} project={project} />
      <h3 className="min-w-0 truncate text-sm">{item.task.title}</h3>
      <IssueTaskStatusBadge status={item.task.status} />
    </div>
  )
  if (!item.run || !onSelect) {
    return (
      <PageListItem interactive={false} selected={selected}>
        {mainContent}
      </PageListItem>
    )
  }

  return (
    <PageListItem selected={selected}>
      <button
        className="min-w-0 overflow-hidden text-left"
        onClick={onSelect}
        type="button"
      >
        {mainContent}
      </button>
    </PageListItem>
  )
}

const AgentRunCard = ({
  issue,
  onSelect,
  project,
  run,
  selected,
}: {
  issue?: Issue
  onSelect: () => void
  project?: AgentProject
  run: AgentRun
  selected: boolean
}) => {
  return (
    <PageListItem selected={selected}>
      <button
        className="min-w-0 overflow-hidden text-left"
        onClick={onSelect}
        type="button"
      >
        <div
          className={cn(
            'grid min-w-0 items-center gap-2',
            issue
              ? 'grid-cols-[auto_minmax(0,1fr)_auto]'
              : 'grid-cols-[minmax(0,1fr)_auto]',
          )}
        >
          {issue ? (
            <IssueReferenceBadge issue={issue} project={project} />
          ) : null}
          <h3 className="min-w-0 truncate text-sm">{run.title}</h3>
          <AgentRunStatusBadge status={run.status} />
        </div>
      </button>
    </PageListItem>
  )
}

const TaskActionsMenu = ({
  deleting,
  onDelete,
}: {
  deleting: boolean
  onDelete: () => void
}) => {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative shrink-0">
      <Button
        aria-expanded={open}
        aria-haspopup="menu"
        className="h-6 w-6 shadow-xs"
        onClick={() => setOpen((value) => !value)}
        size="icon-xs"
        type="button"
        variant="outline"
      >
        <MoreHorizontal />
      </Button>
      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-1 min-w-36 rounded-md border bg-popover p-1"
          role="menu"
        >
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
            disabled={deleting}
            onClick={() => {
              onDelete()
              setOpen(false)
            }}
            role="menuitem"
            type="button"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Delete task
          </button>
        </div>
      ) : null}
    </div>
  )
}

const getAgentTaskHeaderDescription = (
  run: AgentRun | null,
  workspace: SandboxWorkspace | null,
  issue?: Issue,
  project?: AgentProject,
) => {
  if (run) {
    const items = [
      issue ? formatIssueReference(issue, project) : null,
      run.branchName,
    ].filter(Boolean)

    return items.length ? items.join(' · ') : 'Agent task chat'
  }

  const items = [workspace?.name].filter(Boolean)

  return items.length ? items.join(' · ') : 'Select a task or start a new run'
}

const getAgentTaskHeaderTitle = (run: AgentRun, issue?: Issue) => {
  return getRunIssueTask(run, issue)?.title ?? run.title
}

const getRunIssueTask = (run: AgentRun, issue?: Issue) => {
  return issue?.subtasks.find(
    (task) => task.id === run.subtaskId || task.agentRunId === run.id,
  )
}

const AgentRunContextBadge = ({
  context,
}: {
  context: NonNullable<AgentRun['context']>
}) => {
  const usage = getAgentRunContextUsage(context)

  return (
    <Badge
      className={cn(
        'gap-1',
        context.strategy === 'compacted' &&
          'border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300',
      )}
      variant={context.strategy === 'compacted' ? 'outline' : 'secondary'}
    >
      Context {usage}%
      {context.strategy === 'compacted'
        ? ` · compacted ${context.summarizedMessages}`
        : ''}
    </Badge>
  )
}

const getAgentRunContextUsage = (context: NonNullable<AgentRun['context']>) => {
  return Math.min(
    100,
    Math.round((context.estimatedTokens / context.tokenBudget) * 100),
  )
}
