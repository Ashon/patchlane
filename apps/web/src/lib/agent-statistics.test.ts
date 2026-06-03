import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AgentRun } from '@patchlane/shared'
import { buildAgentStatistics } from './agent-statistics'

const timestamp = '2026-06-03T00:00:00.000Z'

describe('agent statistics', () => {
  it('deduplicates provider usage across assistant and tool messages from one request', () => {
    const run = agentRun([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '<think>Inspecting.</think>',
        createdAt: timestamp,
        metadata: {
          request: {
            attempt: 1,
            iteration: 1,
            model: 'model-a',
          },
          usage: {
            inputTokens: 100,
            outputTokens: 20,
            totalTokens: 120,
          },
          reasoning: {
            characters: 11,
            estimatedTokens: 4,
          },
        },
      },
      {
        id: 'tool-1',
        role: 'tool',
        content: '{"ok":true}',
        toolName: 'list_files',
        createdAt: timestamp,
        metadata: {
          request: {
            attempt: 1,
            iteration: 1,
            model: 'model-a',
          },
          usage: {
            inputTokens: 100,
            outputTokens: 20,
            totalTokens: 120,
          },
          tool: {
            input: {
              characters: 2,
              estimatedTokens: 1,
            },
            output: {
              characters: 11,
              estimatedTokens: 4,
            },
          },
        },
      },
      {
        id: 'tool-2',
        role: 'tool',
        content: '{"ok":true}',
        toolName: 'git_status',
        createdAt: timestamp,
        metadata: {
          request: {
            attempt: 1,
            iteration: 1,
            model: 'model-a',
          },
          usage: {
            inputTokens: 100,
            outputTokens: 20,
            totalTokens: 120,
          },
          tool: {
            output: {
              characters: 11,
              estimatedTokens: 4,
            },
          },
        },
      },
    ])

    const stats = buildAgentStatistics({
      endpoints: [],
      issues: [],
      projects: [],
      runs: [run],
    })

    assert.equal(stats.totals.providerRequests, 1)
    assert.equal(stats.totals.providerInputTokens, 100)
    assert.equal(stats.totals.providerOutputTokens, 20)
    assert.equal(stats.totals.providerTotalTokens, 120)
    assert.equal(stats.totals.toolUses, 2)
    assert.equal(stats.totals.toolOutputTokens, 8)
    assert.equal(stats.totals.reasoningBlocks, 1)
  })

  it('exposes supervisor chat as an uncollected source segment', () => {
    const stats = buildAgentStatistics({
      endpoints: [],
      issues: [],
      projects: [],
      runs: [],
    })
    const supervisorRow = stats.sourceRows.find(
      (row) => row.id === 'supervisor-chat',
    )

    assert.equal(supervisorRow?.status, 'not_collected')
    assert.equal(supervisorRow?.metrics.runs, 0)
  })
})

const agentRun = (messages: AgentRun['messages']): AgentRun => ({
  id: 'run-1',
  workspaceId: 'workspace-1',
  title: 'Inspect workspace',
  kind: 'coding',
  status: 'completed',
  messages,
  createdAt: timestamp,
  updatedAt: timestamp,
})
