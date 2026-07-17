import type { AgentRun } from '@patchlane/shared'

export type TaskWorkItem = {
  id: string
  run: AgentRun
  type: 'run'
  updatedAt: string
}

export const buildTaskWorkItems = ({ runs }: { runs: AgentRun[] }) => {
  const items: TaskWorkItem[] = runs.map((run) => ({
    id: `run:${run.id}`,
    run,
    type: 'run',
    updatedAt: run.updatedAt,
  }))

  return items.sort(compareTaskWorkItems)
}

export const isTaskWorkItemRunning = (item: TaskWorkItem) => {
  return item.run.status === 'running' || item.run.status === 'idle'
}

const compareTaskWorkItems = (left: TaskWorkItem, right: TaskWorkItem) => {
  const dateCompare =
    new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()

  if (dateCompare !== 0) {
    return dateCompare
  }

  return left.run.title.localeCompare(right.run.title)
}
