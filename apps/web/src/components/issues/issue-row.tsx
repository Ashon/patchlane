import type { AgentProject, Issue } from '@patchlane/shared'
import { PageListItem } from '@/components/layout/page-primitives'
import { IssueReferenceBadge, IssueStatusBadge, PriorityBadge } from './common'
import { IssueTaskProgress } from './issue-task-progress'

export const IssueRow = ({
  issue,
  onSelect,
  project,
  selected,
}: {
  issue: Issue
  onSelect: () => void
  project: AgentProject
  selected: boolean
}) => {
  return (
    <PageListItem selected={selected}>
      <button
        className="block w-full min-w-0 text-left"
        onClick={onSelect}
        type="button"
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <IssueReferenceBadge issue={issue} project={project} />
            <PriorityBadge className="shrink-0" priority={issue.priority} />
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <IssueStatusBadge status={issue.status} />
          </span>
        </div>
        <p
          className="mt-1.5 line-clamp-2 min-w-0 text-sm font-medium leading-snug"
          title={issue.title}
        >
          {issue.title}
        </p>
        <IssueTaskProgress className="mt-2" issue={issue} size="compact" />
      </button>
    </PageListItem>
  )
}
