import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AgentRun, Issue } from '@patchlane/shared'
import {
  buildIssueTaskProgressSummaries,
  buildTaskWorkItems,
  getIssueTaskStepLabel,
  isTaskWorkItemRunning,
} from './task-work-items'

const timestamp = '2026-06-03T00:00:00.000Z'

describe('task work items', () => {
  it('summarizes issue progress from task completion state', () => {
    const summary = buildIssueTaskProgressSummaries([
      issue({
        subtasks: [
          subtask({ id: 'subtask-1', sequence: 0, status: 'completed' }),
          subtask({ id: 'subtask-2', sequence: 1, status: 'skipped' }),
          subtask({ id: 'subtask-3', sequence: 2, status: 'running' }),
          subtask({ id: 'subtask-4', sequence: 3, status: 'awaiting_user' }),
          subtask({ id: 'subtask-5', sequence: 4, status: 'pending' }),
        ],
      }),
    ])[0]

    assert.equal(summary.total, 5)
    assert.equal(summary.completed, 2)
    assert.equal(summary.skipped, 1)
    assert.equal(summary.active, 1)
    assert.equal(summary.awaitingUser, 1)
    assert.equal(summary.pending, 1)
    assert.equal(summary.percent, 40)
  })

  it('keeps planned issue tasks visible while consuming their linked runs', () => {
    const linkedRun = run({ id: 'run-linked', subtaskId: 'subtask-1' })
    const standaloneRun = run({ id: 'run-standalone' })
    const items = buildTaskWorkItems({
      issues: [
        issue({
          subtasks: [
            subtask({
              agentRunId: linkedRun.id,
              id: 'subtask-1',
              sequence: 0,
              status: 'running',
            }),
            subtask({ id: 'subtask-2', sequence: 1, status: 'pending' }),
          ],
        }),
      ],
      runs: [linkedRun, standaloneRun],
    })
    const taskItems = items.filter((item) => item.type === 'issueTask')
    const runItems = items.filter((item) => item.type === 'run')

    assert.equal(taskItems.length, 2)
    assert.equal(runItems.length, 1)
    assert.equal(runItems[0].run.id, standaloneRun.id)
    assert.equal(getIssueTaskStepLabel(taskItems[0]), 'Step 1/2')
    assert.equal(isTaskWorkItemRunning(taskItems[0]), true)
  })
})

const issue = (patch: Partial<Issue> = {}): Issue => ({
  comments: [],
  createdAt: timestamp,
  description: 'Improve task tracking.',
  events: [],
  id: 'issue-1',
  number: 1,
  priority: 'medium',
  projectId: 'project-1',
  status: 'running',
  subtasks: [],
  title: 'Improve task tracking',
  updatedAt: timestamp,
  ...patch,
})

const subtask = (
  patch: Partial<Issue['subtasks'][number]> = {},
): Issue['subtasks'][number] => ({
  createdAt: timestamp,
  id: 'subtask-1',
  issueId: 'issue-1',
  kind: 'edit',
  sequence: 0,
  status: 'pending',
  title: 'Update task UI',
  updatedAt: timestamp,
  ...patch,
})

const run = (patch: Partial<AgentRun> = {}): AgentRun => ({
  createdAt: timestamp,
  id: 'run-1',
  messages: [
    {
      content: 'Run this task.',
      createdAt: timestamp,
      id: 'message-1',
      role: 'user',
    },
  ],
  status: 'running',
  title: 'Run task',
  updatedAt: timestamp,
  workspaceId: 'workspace-1',
  ...patch,
})
