import { useEffect, useMemo, useState } from 'react'
import type { AgentRun, Issue, LlmEndpoint } from '@patchlane/shared'
import { Bot, ListChecks } from 'lucide-react'
import { AgentTaskConversation } from '@/components/agent/agent-task-conversation'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useResizableDefaultLayout,
} from '@/components/ui/resizable'
import {
  Page,
  PageHeader,
  PageList,
  PageListItem,
} from '@/components/layout/page-primitives'
import {
  AgentRunKindBadge,
  AgentRunStatusBadge,
  EmptyState,
  IssueSubtaskKindBadge,
  IssueSubtaskStatusBadge,
  MetricBadge,
} from './common'
import {
  buildTaskWorkItems,
  isTaskWorkItemRunning,
  type TaskWorkItem,
} from './task-work-items'
import { formatDateTime } from './utils'

const projectTaskPanelIds = ['project-task-list', 'project-task-chat']
const projectTaskResizableMediaQuery = '(min-width: 640px)'

export const ProjectTasksView = ({
  agentReplyDraft,
  endpoint,
  error,
  issues,
  onAgentReplyChange,
  onContinueRun,
  onRewindRun,
  onSelectRun,
  onSendMessage,
  onStopRun,
  runs,
  selectedRun,
  selectedRunStreaming,
}: {
  agentReplyDraft: string
  endpoint: LlmEndpoint | null
  error: string | null
  issues: Issue[]
  onAgentReplyChange: (value: string) => void
  onContinueRun: (run: AgentRun) => void
  onRewindRun: (run: AgentRun, messageId: string) => void
  onSelectRun: (runId: string) => void
  onSendMessage: () => void
  onStopRun: () => void
  runs: AgentRun[]
  selectedRun: AgentRun | null
  selectedRunStreaming: boolean
}) => {
  const issueById = useMemo(
    () => new Map(issues.map((issue) => [issue.id, issue])),
    [issues],
  )
  const taskItems = useMemo(
    () => buildTaskWorkItems({ issues, runs }),
    [issues, runs],
  )
  const projectTaskLayout = useResizableDefaultLayout({
    id: 'patchlane-project-tasks-layout',
    panelIds: projectTaskPanelIds,
  })
  const [resizableLayoutEnabled, setResizableLayoutEnabled] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia(projectTaskResizableMediaQuery).matches,
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia(projectTaskResizableMediaQuery)
    const syncResizableLayout = () =>
      setResizableLayoutEnabled(mediaQuery.matches)

    syncResizableLayout()
    mediaQuery.addEventListener('change', syncResizableLayout)

    return () => mediaQuery.removeEventListener('change', syncResizableLayout)
  }, [])

  const taskListPane = (
    <TaskListPane
      issueById={issueById}
      items={taskItems}
      onSelectRun={onSelectRun}
      selectedRun={selectedRun}
      variant={resizableLayoutEnabled ? 'resizable' : 'stacked'}
    />
  )
  const taskChatPane = (
    <TaskChatPane
      agentReplyDraft={agentReplyDraft}
      endpoint={endpoint}
      error={error}
      issueById={issueById}
      onAgentReplyChange={onAgentReplyChange}
      onContinueRun={onContinueRun}
      onRewindRun={onRewindRun}
      onSendMessage={onSendMessage}
      onStopRun={onStopRun}
      selectedRun={selectedRun}
      selectedRunStreaming={selectedRunStreaming}
    />
  )

  return (
    <Page className="min-h-[360px]">
      <PageHeader
        actions={
          <>
            <MetricBadge label="Total" value={taskItems.length} />
            <MetricBadge
              label="Running"
              value={taskItems.filter(isTaskWorkItemRunning).length}
            />
          </>
        }
        description="Project-scoped agent task history"
        icon={<ListChecks className="h-4 w-4" />}
        title="Tasks"
      />
      {resizableLayoutEnabled ? (
        <ResizablePanelGroup
          className="min-w-0 flex-1"
          defaultLayout={projectTaskLayout.defaultLayout}
          direction="horizontal"
          id="patchlane-project-tasks-layout"
          onLayoutChanged={projectTaskLayout.onLayoutChanged}
        >
          <ResizablePanel
            className="min-w-0 overflow-hidden"
            defaultSize="32%"
            id="project-task-list"
            maxSize="520px"
            minSize="240px"
          >
            {taskListPane}
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel
            className="min-w-0 overflow-hidden"
            defaultSize="68%"
            id="project-task-chat"
            minSize="320px"
          >
            {taskChatPane}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="grid min-h-0 flex-1 overflow-hidden bg-background lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
          {taskListPane}
          {taskChatPane}
        </div>
      )}
    </Page>
  )
}

