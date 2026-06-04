import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AgentRun } from '@patchlane/shared'
import { formatTaskRunMetricItems, getTaskRunMetrics } from './task-run-metrics'

const timestamp = '2026-06-03T00:00:00.000Z'

describe('task run metrics', () => {
  it('deduplicates provider usage while counting turns and tools', () => {
    const metrics = getTaskRunMetrics(
      run({
        messages: [
          message({ id: 'user-1', role: 'user' }),
          message({
            id: 'assistant-1',
            metadata: requestMetadata(1, 1, 120, { durationMs: 1_200 }),
            role: 'assistant',
          }),
          message({
            id: 'tool-1',
            metadata: requestMetadata(1, 1, 120, { durationMs: 200 }),
            role: 'tool',
          }),
          message({
            id: 'assistant-2',
            metadata: requestMetadata(2, 2, 80, { durationMs: 4_000 }),
            role: 'assistant',
          }),
        ],
        status: 'awaiting_user',
      }),
    )

    assert.equal(metrics.durationMs, 5_400)
    assert.equal(metrics.providerRequests, 2)
    assert.equal(metrics.providerTotalTokens, 200)
    assert.equal(metrics.retryCount, 1)
    assert.equal(metrics.toolUses, 1)
    assert.equal(metrics.turns, 2)
    assert.equal(metrics.awaitingUser, 1)
  })

  it('formats pending and completed run metric labels', () => {
    assert.deepEqual(formatTaskRunMetricItems(), ['not started'])
    assert.deepEqual(
      formatTaskRunMetricItems(
        run({
          messages: [
            message({ id: 'user-1', role: 'user' }),
            message({
              id: 'assistant-1',
              metadata: requestMetadata(1, 1, 1_240, { durationMs: 2_400 }),
              role: 'assistant',
            }),
          ],
        }),
      ),
      ['1 turn', '1.2k tok', '2.4s'],
    )
  })
})

const run = (patch: Partial<AgentRun> = {}): AgentRun => ({
  createdAt: timestamp,
  id: 'run-1',
  messages: [],
  status: 'running',
  title: 'Run task',
  updatedAt: timestamp,
  workspaceId: 'workspace-1',
  ...patch,
})

const message = (
  patch: Partial<AgentRun['messages'][number]>,
): AgentRun['messages'][number] => ({
  content: '',
  createdAt: timestamp,
  id: 'message-1',
  role: 'assistant',
  ...patch,
})

const requestMetadata = (
  attempt: number,
  iteration: number,
  totalTokens: number,
  patch: Partial<NonNullable<AgentRun['messages'][number]['metadata']>> = {},
): NonNullable<AgentRun['messages'][number]['metadata']> => ({
  ...patch,
  request: {
    attempt,
    iteration,
    model: 'test-model',
  },
  usage: {
    totalTokens,
  },
})
