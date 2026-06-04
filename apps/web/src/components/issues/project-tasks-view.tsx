import { useEffect, useMemo, useState } from 'react'
import type {
  AgentProject,
  AgentRun,
  Issue,
  LlmEndpoint,
} from '@patchlane/shared'
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
  IssueReferenceBadge,
  IssueTaskKindBadge,
  IssueTaskStatusBadge,
  MetricBadge,
} from './common'
import {
  buildIssueTaskProgressSummaries,
  buildTaskWorkItems,
  getIssueTaskProgressTotals,
  isTaskWorkItemRunning,
  type TaskWorkItem,
} from './task-work-items'
import { TaskListMeta, TaskRunMetricBadge } from './task-list-meta'
import { formatIssueReference } from './utils'

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
  project,
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
  project: AgentProject
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
  const taskTotals = useMemo(
    () => getIssueTaskProgressTotals(buildIssueTaskProgressSummaries(issues)),
    [issues],
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
      project={project}
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
      project={project}
      selectedRun={selectedRun}
      selectedRunStreaming={selectedRunStreaming}
    />
  )

  return (
    <Page className="min-h-[360px]">
      <PageHeader
        actions={
          taskTotals.total > 0 ? (
            <>
              <MetricBadge label="Tasks" value={taskTotals.total} />
              <MetricBadge label="Done" value={taskTotals.completed} />
              <MetricBadge
                label="Active"
                value={taskTotals.active + taskTotals.awaitingUser}
              />
            </>
          ) : (
            <>
              <MetricBadge label="Total" value={taskItems.length} />
              <MetricBadge
                label="Running"
                value={taskItems.filter(isTaskWorkItemRunning).length}
              />
            </>
          )
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
  project,
  selectedRun,
  variant,
}: {
  issueById: Map<string, Issue>
  items: TaskWorkItem[]
  onSelectRun: (runId: string) => void
  project: AgentProject
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
              project={project}
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
  project,
  selectedRun,
}: {
  issueById: Map<string, Issue>
  item: TaskWorkItem
  onSelectRun: (runId: string) => void
  project: AgentProject
  selectedRun: AgentRun | null
}) => {
  if (item.type === 'issueTask') {
    return (
      <IssueTaskListItem
        item={item}
        onSelectRun={onSelectRun}
        project={project}
        selected={item.run ? selectedRun?.id === item.run.id : false}
      />
    )
  }

  const run = item.run
  const issue = run.issueId ? issueById.get(run.issueId) : undefined

  return (
    <PageListItem
      asChild
      className="py-2 text-left"
      selected={selectedRun?.id === run.id}
    >
      <button onClick={() => onSelectRun(run.id)} type="button">
        <div className="grid min-w-0 gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <IssueReferenceBadge issue={issue} project={project} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {run.title}
            </span>
            <AgentRunStatusBadge status={run.status} />
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <AgentRunKindBadge kind={run.kind} />
            <TaskListMeta run={run} />
          </div>
        </div>
      </button>
    </PageListItem>
  )
}

const IssueTaskListItem = ({
  item,
  onSelectRun,
  project,
  selected,
}: {
  item: Extract<TaskWorkItem, { type: 'issueTask' }>
  onSelectRun: (runId: string) => void
  project: AgentProject
  selected: boolean
}) => {
  const content = (
    <div className="grid min-w-0 gap-1">
      <div className="flex min-w-0 items-center gap-2">
        <IssueReferenceBadge issue={item.issue} project={project} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {item.task.title}
        </span>
        <IssueTaskStatusBadge status={item.task.status} />
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <IssueTaskKindBadge kind={item.task.kind} />
        <TaskListMeta run={item.run} />
      </div>
    </div>
  )

  if (!item.run) {
    return (
      <PageListItem className="py-2" interactive={false}>
        {content}
      </PageListItem>
    )
  }

  const run = item.run

  return (
    <PageListItem asChild className="py-2 text-left" selected={selected}>
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
  project,
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
  project: AgentProject
  selectedRun: AgentRun | null
  selectedRunStreaming: boolean
}) => {
  const selectedIssue = selectedRun?.issueId
    ? issueById.get(selectedRun.issueId)
    : undefined

  return (
    <section className="h-full min-h-[520px] min-w-0 bg-background lg:min-h-0">
      {selectedRun ? (
        <div className="flex h-full min-h-0 flex-col">
          <PageHeader
            actions={
              <>
                <AgentRunStatusBadge status={selectedRun.status} />
                <TaskRunMetricBadge run={selectedRun} />
              </>
            }
            description={getTaskDetailDescription(
              selectedRun,
              selectedIssue,
              project,
            )}
            icon={<Bot className="h-4 w-4" />}
            title={getTaskDetailTitle(selectedRun, selectedIssue)}
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

const getTaskDetailDescription = (
  run: AgentRun,
  issue: Issue | undefined,
  project: AgentProject,
) => {
  const task = getRunIssueTask(run, issue)
  const items = [
    issue ? formatIssueReference(issue, project) : null,
    run.branchName,
  ]

  if (task) {
    items.splice(1, 0, task.kind)
  }

  return items.filter(Boolean).join(' · ') || 'Agent task chat'
}

const getTaskDetailTitle = (run: AgentRun, issue?: Issue) => {
  return getRunIssueTask(run, issue)?.title ?? run.title
}

const getRunIssueTask = (run: AgentRun, issue?: Issue) => {
  return issue?.subtasks.find(
    (task) => task.id === run.subtaskId || task.agentRunId === run.id,
  )
}
