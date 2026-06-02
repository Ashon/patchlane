import type { ReactNode } from 'react'
import type {
  AgentProject,
  AgentRun,
  IssuePriority,
  IssueStatus,
} from '@agent-fleet/shared'
import { Github, Layers3 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

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
  project,
}: {
  project: AgentProject
}) => {
  if (project.workspaceId) {
    return (
      <StateBadge tone="success">
        {project.repositoryUrl ? (
          <Github className="h-3 w-3" />
        ) : (
          <Layers3 className="h-3 w-3" />
        )}
        Ready
      </StateBadge>
    )
  }

  return <StateBadge tone="warning">No repo</StateBadge>
}

export const AgentRunKindBadge = ({ kind }: { kind: AgentRun['kind'] }) => {
  if (kind === 'requirements') {
    return <Badge variant="outline">requirements</Badge>
  }

  if (kind === 'planning') {
    return <Badge variant="secondary">plan</Badge>
  }

  if (kind === 'verification') {
    return <Badge variant="secondary">verify</Badge>
  }

  if (kind === 'publish') {
    return <Badge variant="secondary">publish</Badge>
  }

  if (kind === 'followup') {
    return <Badge variant="outline">followup</Badge>
  }

  return <Badge variant="outline">coding</Badge>
}

export const AgentRunStatusBadge = ({
  status,
}: {
  status: AgentRun['status']
}) => {
  if (status === 'completed') {
    return <StateBadge tone="success">completed</StateBadge>
  }

  if (status === 'running') {
    return <Badge variant="secondary">running</Badge>
  }

  if (status === 'failed') {
    return <Badge variant="destructive">failed</Badge>
  }

  return <StateBadge tone="warning">{status}</StateBadge>
}

export const IssueStatusBadge = ({ status }: { status: IssueStatus }) => {
  if (status === 'completed') {
    return <StateBadge tone="success">completed</StateBadge>
  }

  if (status === 'failed' || status === 'blocked') {
    return <Badge variant="destructive">{status}</Badge>
  }

  return (
    <StateBadge
      tone={
        status === 'running' || status === 'ready' || status === 'review'
          ? 'success'
          : 'warning'
      }
    >
      {status}
    </StateBadge>
  )
}

export const PriorityBadge = ({ priority }: { priority: IssuePriority }) => {
  if (priority === 'urgent' || priority === 'high') {
    return (
      <Badge variant={priority === 'urgent' ? 'destructive' : 'secondary'}>
        {priority}
      </Badge>
    )
  }

  return <Badge variant="outline">{priority}</Badge>
}

export const StateBadge = ({
  children,
  tone,
}: {
  children: ReactNode
  tone: 'success' | 'warning'
}) => (
  <Badge
    className={cn(
      'gap-1 hover:bg-current/0',
      tone === 'success' &&
        'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300',
      tone === 'warning' &&
        'border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300',
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
