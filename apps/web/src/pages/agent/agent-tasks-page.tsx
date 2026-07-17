import type {
  AgentRun,
  AgentRuntime,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@patchlane/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@patchlane/ui/select'
import { Textarea } from '@patchlane/ui/textarea'
import { DangerConfirmDialog } from '@/components/app/danger-confirm-dialog'
import { EmptyState, Field } from '@/components/app/panel-primitives'
import { StateBadge } from '@/components/app/status-badges'
import { AgentTaskConversation } from '@/components/agent/agent-task-conversation'
import { AgentRunStatusBadge } from '@/components/issues/common'
import {
  buildTaskWorkItems,
  type TaskWorkItem,
} from '@/components/issues/task-work-items'
import { TaskRunMetricBadge } from '@/components/issues/task-list-meta'
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
    runDeletingId,
    runs,
    selectedRun,
    selectedRunStreaming,
    selectedWorkspace,
  } = useAgentRunController()
  const taskItems = useMemo(() => buildTaskWorkItems({ runs }), [runs])
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
      onSelectAgentRun={onSelectAgentRun}
      onStartNewAgentRun={onStartNewAgentRun}
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
  onSelectAgentRun,
  onStartNewAgentRun,
  selectedRun,
  variant,
}: {
  agentRunning: boolean
  items: TaskWorkItem[]
  onSelectAgentRun: (run: AgentRun) => void
  onStartNewAgentRun: () => void
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
            {items.map((item) => (
              <AgentRunCard
                key={item.id}
                onSelect={() => onSelectAgentRun(item.run)}
                run={item.run}
                selected={selectedRun?.id === item.run.id}
              />
            ))}
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
                run={selectedRun}
              />
            ) : null}
          </AgentTaskHeaderActions>
        }
        description={getAgentTaskHeaderDescription(
          selectedRun,
          selectedWorkspace,
        )}
        icon={<Bot className="h-4 w-4" />}
        title={selectedRun ? selectedRun.title : 'Agent task'}
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

const AgentRunCard = ({
  onSelect,
  run,
  selected,
}: {
  onSelect: () => void
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
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
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
  run,
}: {
  deleting: boolean
  onDelete: () => void
  run: AgentRun
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <div className="shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Task actions"
            className="h-6 w-6 shadow-xs"
            size="icon-xs"
            type="button"
            variant="outline"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => setConfirmOpen(true)}
            variant="destructive"
          >
            <Trash2 />
            Delete task
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DangerConfirmDialog
        confirmLabel="Delete task"
        description={
          <>
            This permanently deletes the agent task{' '}
            <span className="font-semibold text-foreground">{run.title}</span>{' '}
            and its full run history. This cannot be undone.
          </>
        }
        loading={deleting}
        onConfirm={onDelete}
        onOpenChange={(open) => {
          if (!deleting) {
            setConfirmOpen(open)
          }
        }}
        open={confirmOpen}
        title="Delete task"
      />
    </div>
  )
}

const getAgentTaskHeaderDescription = (
  run: AgentRun | null,
  workspace: SandboxWorkspace | null,
) => {
  if (run) {
    return 'Agent task chat'
  }

  const items = [workspace?.name].filter(Boolean)

  return items.length ? items.join(' · ') : 'Select a task or start a new run'
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
