import type { ReactNode } from 'react'
import type {
  AgentProject,
  AgentRun,
  AgentRunStatus,
  Issue,
  IssueTaskStatus,
  IssuePriority,
  IssueStatus,
  IssueSubtaskStatus,
} from '@patchlane/shared'
import {
  AlertCircle,
  Archive,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronsUp,
  Circle,
  CircleSlash2,
  Clock3,
  CircleDot,
  Eye,
  Github,
  Layers3,
  ListChecks,
  Loader2,
  PauseCircle,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { formatIssueReference } from './utils'

export const Field = ({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    {children}
  </div>
)

export const EmptyState = ({ children }: { children: ReactNode }) => (
  <div className="rounded-md border border-dashed bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
    {children}
  </div>
)

export const MetricBadge = ({
  label,
  value,
}: {
  label: string
  value: number
}) => (
  <Badge className="gap-1" variant="secondary">
    {label}
    <span className="font-mono">{value}</span>
  </Badge>
)

export const ProjectRepositoryBadge = ({
  className,
  project,
}: {
  className?: string
  project: AgentProject
}) => {
  if (project.workspaceId) {
    return (
      <StateBadge className={className} tone="success">
        {project.repositoryUrl ? (
          <Github className="h-3 w-3" />
        ) : (
          <Layers3 className="h-3 w-3" />
        )}
        Ready
      </StateBadge>
    )
  }

  return (
    <StateBadge className={className} tone="warning">
      No repo
    </StateBadge>
  )
}

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

export const IssueTaskStatusBadge = ({
  className,
  status,
}: {
  className?: string
  status: IssueTaskStatus
}) => (
  <StatusIconBadge
    className={className}
    labelPrefix="Task status"
    status={status}
  />
)

export const IssueSubtaskStatusBadge = ({
  status,
}: {
  status: IssueSubtaskStatus
}) => <IssueTaskStatusBadge status={status} />

export const IssueStatusBadge = ({ status }: { status: IssueStatus }) => {
  return <StatusIconBadge labelPrefix="Issue status" status={status} />
}

export const StatusIconBadge = ({
  className,
  labelPrefix,
  status,
}: {
  className?: string
  labelPrefix?: string
  status: AgentRunStatus | IssueStatus | IssueTaskStatus
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

export const PriorityBadge = ({
  className,
  priority,
}: {
  className?: string
  priority: IssuePriority
}) => {
  const meta = priorityMeta[priority]
  const Icon = meta.icon

  return (
    <Badge
      aria-label={`Priority: ${priority}`}
      className={cn(
        'h-5 min-h-5 w-5 justify-center rounded-md p-0',
        meta.className,
        className,
      )}
      title={`Priority: ${priority}`}
      variant={meta.variant}
    >
      <Icon />
    </Badge>
  )
}

const getStatusIconConfig = (
  status: AgentRunStatus | IssueStatus | IssueTaskStatus,
) => {
  if (status === 'completed') {
    return {
      className:
        'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      icon: CheckCircle2,
      label: 'Completed',
    }
  }

  if (status === 'finalized') {
    return {
      className:
        'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      icon: Archive,
      label: 'Finalized',
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
      className:
        'border-destructive/50 bg-destructive/10 text-destructive',
      icon: XCircle,
      label: 'Failed',
    }
  }

  if (status === 'blocked') {
    return {
      className:
        'border-destructive/50 bg-destructive/10 text-destructive',
      icon: AlertCircle,
      label: 'Blocked',
    }
  }

  if (status === 'planning') {
    return {
      className: 'border-primary/35 bg-primary/10 text-primary',
      icon: ListChecks,
      label: 'Planning',
    }
  }

  if (status === 'ready') {
    return {
      className: 'border-primary/35 bg-primary/10 text-primary',
      icon: CircleDot,
      label: 'Ready',
    }
  }

  if (status === 'review') {
    return {
      className: 'border-primary/35 bg-primary/10 text-primary',
      icon: Eye,
      label: 'Review',
    }
  }

  if (status === 'skipped') {
    return {
      className: 'border-muted-foreground/30 bg-muted text-muted-foreground',
      icon: CircleSlash2,
      label: 'Skipped',
    }
  }

  if (status === 'backlog') {
    return {
      className: 'border-muted-foreground/30 bg-background text-muted-foreground',
      icon: Circle,
      label: 'Backlog',
    }
  }

  if (status === 'idle') {
    return {
      className: 'border-muted-foreground/30 bg-background text-muted-foreground',
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

const priorityMeta = {
  high: {
    className:
      'border-amber-500/45 bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300',
    icon: ArrowUp,
    variant: 'outline',
  },
  low: {
    className: 'text-muted-foreground',
    icon: ArrowDown,
    variant: 'outline',
  },
  medium: {
    className: 'text-muted-foreground',
    icon: CircleDot,
    variant: 'outline',
  },
  urgent: {
    className: '',
    icon: ChevronsUp,
    variant: 'destructive',
  },
} satisfies Record<
  IssuePriority,
  {
    className: string
    icon: LucideIcon
    variant: 'destructive' | 'outline'
  }
>

export const StateBadge = ({
  children,
  className,
  tone,
}: {
  children: ReactNode
  className?: string
  tone: 'success' | 'warning'
}) => (
  <Badge
    className={cn(
      'gap-1 hover:bg-current/0',
      tone === 'success' &&
        'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300',
      tone === 'warning' &&
        'border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300',
      className,
    )}
    variant="outline"
  >
    {children}
  </Badge>
)

export const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-start justify-between gap-3 border-b py-1.5 text-xs last:border-b-0">
    <span className="font-medium">{label}</span>
    <span className="min-w-0 break-words text-right text-muted-foreground">
      {value}
    </span>
  </div>
)