const TaskListPane = ({
  issueById,
  items,
  onSelectRun,
  selectedRun,
  variant,
}: {
  issueById: Map<string, Issue>
  items: TaskWorkItem[]
  onSelectRun: (runId: string) => void
  selectedRun: AgentRun | null
  variant: 'resizable' | 'stacked'
}) => {
  return (
    <ScrollArea
      className={
        variant === 'resizable'
          ? 'h-full min-h-0 bg-background'
          : 'min-h-0 border-b bg-background lg:border-b-0 lg:border-r'
      }
    >
      {items.length ? (
        <PageList>
          {items.map((item) => (
            <TaskListItem
              item={item}
              issueById={issueById}
              key={item.id}
              onSelectRun={onSelectRun}
              selectedRun={selectedRun}
            />
          ))}
        </PageList>
      ) : (
        <div className="p-3">
          <EmptyState>No tasks in this project</EmptyState>
        </div>
      )}
    </ScrollArea>
  )
}

const TaskListItem = ({
  issueById,
  item,
  onSelectRun,
  selectedRun,
}: {
  issueById: Map<string, Issue>
  item: TaskWorkItem
  onSelectRun: (runId: string) => void
  selectedRun: AgentRun | null
}) => {
  if (item.type === 'subtask') {
    return (
      <SubtaskListItem
        item={item}
        onSelectRun={onSelectRun}
        selected={item.run ? selectedRun?.id === item.run.id : false}
      />
    )
  }

  const run = item.run
  const issue = run.issueId ? issueById.get(run.issueId) : undefined
  const subtask = getRunSubtask(run, issue)
  const promptPreview = getTaskPromptPreview(run, issue)

  return (
    <PageListItem
      asChild
      className="text-left"
      selected={selectedRun?.id === run.id}
    >
      <button onClick={() => onSelectRun(run.id)} type="button">
        <div className="grid min-w-0 gap-1.5">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {run.title}
            </span>
            <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">
              {formatDateTime(run.updatedAt)}
            </span>
          </div>
          {promptPreview ? (
            <p className="truncate text-xs text-muted-foreground">
              {promptPreview}
            </p>
          ) : null}
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <AgentRunKindBadge kind={run.kind} />
            <AgentRunStatusBadge status={run.status} />
            {issue ? (
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                Issue: {issue.title}
              </span>
            ) : null}
            {subtask ? (
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                Subtask: {subtask.title}
              </span>
            ) : null}
          </div>
        </div>
      </button>
    </PageListItem>
  )
}

