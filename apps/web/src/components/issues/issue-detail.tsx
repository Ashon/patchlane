import type { AgentRun, Issue, SandboxWorkspace } from '@agent-fleet/shared'
import { Bot, ClipboardList, ListChecks } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import { EmptyState, InfoRow, IssueStatusBadge, PriorityBadge } from './common'

export const IssueDetail = ({
  issue,
  onOpenRun,
  planningRun,
  requirementRun,
  run,
  workspace,
}: {
  issue: Issue
  onOpenRun: (runId: string) => void
  planningRun?: AgentRun
  requirementRun?: AgentRun
  run?: AgentRun
  workspace?: SandboxWorkspace
}) => (
  <section className="flex h-full min-h-0 flex-col bg-background">
    <header className="border-b bg-background px-3 py-2">
      <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase text-muted-foreground">
          Issue detail
        </span>
        <IssueStatusBadge status={issue.status} />
        <PriorityBadge priority={issue.priority} />
      </div>
      <h3 className="truncate text-sm font-semibold">{issue.title}</h3>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
        {issue.description}
      </p>
    </header>

    <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_320px]">
      <main className="min-h-0 overflow-y-auto px-4 py-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5" />
          Requirement analysis
        </div>
        {issue.analysis ? (
          <Markdown className="prose prose-sm max-w-none dark:prose-invert prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-headings:mb-1.5 prose-headings:mt-3 prose-p:my-1.5 prose-ol:my-2 prose-ul:my-2 prose-li:my-0.5">
            {issue.analysis}
          </Markdown>
        ) : (
          <EmptyState>No analysis yet</EmptyState>
        )}
      </main>

      <aside className="min-h-0 overflow-y-auto border-t bg-muted/25 px-3 py-2 xl:border-l xl:border-t-0">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
          <ListChecks className="h-3.5 w-3.5" />
          Issue state
        </div>
        <div className="rounded-md border bg-background px-2">
          <InfoRow label="Priority" value={issue.priority} />
          <InfoRow label="Sandbox" value={workspace?.name || 'Not ready'} />
          <InfoRow label="Branch" value={issue.branchName || 'Not analyzed'} />
          <InfoRow label="PR" value={issue.prUrl || 'Not created'} />
          <InfoRow
            label="Requirement task"
            value={
              requirementRun?.status ||
              (issue.requirementRunId ? 'Created' : 'Not planned')
            }
          />
          <InfoRow
            label="Plan task"
            value={
              planningRun?.status ||
              (issue.planningRunId ? 'Created' : 'Not planned')
            }
          />
          <InfoRow label="Coding run" value={run?.status || 'Not started'} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {issue.requirementRunId ? (
            <Button
              onClick={() => onOpenRun(issue.requirementRunId!)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Bot />
              Requirements
            </Button>
          ) : null}
          {issue.planningRunId ? (
            <Button
              onClick={() => onOpenRun(issue.planningRunId!)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Bot />
              Work plan
            </Button>
          ) : null}
          {run ? (
            <Button
              onClick={() => onOpenRun(run.id)}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Bot />
              Coding
            </Button>
          ) : null}
        </div>
      </aside>
    </div>
  </section>
)
