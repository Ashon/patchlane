import type { AgentRun, Issue, SandboxWorkspace } from '@patchlane/shared'
import { Bot, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Page, PageHeader } from '@/components/layout/page-primitives'
import { EmptyState, IssueStatusBadge, PriorityBadge } from './common'

export const IssueDetail = ({
  issue,
  onOpenRun,
  run,
  workspace,
}: {
  issue: Issue
  onOpenRun: (runId: string) => void
  run?: AgentRun
  workspace?: SandboxWorkspace
}) => {
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
          <IssueFact label="Branch" value={issue.branchName || 'Not started'} />
          <IssueFact label="PR" value={issue.prUrl || 'Not created'} />
          <IssueFact label="Agent" value={run?.status || 'Not started'} />
        </div>
        {run ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button
              onClick={() => onOpenRun(run.id)}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Bot />
              Agent run
            </Button>
          </div>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1" viewportClassName="px-4 py-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5" />
          Issue brief
        </div>
        <Markdown className="prose prose-sm max-w-none dark:prose-invert prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-headings:mb-1.5 prose-headings:mt-3 prose-p:my-1.5 prose-ol:my-2 prose-ul:my-2 prose-li:my-0.5">
          {issue.description}
        </Markdown>
        {issue.analysis && !run ? (
          <div className="mt-5 border-t pt-3">
            <div className="mb-2 text-xs font-semibold text-muted-foreground">
              Prepared context
            </div>
            <Markdown className="prose prose-sm max-w-none dark:prose-invert prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-headings:mb-1.5 prose-headings:mt-3 prose-p:my-1.5 prose-ol:my-2 prose-ul:my-2 prose-li:my-0.5">
              {issue.analysis}
            </Markdown>
          </div>
        ) : !run ? (
          <EmptyState>
            The agent will assess scope and plan when the run starts.
          </EmptyState>
        ) : null}
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
