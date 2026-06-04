import type { AgentProject, AgentRun, Issue } from '@patchlane/shared'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatTaskRunMetricItems } from './task-run-metrics'
import { formatIssueReference } from './utils'

export const TaskListMeta = ({
  className,
  run,
}: {
  className?: string
  run?: AgentRun
}) => {
  const metrics = formatTaskRunMetricItems(run)

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground',
        className,
      )}
    >
      <span className="min-w-0 truncate">{metrics.join(' · ')}</span>
    </div>
  )
}

export const IssueReferenceBadge = ({
  issue,
  project,
}: {
  issue?: Pick<Issue, 'number'>
  project?: Pick<AgentProject, 'code'>
}) => {
  if (!issue) {
    return null
  }

  return (
    <Badge className="shrink-0 font-mono" variant="outline">
      {formatIssueReference(issue, project)}
    </Badge>
  )
}

export const TaskRunMetricBadge = ({ run }: { run: AgentRun }) => (
  <Badge className="max-w-[260px] truncate" variant="outline">
    {formatTaskRunMetricItems(run).join(' · ')}
  </Badge>
)
