import type { AgentRun, Issue } from '@patchlane/shared'

export const isIssueTaskWorkflowComplete = (issue: Issue) => {
  return (
    issue.subtasks.length > 0 &&
    issue.subtasks.every(
      (task) => task.status === 'completed' || task.status === 'skipped',
    )
  )
}

export const isIssueSubtaskWorkflowComplete = isIssueTaskWorkflowComplete

export const getNextIssueTask = (issue: Issue) => {
  const completedTaskIds = new Set(
    issue.subtasks
      .filter(
        (task) => task.status === 'completed' || task.status === 'skipped',
      )
      .map((task) => task.id),
  )

  return issue.subtasks.find((task) => {
    if (task.status !== 'pending') {
      return false
    }

    return task.dependsOnSubtaskIds.every((taskId) =>
      completedTaskIds.has(taskId),
    )
  })
}

export const getNextIssueSubtask = getNextIssueTask

export const getIssueTaskRunKind = (
  kind: Issue['subtasks'][number]['kind'],
): AgentRun['kind'] => {
  if (kind === 'verify') {
    return 'verification'
  }

  if (kind === 'publish') {
    return 'publish'
  }

  if (kind === 'followup') {
    return 'followup'
  }

  return 'coding'
}

export const getIssueSubtaskRunKind = getIssueTaskRunKind
