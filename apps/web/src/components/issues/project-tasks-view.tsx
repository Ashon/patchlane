import type { AgentRun, Issue } from '@agent-fleet/shared'
import { ListChecks } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Page, PageHeader } from '@/components/layout/page-primitives'
import {
  AgentRunKindBadge,
  AgentRunStatusBadge,
  EmptyState,
  MetricBadge,
} from './common'
import { formatDateTime } from './utils'

export const ProjectTasksView = ({
  issues,
  onOpenRun,
  runs,
}: {
  issues: Issue[]
  onOpenRun: (runId: string) => void
  runs: AgentRun[]
}) => {
  const issueById = new Map(issues.map((issue) => [issue.id, issue]))

  return (
    <Page className="min-h-[360px]">
      <PageHeader
        actions={
          <>
          <MetricBadge label="Total" value={runs.length} />
          <MetricBadge
            label="Running"
            value={runs.filter((run) => run.status === 'running').length}
          />
          </>
        }
        description="Project-scoped agent task history"
        icon={<ListChecks className="h-4 w-4" />}
        title="Tasks"
      />
      <ScrollArea className="min-h-0 flex-1">
        {runs.length ? (
          <div className="divide-y">
            {runs.map((run) => {
              const issue = run.issueId ? issueById.get(run.issueId) : undefined
              const promptPreview =
                run.messages
                  .find((message) => message.role === 'user')
                  ?.content.split('\n')
                  .find(Boolean) ?? ''

              return (
                <button
                  className="grid w-full gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/70 md:grid-cols-[minmax(0,1fr)_auto]"
                  key={run.id}
                  onClick={() => onOpenRun(run.id)}
                  type="button"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <AgentRunKindBadge kind={run.kind} />
                      <span className="truncate text-sm font-semibold">
                        {run.title}
                      </span>
                      <AgentRunStatusBadge status={run.status} />
                    </div>
                    {promptPreview ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {promptPreview}
                      </p>
                    ) : null}
                    {issue ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        Issue: {issue.title}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground md:justify-end">
                    <span>{formatDateTime(run.updatedAt)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="p-3">
            <EmptyState>No tasks in this project</EmptyState>
          </div>
        )}
      </ScrollArea>
    </Page>
  )
}
