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

export const TaskRunMetricBadge = ({ run }: { run: AgentRun }) => (
  <Badge className="max-w-[260px] truncate" variant="outline">
    {formatTaskRunMetricItems(run).join(' · ')}
  </Badge>
)
