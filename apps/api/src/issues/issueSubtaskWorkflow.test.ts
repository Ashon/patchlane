import { describe, expect, it } from '@jest/globals'
import type { Issue } from '@patchlane/shared'
import {
  getIssueTaskRunKind,
  getNextIssueTask,
  isIssueTaskWorkflowComplete,
} from './issueSubtaskWorkflow'

const timestamp = '2026-06-03T00:00:00.000Z'

describe('Given issue task workflow', () => {
  it('when tasks have dependencies, then it returns the first pending runnable task', () => {
    const issue = issueWithTasks([
      {
        id: 'inspect',
        status: 'completed',
        title: 'Inspect',
      },
      {
        dependsOnSubtaskIds: ['inspect'],
        id: 'edit',
        status: 'pending',
        title: 'Edit',
      },
      {
        dependsOnSubtaskIds: ['edit'],
        id: 'verify',
        status: 'pending',
        title: 'Verify',
      },
    ])

    expect(getNextIssueTask(issue)?.id).toBe('edit')
  })

  it('when a pending task is waiting on an unfinished dependency, then it does not return it', () => {
    const issue = issueWithTasks([
      {
        id: 'inspect',
        status: 'running',
        title: 'Inspect',
      },
      {
        dependsOnSubtaskIds: ['inspect'],
        id: 'edit',
        status: 'pending',
        title: 'Edit',
      },
    ])

    expect(getNextIssueTask(issue)).toBeUndefined()
  })

  it('when all tasks are completed or skipped, then the workflow is complete', () => {
    expect(
      isIssueTaskWorkflowComplete(
        issueWithTasks([
          {
            id: 'inspect',
            status: 'completed',
            title: 'Inspect',
          },
          {
            id: 'publish',
            status: 'skipped',
            title: 'Publish',
          },
        ]),
      ),
    ).toBe(true)
  })

  it('when mapping task kinds, then verification and publish runs keep distinct run kinds', () => {
    expect(getIssueTaskRunKind('inspect')).toBe('coding')
    expect(getIssueTaskRunKind('edit')).toBe('coding')
    expect(getIssueTaskRunKind('verify')).toBe('verification')
    expect(getIssueTaskRunKind('publish')).toBe('publish')
    expect(getIssueTaskRunKind('followup')).toBe('followup')
  })
})

const issueWithTasks = (
  tasks: Array<{
    dependsOnSubtaskIds?: string[]
    id: string
    status: Issue['subtasks'][number]['status']
    title: string
  }>,
): Issue => ({
  comments: [],
  createdAt: timestamp,
  description: 'Split this work into ordered tasks.',
  events: [],
  id: 'issue-1',
  priority: 'medium',
  projectId: 'project-1',
  status: 'running',
  subtasks: tasks.map((task, index) => ({
    createdAt: timestamp,
    dependsOnSubtaskIds: task.dependsOnSubtaskIds ?? [],
    id: task.id,
    issueId: 'issue-1',
    kind: index === tasks.length - 1 ? 'verify' : 'edit',
    sequence: index,
    status: task.status,
    title: task.title,
    updatedAt: timestamp,
  })),
  title: 'Workflow issue',
  updatedAt: timestamp,
})
