import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AgentProject, AgentRun, Issue } from '@patchlane/shared'
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

  it('uses compact labels for recent issue task runs', () => {
    const project = agentProject()
    const issue = agentIssue(project.id)
    const run = agentRun([], {
      id: 'run-task-1',
      issueId: issue.id,
      projectId: project.id,
      subtaskId: 'task-1',
      title: `${issue.title}: Update API to accept title-only issues`,
    })

    const stats = buildAgentStatistics({
      endpoints: [],
      issues: [issue],
      projects: [project],
      runs: [run],
    })

    assert.equal(
      stats.recentRunRows[0]?.label,
      'Update API to accept title-only issues',
    )
    assert.equal(stats.recentRunRows[0]?.description, 'Patchlane / PLN-7')
  })
})

const agentRun = (
  messages: AgentRun['messages'],
  overrides: Partial<AgentRun> = {},
): AgentRun => ({
  id: overrides.id ?? 'run-1',
  workspaceId: 'workspace-1',
  title: overrides.title ?? 'Inspect workspace',
  kind: 'coding',
  status: overrides.status ?? 'completed',
  messages,
  projectId: overrides.projectId,
  issueId: overrides.issueId,
  subtaskId: overrides.subtaskId,
  createdAt: timestamp,
  updatedAt: timestamp,
})

const agentProject = (): AgentProject => ({
  id: 'project-1',
  code: 'PLN',
  name: 'Patchlane',
  description: 'Patchlane project',
  repositoryUrl: 'https://github.com/ashon/patchlane',
  repositoryRef: 'main',
  branchPrefix: 'agent',
  createdAt: timestamp,
  updatedAt: timestamp,
})

const agentIssue = (projectId: string): Issue => ({
  id: 'issue-1',
  number: 7,
  title: 'issue 등록 시 Title만 등록해도 issue 가 등록될 수 있게 변경한다.',
  description: 'Allow title-only issues.',
  projectId,
  status: 'running',
  priority: 'medium',
  events: [],
  comments: [],
  subtasks: [
    {
      id: 'task-1',
      issueId: 'issue-1',
      title: 'Update API to accept title-only issues',
      status: 'running',
      kind: 'edit',
      sequence: 1,
      dependsOnSubtaskIds: [],
      agentRunId: 'run-task-1',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  createdAt: timestamp,
  updatedAt: timestamp,
})
