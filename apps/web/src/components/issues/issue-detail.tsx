import type { AgentRun, Issue, SandboxWorkspace } from '@patchlane/shared'
import {
  Bot,
  CircleAlert,
  CircleDot,
  ClipboardList,
  Flag,
  History,
  Lightbulb,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Page, PageHeader } from '@/components/layout/page-primitives'
import { cn } from '@/lib/utils'
import { EmptyState, IssueStatusBadge, PriorityBadge } from './common'
import { formatDateTime } from './utils'

type IssueComment = Issue['comments'][number]

export const IssueDetail = ({
  issue,
  onOpenRun,
  run,
  workspace,
}: {
  issue: Issue
  onOpenRun: (runId: string) => void
  run?: AgentRun
  workspace?: SandboxWorkspace
}) => {
  return (
    <Page>
      <PageHeader
        actions={
          <>
            <IssueStatusBadge status={issue.status} />
            <PriorityBadge priority={issue.priority} />
          </>
        }
        description={issue.description}
        title={issue.title}
      />

      <div className="border-b bg-muted/20 px-3 py-2">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
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
          </div>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1" viewportClassName="px-4 py-3">
        <section>
          <IssueSectionHeader icon={ClipboardList} title="Issue brief" />
          <Markdown className="prose prose-sm max-w-none dark:prose-invert prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-headings:mb-1.5 prose-headings:mt-3 prose-p:my-1.5 prose-ol:my-2 prose-ul:my-2 prose-li:my-0.5">
            {issue.description}
          </Markdown>
        </section>

        {issue.comments.length > 0 ? (
          <section className="mt-5 border-t pt-3">
            <IssueSectionHeader
              count={issue.comments.length}
              icon={History}
              title="Activity"
            />
            <div className="space-y-2">
              {issue.comments.map((comment) => (
                <IssueActivityItem comment={comment} key={comment.id} />
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

const IssueActivityItem = ({ comment }: { comment: IssueComment }) => {
  const meta = getCommentKindMeta(comment.kind)
  const Icon = meta.icon

  return (
    <article className="grid min-w-0 grid-cols-[16px_1fr] gap-2">
      <Icon className={cn('mt-0.5 h-3.5 w-3.5', meta.iconClassName)} />
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs">
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
