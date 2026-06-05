import type { AgentRun } from '@patchlane/shared'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatTaskRunMetricItems } from './task-run-metrics'

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

export const TaskRunMetricBadge = ({
  className,
  includeAwaitingUser = true,
  run,
}: {
  className?: string
  includeAwaitingUser?: boolean
  run: AgentRun
}) => (
  <Badge
    className={cn('max-w-[260px] min-w-0 truncate', className)}
    variant="outline"
  >
    <span className="min-w-0 truncate">
      {formatTaskRunMetricItems(run, { includeAwaitingUser }).join(' · ')}
    </span>
  </Badge>
)
