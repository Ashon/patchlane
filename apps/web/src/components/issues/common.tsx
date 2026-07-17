import type { AgentRun, AgentRunStatus } from '@patchlane/shared'
import {
  CheckCircle2,
  CircleSlash2,
  Clock3,
  Loader2,
  PauseCircle,
  XCircle,
} from 'lucide-react'
import { Badge } from '@patchlane/ui/badge'
import { cn } from '@/lib/utils'

export const AgentRunStatusBadge = ({
  className,
  status,
}: {
  className?: string
  status: AgentRun['status']
}) => (
  <StatusIconBadge
    className={className}
    labelPrefix="Agent run status"
    status={status}
  />
)

const StatusIconBadge = ({
  className,
  labelPrefix,
  status,
}: {
  className?: string
  labelPrefix?: string
  status: AgentRunStatus
}) => {
  const config = getStatusIconConfig(status)
  const Icon = config.icon
  const label = labelPrefix ? `${labelPrefix}: ${config.label}` : config.label

  return (
    <Badge
      aria-label={label}
      className={cn(
        'grid h-6 min-h-6 w-6 place-items-center rounded-md px-0 py-0 hover:bg-current/0',
        config.className,
        className,
      )}
      title={label}
      variant="outline"
    >
      <Icon className={cn('h-3.5 w-3.5', config.iconClassName)} />
    </Badge>
  )
}

const getStatusIconConfig = (
  status: AgentRunStatus,
): {
  className: string
  icon: typeof Clock3
  iconClassName?: string
  label: string
} => {
  if (status === 'completed') {
    return {
      className:
        'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      icon: CheckCircle2,
      label: 'Completed',
    }
  }

  if (status === 'running') {
    return {
      className: 'border-primary/40 bg-primary/10 text-primary',
      icon: Loader2,
      iconClassName: 'animate-spin',
      label: 'Running',
    }
  }

  if (status === 'awaiting_user') {
    return {
      className:
        'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300',
      icon: PauseCircle,
      label: 'Awaiting user',
    }
  }

  if (status === 'failed') {
    return {
      className: 'border-destructive/50 bg-destructive/10 text-destructive',
      icon: XCircle,
      label: 'Failed',
    }
  }

  if (status === 'cancelled') {
    return {
      className: 'border-muted-foreground/30 bg-muted text-muted-foreground',
      icon: CircleSlash2,
      label: 'Cancelled',
    }
  }

  if (status === 'idle') {
    return {
      className:
        'border-muted-foreground/30 bg-background text-muted-foreground',
      icon: Clock3,
      label: 'Idle',
    }
  }

  return {
    className: 'border-muted-foreground/30 bg-background text-muted-foreground',
    icon: Clock3,
    label: 'Pending',
  }
}
