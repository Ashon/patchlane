import type { AgentRun, Issue, SandboxWorkspace } from '@agent-fleet/shared'
import { Bot, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Page, PageHeader } from '@/components/layout/page-primitives'
import { EmptyState, IssueStatusBadge, PriorityBadge } from './common'

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
}) => {
  const taskState = [
    `Req ${requirementRun?.status || (issue.requirementRunId ? 'created' : 'pending')}`,
    `Plan ${planningRun?.status || (issue.planningRunId ? 'created' : 'pending')}`,
    `Code ${run?.status || 'pending'}`,
  ].join(' / ')

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
          <IssueFact
            label="Branch"
            value={issue.branchName || 'Not analyzed'}
          />
          <IssueFact label="PR" value={issue.prUrl || 'Not created'} />
          <IssueFact label="Tasks" value={taskState} />
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
      </div>

      <ScrollArea className="min-h-0 flex-1" viewportClassName="px-4 py-3">
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
      </ScrollArea>
    </Page>
  )
}

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
