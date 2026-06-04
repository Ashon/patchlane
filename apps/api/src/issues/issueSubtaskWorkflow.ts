import type { AgentRun, Issue } from '@patchlane/shared'

export const isIssueSubtaskWorkflowComplete = (issue: Issue) => {
  return (
    issue.subtasks.length > 0 &&
    issue.subtasks.every(
      (subtask) =>
        subtask.status === 'completed' || subtask.status === 'skipped',
    )
  )
}

export const getNextIssueSubtask = (issue: Issue) => {
  const completedSubtaskIds = new Set(
    issue.subtasks
      .filter(
        (subtask) =>
          subtask.status === 'completed' || subtask.status === 'skipped',
      )
      .map((subtask) => subtask.id),
  )

  return issue.subtasks.find((subtask) => {
    if (subtask.status !== 'pending') {
      return false
    }

    return subtask.dependsOnSubtaskIds.every((subtaskId) =>
      completedSubtaskIds.has(subtaskId),
    )
  })
}

export const getIssueSubtaskRunKind = (
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
