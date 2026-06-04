import { describe, expect, it } from '@jest/globals'
import type { Issue } from '@patchlane/shared'
import {
  getIssueSubtaskRunKind,
  getNextIssueSubtask,
  isIssueSubtaskWorkflowComplete,
} from './issueSubtaskWorkflow'

const timestamp = '2026-06-03T00:00:00.000Z'

describe('Given issue subtask workflow', () => {
  it('when subtasks have dependencies, then it returns the first pending runnable subtask', () => {
    const issue = issueWithSubtasks([
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

    expect(getNextIssueSubtask(issue)?.id).toBe('edit')
  })

  it('when a pending subtask is waiting on an unfinished dependency, then it does not return it', () => {
    const issue = issueWithSubtasks([
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

    expect(getNextIssueSubtask(issue)).toBeUndefined()
  })

  it('when all subtasks are completed or skipped, then the workflow is complete', () => {
    expect(
      isIssueSubtaskWorkflowComplete(
        issueWithSubtasks([
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

  it('when mapping subtask kinds, then verification and publish runs keep distinct run kinds', () => {
    expect(getIssueSubtaskRunKind('inspect')).toBe('coding')
    expect(getIssueSubtaskRunKind('edit')).toBe('coding')
    expect(getIssueSubtaskRunKind('verify')).toBe('verification')
    expect(getIssueSubtaskRunKind('publish')).toBe('publish')
    expect(getIssueSubtaskRunKind('followup')).toBe('followup')
  })
})

const issueWithSubtasks = (
  subtasks: Array<{
    dependsOnSubtaskIds?: string[]
    id: string
    status: Issue['subtasks'][number]['status']
    title: string
  }>,
): Issue => ({
  comments: [],
  createdAt: timestamp,
  description: 'Split this work into ordered subtasks.',
  events: [],
  id: 'issue-1',
  priority: 'medium',
  projectId: 'project-1',
  status: 'running',
  subtasks: subtasks.map((subtask, index) => ({
    createdAt: timestamp,
    dependsOnSubtaskIds: subtask.dependsOnSubtaskIds ?? [],
    id: subtask.id,
    issueId: 'issue-1',
    kind: index === subtasks.length - 1 ? 'verify' : 'edit',
    sequence: index,
    status: subtask.status,
    title: subtask.title,
    updatedAt: timestamp,
  })),
  title: 'Workflow issue',
  updatedAt: timestamp,
})
