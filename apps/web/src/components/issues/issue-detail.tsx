import type {
  AgentProject,
  AgentRun,
  Issue,
  IssueTaskStatus,
  SandboxWorkspace,
} from '@patchlane/shared'
import {
  Bot,
  CheckCircle2,
  Circle,
  CircleAlert,
  CircleDot,
  CirclePause,
  CircleSlash2,
  CircleX,
  ClipboardList,
  Flag,
  History,
  Lightbulb,
  ListChecks,
  Loader2,
  Play,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Page, PageHeader } from '@/components/layout/page-primitives'
import { cn } from '@/lib/utils'
import {
  EmptyState,
  IssueReferenceBadge,
  IssueStatusBadge,
  PriorityBadge,
} from './common'
import { IssueTaskProgress } from './issue-task-progress'
import { formatDateTime, formatIssueReference } from './utils'

type IssueComment = Issue['comments'][number]
type IssueTask = Issue['subtasks'][number]

export const IssueDetail = ({
  issue,
  onOpenRun,
  onPlan,
  onStart,
  onStartTask,
  onUpdateTaskStatus,
  planning,
  project,
  run,
  running,
  updatingTaskId,
  workspace,
}: {
  issue: Issue
  onOpenRun: (runId: string) => void
  onPlan: () => void
  onStart: () => void
  onStartTask: (task: IssueTask) => Promise<void>
  onUpdateTaskStatus: (
    task: IssueTask,
    status: IssueTaskStatus,
  ) => Promise<void>
  planning: boolean
  project: AgentProject
  run?: AgentRun
  running: boolean
  updatingTaskId: string | null
  workspace?: SandboxWorkspace
}) => {
  const workflowComplete = isIssueWorkflowComplete(issue)
  const activeRun = run
    ? run.status === 'idle' ||
      run.status === 'running' ||
      run.status === 'awaiting_user'
    : false
  const actionBusy = planning || running || activeRun || updatingTaskId !== null
  const issueReference = formatIssueReference(issue, project)

  return (
    <Page>
      <PageHeader
        actions={<IssueStatusBadge status={issue.status} />}
        description={issue.description}
        icon={<PriorityBadge priority={issue.priority} />}
        title={`${issueReference} ${issue.title}`}
      />

      <div className="border-b bg-muted/20 px-3 py-2">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <IssueFact label="Issue" value={issueReference} />
          <IssueFact label="Sandbox" value={workspace?.name || 'Not ready'} />
          <IssueFact label="Branch" value={issue.branchName || 'Not started'} />
          <IssueFact label="PR" value={issue.prUrl || 'Not created'} />
          <IssueFact label="Agent" value={run?.status || 'Not started'} />
        </div>
        {run ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button
              onClick={() => onOpenRun(run.id)}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Bot />
              Agent run
            </Button>
            {issue.subtasks.length === 0 ? (
              <Button
                disabled={actionBusy}
                onClick={onPlan}
                size="sm"
                type="button"
                variant="outline"
              >
                {planning ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ListChecks />
                )}
                Plan
              </Button>
            ) : null}
            {issue.subtasks.length > 0 && !workflowComplete ? (
              <Button
                disabled={actionBusy}
                onClick={onStart}
                size="sm"
                type="button"
                variant="outline"
              >
                {running ? <Loader2 className="animate-spin" /> : <Play />}
                Continue
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {issue.subtasks.length === 0 ? (
              <Button
                disabled={actionBusy}
                onClick={onPlan}
                size="sm"
                type="button"
                variant="outline"
              >
                {planning ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ListChecks />
                )}
                Plan
              </Button>
            ) : !workflowComplete ? (
              <Button
                disabled={actionBusy}
                onClick={onStart}
                size="sm"
                type="button"
                variant="outline"
              >
                {running ? <Loader2 className="animate-spin" /> : <Play />}
                Continue
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1" viewportClassName="px-4 py-3">
        <section>
          <IssueSectionHeader icon={ClipboardList} title="Issue brief" />
          <Markdown className="prose prose-sm max-w-none dark:prose-invert prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-headings:mb-1.5 prose-headings:mt-3 prose-p:my-1.5 prose-ol:my-2 prose-ul:my-2 prose-li:my-0.5">
            {issue.description}
          </Markdown>
        </section>

        {issue.subtasks.length > 0 ? (
          <section className="mt-5 border-t pt-3">
            <IssueSectionHeader
              count={issue.subtasks.length}
              icon={ListChecks}
              title="Tasks"
            />
            <IssueTaskProgress className="mb-3" issue={issue} />
            <div className="overflow-hidden rounded-md border">
              {issue.subtasks.map((task) => (
                <IssueTaskItem
                  key={task.id}
                  actionDisabled={actionBusy}
                  onStartTask={() => onStartTask(task)}
                  onOpenRun={onOpenRun}
                  onUpdateStatus={(status) => onUpdateTaskStatus(task, status)}
                  task={task}
                  updating={updatingTaskId === task.id}
                />
              ))}
            </div>
          </section>
        ) : null}

        {issue.comments.length > 0 ? (
          <section className="mt-5 border-t pt-3">
            <IssueSectionHeader
              count={issue.comments.length}
              icon={History}
              title="Activity"
            />
            <div className="space-y-2">
              {issue.comments.map((comment) => (
                <IssueActivityItem
                  comment={comment}
                  issue={issue}
                  key={comment.id}
                  project={project}
                />
              ))}
            </div>
          </section>
        ) : null}

        {issue.analysis && !run ? (
          <div className="mt-5 border-t pt-3">
            <IssueSectionHeader title="Prepared context" />
            <Markdown className="prose prose-sm max-w-none dark:prose-invert prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-headings:mb-1.5 prose-headings:mt-3 prose-p:my-1.5 prose-ol:my-2 prose-ul:my-2 prose-li:my-0.5">
              {issue.analysis}
            </Markdown>
          </div>
        ) : !run ? (
          <EmptyState>
            The agent will assess scope and plan when the run starts.
          </EmptyState>
        ) : null}
      </ScrollArea>
    </Page>
  )
}

const isIssueWorkflowComplete = (issue: Issue) => {
  return (
    issue.subtasks.length > 0 &&
    issue.subtasks.every(
      (subtask) =>
        subtask.status === 'completed' || subtask.status === 'skipped',
    )
  )
}

const IssueSectionHeader = ({
  count,
  icon: Icon,
  title,
}: {
  count?: number
  icon?: LucideIcon
  title: string
}) => (
  <div className="mb-2 flex min-w-0 items-center gap-2 text-xs font-semibold text-muted-foreground">
    {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null}
    <span>{title}</span>
    {count !== undefined ? (
      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
        {count}
      </span>
    ) : null}
  </div>
)

const IssueTaskItem = ({
  actionDisabled,
  onOpenRun,
  onStartTask,
  onUpdateStatus,
  task,
  updating,
}: {
  actionDisabled: boolean
  onOpenRun: (runId: string) => void
  onStartTask: () => Promise<void>
  onUpdateStatus: (status: IssueTaskStatus) => Promise<void>
  task: IssueTask
  updating: boolean
}) => {
  const meta = getTaskStatusMeta(task.status)
  const Icon = meta.icon
  const agentRunId = task.agentRunId
  const canStart =
    task.status === 'pending' ||
    task.status === 'failed' ||
    task.status === 'awaiting_user'
  const canMarkDone = task.status !== 'completed'
  const canSkip =
    task.status === 'pending' ||
    task.status === 'failed' ||
    task.status === 'awaiting_user'
  const canReopen = task.status === 'completed' || task.status === 'skipped'
  const disabled = actionDisabled || updating

  return (
    <article className="grid min-w-0 grid-cols-[16px_minmax(0,1fr)] gap-2 border-b px-2.5 py-2 last:border-b-0 sm:grid-cols-[16px_minmax(0,1fr)_auto]">
      <Icon className={cn('mt-0.5 h-3.5 w-3.5', meta.iconClassName)} />
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-medium">
            {task.title}
          </span>
          <Badge variant="outline">Step {task.sequence + 1}</Badge>
          <Badge variant="outline">{task.kind}</Badge>
          <Badge className={meta.badgeClassName} variant="outline">
            {task.status}
          </Badge>
        </div>
        {task.description ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {task.description}
          </p>
        ) : null}
        {task.resultSummary ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {task.resultSummary}
          </p>
        ) : null}
      </div>
      <div className="col-start-2 flex flex-wrap justify-end gap-1 self-start sm:col-start-auto">
        {agentRunId ? (
          <Button
            onClick={() => onOpenRun(agentRunId)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Bot />
            Run
          </Button>
        ) : null}
        {canStart ? (
          <Button
            disabled={disabled}
            onClick={() => void onStartTask()}
            size="sm"
            type="button"
            variant="outline"
          >
            {updating ? <Loader2 className="animate-spin" /> : <Play />}
            {task.status === 'pending' ? 'Start' : 'Retry'}
          </Button>
        ) : null}
        {canMarkDone ? (
          <Button
            disabled={disabled}
            onClick={() => void onUpdateStatus('completed')}
            size="sm"
            type="button"
            variant="outline"
          >
            {updating ? (
              <Loader2 className="animate-spin" />
            ) : (
              <CheckCircle2 />
            )}
            Done
          </Button>
        ) : null}
        {canSkip ? (
          <Button
            disabled={disabled}
            onClick={() => void onUpdateStatus('skipped')}
            size="sm"
            type="button"
            variant="ghost"
          >
            <CircleSlash2 />
            Skip
          </Button>
        ) : null}
        {canReopen ? (
          <Button
            disabled={disabled}
            onClick={() => void onUpdateStatus('pending')}
            size="sm"
            type="button"
            variant="ghost"
          >
            <RotateCcw />
            Reopen
          </Button>
        ) : null}
      </div>
    </article>
  )
}

const IssueActivityItem = ({
  comment,
  issue,
  project,
}: {
  comment: IssueComment
  issue: Issue
  project: AgentProject
}) => {
  const meta = getCommentKindMeta(comment.kind)
  const Icon = meta.icon

  return (
    <article className="grid min-w-0 grid-cols-[16px_1fr] gap-2">
      <Icon className={cn('mt-0.5 h-3.5 w-3.5', meta.iconClassName)} />
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs">
          <IssueReferenceBadge issue={issue} project={project} />
          <span className="font-semibold">{meta.label}</span>
          <span className="text-muted-foreground">by</span>
          <span className="font-medium">{formatCommentAuthor(comment)}</span>
          {comment.runId ? (
            <span className="font-mono text-[11px] text-muted-foreground">
              run {comment.runId.slice(0, 8)}
            </span>
          ) : null}
          <time className="text-muted-foreground" dateTime={comment.createdAt}>
            {formatDateTime(comment.createdAt)}
          </time>
        </div>
        <Markdown className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ol:my-1.5 prose-ul:my-1.5 prose-li:my-0.5">
          {comment.body}
        </Markdown>
      </div>
    </article>
  )
}

const getCommentKindMeta = (kind: IssueComment['kind']) => {
  return commentKindMeta[kind] ?? commentKindMeta.progress
}

const getTaskStatusMeta = (status: IssueTask['status']) => {
  return taskStatusMeta[status] ?? taskStatusMeta.pending
}

const taskStatusMeta = {
  awaiting_user: {
    badgeClassName:
      'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    icon: CirclePause,
    iconClassName: 'text-amber-700 dark:text-amber-300',
  },
  completed: {
    badgeClassName:
      'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    icon: CheckCircle2,
    iconClassName: 'text-emerald-700 dark:text-emerald-300',
  },
  failed: {
    badgeClassName: 'border-destructive/40 bg-destructive/10 text-destructive',
    icon: CircleX,
    iconClassName: 'text-destructive',
  },
  pending: {
    badgeClassName: 'text-muted-foreground',
    icon: Circle,
    iconClassName: 'text-muted-foreground',
  },
  running: {
    badgeClassName: 'border-primary/40 bg-primary/10 text-primary',
    icon: CircleDot,
    iconClassName: 'text-primary',
  },
  skipped: {
    badgeClassName: 'text-muted-foreground',
    icon: Circle,
    iconClassName: 'text-muted-foreground',
  },
} satisfies Record<
  IssueTask['status'],
  {
    badgeClassName: string
    icon: LucideIcon
    iconClassName: string
  }
>

const commentKindMeta = {
  blocked: {
    icon: CircleAlert,
    iconClassName: 'text-destructive',
    label: 'Blocked',
  },
  decision: {
    icon: Lightbulb,
    iconClassName: 'text-amber-700 dark:text-amber-300',
    label: 'Decision',
  },
  progress: {
    icon: CircleDot,
    iconClassName: 'text-primary',
    label: 'Progress',
  },
  summary: {
    icon: Flag,
    iconClassName: 'text-emerald-700 dark:text-emerald-300',
    label: 'Summary',
  },
} satisfies Record<
  IssueComment['kind'],
  {
    icon: LucideIcon
    iconClassName: string
    label: string
  }
>

const formatCommentAuthor = (comment: IssueComment) =>
  comment.author === 'agent' ? 'Agent' : comment.author

const IssueFact = ({ label, value }: { label: string; value: string }) => {
  return (
    <div className="min-w-0 rounded-md border bg-background px-2 py-1.5">
      <div className="text-[11px] font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="truncate text-xs font-medium">{value}</div>
    </div>
  )
}