const SubtaskListItem = ({
  item,
  onSelectRun,
  selected,
}: {
  item: Extract<TaskWorkItem, { type: 'subtask' }>
  onSelectRun: (runId: string) => void
  selected: boolean
}) => {
  const content = (
    <div className="grid min-w-0 gap-1.5">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {item.subtask.title}
        </span>
        <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">
          {formatDateTime(item.updatedAt)}
        </span>
      </div>
      {item.subtask.resultSummary || item.subtask.description ? (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {item.subtask.resultSummary ?? item.subtask.description}
        </p>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <IssueSubtaskKindBadge kind={item.subtask.kind} />
        <IssueSubtaskStatusBadge status={item.subtask.status} />
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          Issue: {item.issue.title}
        </span>
      </div>
    </div>
  )

  if (!item.run) {
    return <PageListItem interactive={false}>{content}</PageListItem>
  }

  const run = item.run

  return (
    <PageListItem asChild className="text-left" selected={selected}>
      <button onClick={() => onSelectRun(run.id)} type="button">
        {content}
      </button>
    </PageListItem>
  )
}

const TaskChatPane = ({
  agentReplyDraft,
  endpoint,
  error,
  issueById,
  onAgentReplyChange,
  onContinueRun,
  onRewindRun,
  onSendMessage,
  onStopRun,
  selectedRun,
  selectedRunStreaming,
}: {
  agentReplyDraft: string
  endpoint: LlmEndpoint | null
  error: string | null
  issueById: Map<string, Issue>
  onAgentReplyChange: (value: string) => void
  onContinueRun: (run: AgentRun) => void
  onRewindRun: (run: AgentRun, messageId: string) => void
  onSendMessage: () => void
  onStopRun: () => void
  selectedRun: AgentRun | null
  selectedRunStreaming: boolean
}) => {
  return (
    <section className="h-full min-h-[520px] min-w-0 bg-background lg:min-h-0">
      {selectedRun ? (
        <div className="flex h-full min-h-0 flex-col">
          <PageHeader
            actions={
              <>
                <AgentRunKindBadge kind={selectedRun.kind} />
                <AgentRunStatusBadge status={selectedRun.status} />
              </>
            }
            description={getTaskDetailDescription(
              selectedRun,
              selectedRun.issueId
                ? issueById.get(selectedRun.issueId)
                : undefined,
            )}
            icon={<Bot className="h-4 w-4" />}
            title={selectedRun.title}
          />
          <div className="min-h-0 flex-1">
            <AgentTaskConversation
              draft={agentReplyDraft}
              endpoint={endpoint}
              error={error}
              isStreaming={selectedRunStreaming}
              onChange={onAgentReplyChange}
              onContinue={() => onContinueRun(selectedRun)}
              onRewind={(messageId) => onRewindRun(selectedRun, messageId)}
              onSend={onSendMessage}
              onStop={onStopRun}
              run={selectedRun}
            />
          </div>
        </div>
      ) : (
        <div className="p-3">
          <EmptyState>Select a task to inspect the agent chat</EmptyState>
        </div>
      )}
    </section>
  )
}

const getTaskDetailDescription = (run: AgentRun, issue?: Issue) => {
  const subtask = getRunSubtask(run, issue)
  const items = [issue ? `Issue: ${issue.title}` : null, run.branchName].filter(
    Boolean,
  )

  if (subtask) {
    items.splice(1, 0, `Subtask: ${subtask.title}`)
  }

  return items.length ? items.join(' · ') : 'Agent task chat'
}

const getRunSubtask = (run: AgentRun, issue?: Issue) => {
  return issue?.subtasks.find(
    (subtask) => subtask.id === run.subtaskId || subtask.agentRunId === run.id,
  )
}

const getTaskPromptPreview = (run: AgentRun, issue?: Issue) => {
  const prompt =
    run.messages
      .find((message) => message.role === 'user')
      ?.content.split('\n')
      .find(Boolean)
      ?.trim() ?? ''

  if (!prompt) {
    return ''
  }

  const normalizedPrompt = normalizeTaskPreview(prompt)
  const normalizedTitle = normalizeTaskPreview(run.title)
  const normalizedIssue = normalizeTaskPreview(issue?.title ?? '')

  if (
    normalizedPrompt === normalizedTitle ||
    normalizedPrompt === normalizedIssue ||
    normalizedPrompt === normalizeTaskPreview(`Issue: ${issue?.title ?? ''}`)
  ) {
    return ''
  }

  return prompt.replace(/^(task|prompt|issue)\s*:\s*/i, '').trim()
}

const normalizeTaskPreview = (value: string) => {
  return value
    .toLowerCase()
    .replace(/^(task|prompt|issue)\s*:\s*/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}
