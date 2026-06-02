import type { AgentRun, Issue } from '@agent-fleet/shared'
import { Bot, CheckCircle2, GitBranch, Loader2, Play } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { IssueStatusBadge, PriorityBadge } from './common'
import { formatDateTime, hasActiveIssueTask } from './utils'

export const IssueRow = ({
  agentRun,
  issue,
  loading,
  onAnalyze,
  onOpenRun,
  onSelect,
  onStart,
  planningRun,
  projectWorkspaceId,
  requirementRun,
  selected,
}: {
  agentRun?: AgentRun
  issue: Issue
  loading: boolean
  onAnalyze: () => void
  onOpenRun: (runId: string) => void
  onSelect: () => void
  onStart: () => void
  planningRun?: AgentRun
  projectWorkspaceId?: string
  requirementRun?: AgentRun
  selected: boolean
}) => {
  const analyzed =
    Boolean(
      issue.analysis &&
      issue.branchName &&
      issue.requirementRunId &&
      issue.planningRunId &&
      issue.status !== 'backlog',
    ) || planningRun?.status === 'completed'
  const workspaceReady = Boolean(issue.workspaceId ?? projectWorkspaceId)
  const activeTask = hasActiveIssueTask([agentRun, planningRun, requirementRun])
  const planDisabledReason = !workspaceReady
    ? 'Connect a repository or sandbox workspace to this project first.'
    : activeTask
      ? 'This issue has an active agent task.'
      : undefined
  const runDisabledReason = !analyzed
    ? 'Analyze requirements and create a plan first.'
    : !workspaceReady
      ? 'Connect a repository or sandbox workspace to this project first.'
      : activeTask
        ? 'This issue has an active agent task.'
        : undefined
  const canPlan = !loading && !planDisabledReason
  const canRun = !loading && !runDisabledReason

  return (
    <div
      className={cn(
        'grid gap-2 border-l-2 border-l-transparent px-3 py-2 transition-colors hover:bg-muted/45',
        selected && 'border-l-primary bg-primary/5',
      )}
    >
      <button className="min-w-0 text-left" onClick={onSelect} type="button">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-medium">
            {issue.title}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <IssueStatusBadge status={issue.status} />
            <PriorityBadge priority={issue.priority} />
            {agentRun ? (
              <Badge variant="outline">{agentRun.status}</Badge>
            ) : null}
          </span>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {issue.description}
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {issue.branchName ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <GitBranch className="h-3 w-3 shrink-0" />
              <span className="min-w-0 truncate">{issue.branchName}</span>
            </span>
          ) : null}
          <span className="shrink-0">{formatDateTime(issue.updatedAt)}</span>
        </div>
      </button>
      <div className="flex flex-wrap items-center gap-1">
        {issue.requirementRunId ? (
          <Button
            onClick={() => onOpenRun(issue.requirementRunId!)}
            size="sm"
            title={
              requirementRun
                ? `Requirements task: ${requirementRun.status}`
                : 'Open requirements task'
            }
            type="button"
            variant="ghost"
          >
            Req
          </Button>
        ) : null}
        {issue.planningRunId ? (
          <Button
            onClick={() => onOpenRun(issue.planningRunId!)}
            size="sm"
            title={
              planningRun
                ? `Plan task: ${planningRun.status}`
                : 'Open plan task'
            }
            type="button"
            variant="ghost"
          >
            Plan task
          </Button>
        ) : null}
        <Button
          disabled={!canPlan}
          onClick={onAnalyze}
          size="sm"
          title={planDisabledReason}
          type="button"
          variant={analyzed ? 'ghost' : 'outline'}
        >
          {loading ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
          {analyzed ? 'Re-plan' : 'Plan'}
        </Button>
        <Button
          disabled={!canRun}
          onClick={onStart}
          size="sm"
          title={runDisabledReason}
          type="button"
        >
          {loading ? <Loader2 className="animate-spin" /> : <Play />}
          Run
        </Button>
        {issue.agentRunId ? (
          <Button
            onClick={() => onOpenRun(issue.agentRunId!)}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Bot />
            Open
          </Button>
        ) : null}
      </div>
    </div>
  )
}
