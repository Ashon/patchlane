import type { Issue } from '@patchlane/shared'
import { cn } from '@/lib/utils'
import {
  buildIssueTaskProgressSummaries,
  type IssueTaskProgressSummary,
} from './task-work-items'

export const IssueTaskProgress = ({
  className,
  issue,
  size = 'default',
}: {
  className?: string
  issue: Issue
  size?: 'compact' | 'default'
}) => {
  const summary = buildIssueTaskProgressSummaries([issue])[0]

  if (!summary) {
    return null
  }
  const stateClassName = getProgressStateClassName(summary)

  if (size === 'compact') {
    return (
      <div
        className={cn(
          'flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground',
          className,
        )}
      >
        <span className="shrink-0 font-medium">Tasks</span>
        <div className="h-1 min-w-[72px] flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full', stateClassName)}
            style={{ width: `${summary.percent}%` }}
          />
        </div>
        <span className="shrink-0 tabular-nums">
          {summary.completed}/{summary.total}
        </span>
      </div>
    )
  }

  return (
    <div className={cn('grid min-w-0 gap-1', className)}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Tasks</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {summary.completed}/{summary.total}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', stateClassName)}
          style={{ width: `${summary.percent}%` }}
        />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
        <span>{summary.percent}% done</span>
        {summary.active > 0 ? <span>{summary.active} running</span> : null}
        {summary.awaitingUser > 0 ? (
          <span>{summary.awaitingUser} awaiting</span>
        ) : null}
        {summary.failed > 0 ? <span>{summary.failed} failed</span> : null}
        {summary.pending > 0 ? <span>{summary.pending} pending</span> : null}
      </div>
    </div>
  )
}

const getProgressStateClassName = (summary: IssueTaskProgressSummary) => {
  if (summary.failed > 0) {
    return 'bg-destructive'
  }

  if (summary.awaitingUser > 0) {
    return 'bg-amber-500'
  }

  if (summary.active > 0) {
    return 'bg-primary'
  }

  if (summary.completed === summary.total) {
    return 'bg-emerald-500'
  }

  return 'bg-muted-foreground/45'
}
