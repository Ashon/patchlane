import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AgentRun } from '@patchlane/shared'
import { buildTaskWorkItems, isTaskWorkItemRunning } from './task-work-items'

const timestamp = '2026-06-03T00:00:00.000Z'

describe('task work items', () => {
  it('builds one run work item per agent run, newest first', () => {
    const older = run({
      id: 'run-older',
      title: 'Older',
      updatedAt: '2026-06-02T00:00:00.000Z',
    })
    const newer = run({
      id: 'run-newer',
      title: 'Newer',
      updatedAt: '2026-06-04T00:00:00.000Z',
    })
    const items = buildTaskWorkItems({ runs: [older, newer] })

    assert.equal(items.length, 2)
    assert.equal(items[0].type, 'run')
    assert.equal(items[0].run.id, 'run-newer')
    assert.equal(items[1].run.id, 'run-older')
  })

  it('marks running and idle runs as running work items', () => {
    const runningItem = buildTaskWorkItems({
      runs: [run({ status: 'running' })],
    })[0]
    const completedItem = buildTaskWorkItems({
      runs: [run({ status: 'completed' })],
    })[0]

    assert.equal(isTaskWorkItemRunning(runningItem), true)
    assert.equal(isTaskWorkItemRunning(completedItem), false)
  })
})

const run = (patch: Partial<AgentRun> = {}): AgentRun => ({
  createdAt: timestamp,
  id: 'run-1',
  kind: 'coding',
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
