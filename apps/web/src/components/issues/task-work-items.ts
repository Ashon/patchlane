import type { AgentRun, Issue } from '@patchlane/shared'

export type IssueSubtask = Issue['subtasks'][number]

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
      subtask: IssueSubtask
      type: 'subtask'
      updatedAt: string
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
    for (const subtask of issue.subtasks) {
      const run =
        (subtask.agentRunId ? runById.get(subtask.agentRunId) : undefined) ??
        runs.find((candidate) => candidate.subtaskId === subtask.id)

      if (run) {
        consumedRunIds.add(run.id)
      }

      items.push({
        id: `subtask:${subtask.id}`,
        issue,
        run,
        subtask,
        type: 'subtask',
        updatedAt: run?.updatedAt ?? subtask.updatedAt,
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

export const isTaskWorkItemRunning = (item: TaskWorkItem) => {
  if (item.type === 'run') {
    return item.run.status === 'running' || item.run.status === 'idle'
  }

  return item.subtask.status === 'running'
}

const compareTaskWorkItems = (left: TaskWorkItem, right: TaskWorkItem) => {
  const dateCompare =
    new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()

  if (dateCompare !== 0) {
    return dateCompare
  }

  if (left.type === 'subtask' && right.type === 'subtask') {
    return left.subtask.sequence - right.subtask.sequence
  }

  if (left.type === 'subtask') {
    return -1
  }

  if (right.type === 'subtask') {
    return 1
  }

  return left.run.title.localeCompare(right.run.title)
}
