import type { AgentRun, Issue } from '@patchlane/shared'

export type IssueTask = Issue['subtasks'][number]

export type TaskWorkItem =
  | {
      id: string
      issue?: Issue
      run: AgentRun
      type: 'run'
      updatedAt: string
    }
  | {
      id: string
      issue: Issue
      run?: AgentRun
      task: IssueTask
      type: 'issueTask'
      updatedAt: string
    }

export type IssueTaskProgressSummary = {
  active: number
  awaitingUser: number
  completed: number
  failed: number
  id: string
  issue: Issue
  pending: number
  percent: number
  skipped: number
  total: number
  updatedAt: string
}

export type IssueTaskProgressTotals = {
  active: number
  awaitingUser: number
  completed: number
  failed: number
  pending: number
  percent: number
  skipped: number
  total: number
}

export const buildTaskWorkItems = ({
  issues,
  runs,
}: {
  issues: Issue[]
  runs: AgentRun[]
}) => {
  const runById = new Map(runs.map((run) => [run.id, run]))
  const issueById = new Map(issues.map((issue) => [issue.id, issue]))
  const consumedRunIds = new Set<string>()
  const items: TaskWorkItem[] = []

  for (const issue of issues) {
    for (const task of issue.subtasks) {
      const run =
        (task.agentRunId ? runById.get(task.agentRunId) : undefined) ??
        runs.find((candidate) => candidate.subtaskId === task.id)

      if (run) {
        consumedRunIds.add(run.id)
      }

      items.push({
        id: `issueTask:${task.id}`,
        issue,
        run,
        task,
        type: 'issueTask',
        updatedAt: run?.updatedAt ?? task.updatedAt,
      })
    }
  }

  for (const run of runs) {
    if (consumedRunIds.has(run.id)) {
      continue
    }

    items.push({
      id: `run:${run.id}`,
      issue: run.issueId ? issueById.get(run.issueId) : undefined,
      run,
      type: 'run',
      updatedAt: run.updatedAt,
    })
  }

  return items.sort(compareTaskWorkItems)
}

export const buildIssueTaskProgressSummaries = (issues: Issue[]) => {
  return issues
    .filter((issue) => issue.subtasks.length > 0)
    .map((issue): IssueTaskProgressSummary => {
      const total = issue.subtasks.length
      const completed = issue.subtasks.filter(isCompletedIssueTask).length
      const skipped = issue.subtasks.filter(
        (task) => task.status === 'skipped',
      ).length
      const active = issue.subtasks.filter(
        (task) => task.status === 'running',
      ).length
      const awaitingUser = issue.subtasks.filter(
        (task) => task.status === 'awaiting_user',
      ).length
      const failed = issue.subtasks.filter(
        (task) => task.status === 'failed',
      ).length
      const pending = issue.subtasks.filter(
        (task) => task.status === 'pending',
      ).length
      const updatedAt = issue.subtasks.reduce(
        (latest, task) =>
          new Date(task.updatedAt).getTime() > new Date(latest).getTime()
            ? task.updatedAt
            : latest,
        issue.updatedAt,
      )

      return {
        active,
        awaitingUser,
        completed,
        failed,
        id: issue.id,
        issue,
        pending,
        percent: getProgressPercent(completed, total),
        skipped,
        total,
        updatedAt,
      }
    })
    .sort(compareIssueTaskProgressSummaries)
}

export const getIssueTaskProgressTotals = (
  summaries: IssueTaskProgressSummary[],
): IssueTaskProgressTotals => {
  const totals = summaries.reduce(
    (current, summary) => ({
      active: current.active + summary.active,
      awaitingUser: current.awaitingUser + summary.awaitingUser,
      completed: current.completed + summary.completed,
      failed: current.failed + summary.failed,
      pending: current.pending + summary.pending,
      skipped: current.skipped + summary.skipped,
      total: current.total + summary.total,
    }),
    {
      active: 0,
      awaitingUser: 0,
      completed: 0,
      failed: 0,
      pending: 0,
      skipped: 0,
      total: 0,
    },
  )

  return {
    ...totals,
    percent: getProgressPercent(totals.completed, totals.total),
  }
}

export const getSubtaskStepLabel = (
  item: Extract<TaskWorkItem, { type: 'issueTask' }>,
) => getIssueTaskStepLabel(item)

export const getIssueTaskStepLabel = (
  item: Extract<TaskWorkItem, { type: 'issueTask' }>,
) => `Step ${item.task.sequence + 1}/${item.issue.subtasks.length}`

export const isTaskWorkItemRunning = (item: TaskWorkItem) => {
  if (item.type === 'run') {
    return item.run.status === 'running' || item.run.status === 'idle'
  }

  return item.task.status === 'running'
}

const isCompletedIssueTask = (task: IssueTask) => {
  return task.status === 'completed' || task.status === 'skipped'
}

const getProgressPercent = (completed: number, total: number) => {
  if (total === 0) {
    return 0
  }

  return Math.round((completed / total) * 100)
}

const compareTaskWorkItems = (left: TaskWorkItem, right: TaskWorkItem) => {
  const dateCompare =
    new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()

  if (dateCompare !== 0) {
    return dateCompare
  }

  if (left.type === 'issueTask' && right.type === 'issueTask') {
    return left.task.sequence - right.task.sequence
  }

  if (left.type === 'issueTask') {
    return -1
  }

  if (right.type === 'issueTask') {
    return 1
  }

  return left.run.title.localeCompare(right.run.title)
}

const compareIssueTaskProgressSummaries = (
  left: IssueTaskProgressSummary,
  right: IssueTaskProgressSummary,
) => {
  const statusCompare = getProgressSortRank(left) - getProgressSortRank(right)

  if (statusCompare !== 0) {
    return statusCompare
  }

  return (
    new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  )
}

const getProgressSortRank = (summary: IssueTaskProgressSummary) => {
  if (summary.active > 0) {
    return 0
  }

  if (summary.awaitingUser > 0 || summary.failed > 0) {
    return 1
  }

  if (summary.completed < summary.total) {
    return 2
  }

  return 3
}
