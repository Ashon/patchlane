import type { ReactNode } from 'react'
import type {
  AgentProject,
  AgentRun,
  Issue,
  IssueTaskStatus,
  SandboxWorkspace,
} from '@patchlane/shared'
import {
  AlertTriangle,
  Archive,
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
  FileText,
  GitBranch,
  GitPullRequest,
  History,
  Lightbulb,
  ListChecks,
  Loader2,
  Play,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  finalizing,
  onFinalize,
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
}: {
  issue: Issue
  finalizing: boolean
  onFinalize: () => Promise<void>
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
        actions={
          <>
            <IssueStatusBadge status={issue.status} />
            {issue.status === 'completed' && workflowComplete ? (
              <Button
                className="bg-background"
                disabled={actionBusy || finalizing}
                onClick={() => void onFinalize()}
                size="xs"
                type="button"
                variant="outline"
              >
                {finalizing ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Archive className="size-3" />
                )}
                Finalize
              </Button>
            ) : null}
          </>
        }
        icon={<PriorityBadge priority={issue.priority} />}
        title={`${issueReference} ${issue.title}`}
      />

      <Tabs className="flex min-h-0 flex-1 flex-col" defaultValue="brief">
        <div className="border-b bg-muted/20 px-3 py-1.5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <TabsList className="h-auto min-h-7 max-w-full flex-wrap justify-start gap-1 rounded-none bg-transparent p-0 text-foreground">
              <IssueTabTrigger icon={ClipboardList} value="brief">
                Issue brief
              </IssueTabTrigger>
              <IssueTabTrigger
                count={issue.subtasks.length}
                icon={ListChecks}
                value="tasks"
              >
                Tasks
              </IssueTabTrigger>
              <IssueTabTrigger
                count={issue.comments.length}
                icon={History}
                value="activity"
              >
                Activity
              </IssueTabTrigger>
              <IssueTabTrigger
                count={issue.artifactManifest ? 1 : 0}
                icon={Archive}
                value="artifacts"
              >
                Artifacts
              </IssueTabTrigger>
            </TabsList>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <IssueRuntimeMeta
                icon={GitBranch}
                label="Branch"
                value={issue.branchName || 'Not started'}
              />
              <IssueRuntimeMeta
                icon={GitPullRequest}
                label="PR"
                value={issue.prUrl ? 'Created' : 'Not created'}
              />
              <IssueWorkflowActions
                actionBusy={actionBusy}
                planning={planning}
                running={running}
                subtasksCount={issue.subtasks.length}
                workflowComplete={workflowComplete}
                onPlan={onPlan}
                onStart={onStart}
              />
            </div>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1" viewportClassName="px-4 py-3">
          <TabsContent className="mt-0 min-w-0" value="brief">
            <Markdown className="prose prose-sm max-w-none dark:prose-invert prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-headings:mb-1.5 prose-headings:mt-3 prose-p:my-1.5 prose-ol:my-2 prose-ul:my-2 prose-li:my-0.5">
              {issue.description}
            </Markdown>
            {issue.analysis && !run ? (
              <div className="mt-5 border-t pt-3">
                <IssueSectionHeader title="Prepared context" />
                <Markdown className="prose prose-sm max-w-none dark:prose-invert prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-headings:mb-1.5 prose-headings:mt-3 prose-p:my-1.5 prose-ol:my-2 prose-ul:my-2 prose-li:my-0.5">
                  {issue.analysis}
                </Markdown>
              </div>
            ) : !run ? (
              <div className="mt-4">
                <EmptyState>
                  The agent will assess scope and plan when the run starts.
                </EmptyState>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent className="mt-0 min-w-0" value="tasks">
            {issue.subtasks.length > 0 ? (
              <>
                <IssueTaskProgress className="mb-3" issue={issue} />
                <div className="overflow-hidden rounded-md border">
                  {issue.subtasks.map((task) => (
                    <IssueTaskItem
                      key={task.id}
                      actionDisabled={actionBusy}
                      onStartTask={() => onStartTask(task)}
                      onOpenRun={onOpenRun}
                      onUpdateStatus={(status) =>
                        onUpdateTaskStatus(task, status)
                      }
                      task={task}
                      updating={updatingTaskId === task.id}
                    />
                  ))}
                </div>
              </>
            ) : (
              <EmptyState>No tasks planned yet</EmptyState>
            )}
          </TabsContent>

          <TabsContent className="mt-0 min-w-0" value="activity">
            {issue.comments.length > 0 ? (
              <div className="divide-y">
                {issue.comments.map((comment) => (
                  <IssueActivityItem
                    comment={comment}
                    issue={issue}
                    key={comment.id}
                    project={project}
                  />
                ))}
              </div>
            ) : (
              <EmptyState>No issue activity recorded yet</EmptyState>
            )}
          </TabsContent>

          <TabsContent className="mt-0 min-w-0" value="artifacts">
            {issue.artifactManifest ? (
              <IssueArtifactSummary manifest={issue.artifactManifest} />
            ) : (
              <EmptyState>
                Finalize a completed issue to collect artifacts.
              </EmptyState>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
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

const IssueTabTrigger = ({
  children,
  count,
  icon: Icon,
  value,
}: {
  children: ReactNode
  count?: number
  icon: LucideIcon
  value: string
}) => (
  <TabsTrigger
    className="group h-7 gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground shadow-none hover:bg-muted hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none data-[state=active]:hover:bg-primary/90"
    value={value}
  >
    <Icon className="h-3 w-3" />
    <span>{children}</span>
    {count !== undefined ? (
      <span className="grid h-4 min-w-4 place-items-center rounded bg-muted px-1 font-mono text-[9px] text-muted-foreground group-data-[state=active]:bg-primary-foreground/20 group-data-[state=active]:text-primary-foreground">
        {count}
      </span>
    ) : null}
  </TabsTrigger>
)

const IssueRuntimeMeta = ({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) => (
  <div
    className="flex h-7 min-w-0 max-w-[220px] items-center gap-1.5 rounded-md border bg-background px-2 text-xs"
    title={`${label}: ${value}`}
  >
    <span className="grid h-4 w-4 shrink-0 place-items-center">
      <Icon className="h-3 w-3 text-muted-foreground" />
    </span>
    <span className="text-[10px] uppercase leading-none text-muted-foreground">
      {label}
    </span>
    <span className="min-w-0 truncate leading-none text-foreground">
      {value}
    </span>
  </div>
)

const IssueWorkflowActions = ({
  actionBusy,
  onPlan,
  onStart,
  planning,
  running,
  subtasksCount,
  workflowComplete,
}: {
  actionBusy: boolean
  onPlan: () => void
  onStart: () => void
  planning: boolean
  running: boolean
  subtasksCount: number
  workflowComplete: boolean
}) => {
  if (subtasksCount === 0) {
    return (
      <Button
        disabled={actionBusy}
        onClick={onPlan}
        size="sm"
        type="button"
        variant="outline"
      >
        {planning ? <Loader2 className="animate-spin" /> : <ListChecks />}
        Plan
      </Button>
    )
  }

  if (!workflowComplete) {
    return (
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
    )
  }

  return null
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

const IssueArtifactSummary = ({
  manifest,
}: {
  manifest: NonNullable<Issue['artifactManifest']>
}) => {
  const providerTokens = manifest.runs.reduce(
    (total, run) => total + run.providerTokens,
    0,
  )
  const toolTokens = manifest.runs.reduce(
    (total, run) => total + run.toolInputTokens + run.toolOutputTokens,
    0,
  )
  const visibleFiles = [
    ...manifest.changedFiles,
    ...manifest.untrackedFiles,
  ].slice(0, 6)

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div className="grid grid-cols-2 border-b sm:grid-cols-4">
        <ArtifactMetric label="Changed" value={manifest.changedFiles.length} />
        <ArtifactMetric
          label="Untracked"
          value={manifest.untrackedFiles.length}
        />
        <ArtifactMetric label="Runs" value={manifest.runs.length} />
        <ArtifactMetric
          label="Tokens"
          value={`${formatCompactNumber(providerTokens + toolTokens)} tok`}
        />
      </div>
      <div className="space-y-4 p-3">
        <div className="grid gap-x-4 gap-y-0 text-xs lg:grid-cols-2">
          <ArtifactInfoRow
            label="Finalized"
            value={formatDateTime(manifest.finalizedAt)}
          />
          <ArtifactInfoRow
            label="Branch"
            value={manifest.branchName || 'Not recorded'}
          />
          <ArtifactInfoRow
            className="lg:col-span-1"
            label="Workspace"
            value={manifest.workspacePath || 'Not recorded'}
          />
          <ArtifactInfoRow label="Comments" value={String(manifest.comments)} />
        </div>
        {visibleFiles.length > 0 ? (
          <div className="border-t pt-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              Files
            </div>
            <div className="space-y-1.5">
              {visibleFiles.map((file) => (
                <div
                  className="flex min-w-0 items-center gap-2 rounded bg-muted/35 px-2.5 py-1.5 text-xs"
                  key={`${file.status}:${file.path}`}
                >
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {file.status}
                  </span>
                  <span className="min-w-0 truncate">{file.path}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {manifest.warnings.length > 0 ? (
          <div className="space-y-1 border-t pt-3">
            {manifest.warnings.map((warning) => (
              <div
                className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300"
                key={warning}
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

const ArtifactInfoRow = ({
  className,
  label,
  value,
}: {
  className?: string
  label: string
  value: string
}) => (
  <div
    className={cn(
      'grid min-w-0 grid-cols-[88px_minmax(0,1fr)] items-start gap-3 border-b py-2 last:border-b-0 lg:[&:nth-last-child(-n+2)]:border-b-0',
      className,
    )}
  >
    <span className="font-medium text-foreground">{label}</span>
    <span className="min-w-0 break-words text-muted-foreground">{value}</span>
  </div>
)

const ArtifactMetric = ({
  label,
  value,
}: {
  label: string
  value: number | string
}) => (
  <div className="border-b border-r px-3 py-2.5 even:border-r-0 [&:nth-last-child(-n+2)]:border-b-0 sm:border-b-0 sm:even:border-r sm:last:border-r-0">
    <div className="text-[11px] font-medium uppercase text-muted-foreground">
      {label}
    </div>
    <div className="mt-0.5 text-sm font-semibold">{value}</div>
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
    <article className="grid min-w-0 grid-cols-[24px_minmax(0,1fr)] items-start gap-2 border-b px-2.5 py-2 last:border-b-0 sm:grid-cols-[24px_minmax(0,1fr)_auto]">
      <span className="grid h-6 w-6 place-items-center">
        <Icon className={cn('h-3.5 w-3.5', meta.iconClassName)} />
      </span>
      <div className="min-w-0">
        <div className="grid min-h-6 min-w-0 items-center">
          <span className="min-w-0 truncate text-sm">{task.title}</span>
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
    <article className="grid min-w-0 grid-cols-[16px_1fr] gap-2 py-2 first:pt-0 last:pb-0">
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
    icon: CirclePause,
    iconClassName: 'text-amber-700 dark:text-amber-300',
  },
  completed: {
    icon: CheckCircle2,
    iconClassName: 'text-emerald-700 dark:text-emerald-300',
  },
  failed: {
    icon: CircleX,
    iconClassName: 'text-destructive',
  },
  pending: {
    icon: Circle,
    iconClassName: 'text-muted-foreground',
  },
  running: {
    icon: CircleDot,
    iconClassName: 'text-primary',
  },
  skipped: {
    icon: Circle,
    iconClassName: 'text-muted-foreground',
  },
} satisfies Record<
  IssueTask['status'],
  {
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

const formatCompactNumber = (value: number) => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`
  }

  return String(value)
}
