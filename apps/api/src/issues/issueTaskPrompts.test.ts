import { describe, expect, it } from '@jest/globals'
import type { AgentProject, Issue } from '@patchlane/shared'
import {
  buildIssueRunTaskPrompt,
  buildIssueSubtaskRunTaskPrompt,
} from './issueTaskPrompts'

describe('Given issue task prompts', () => {
  const project: AgentProject = {
    branchPrefix: 'agent',
    createdAt: '2026-06-03T00:00:00.000Z',
    description: 'Keep changes focused and verify with tests.',
    id: 'project-1',
    name: 'Patchlane',
    repositoryRef: 'main',
    repositoryUrl: 'https://github.com/ashon/patchlane',
    updatedAt: '2026-06-03T00:00:00.000Z',
  }

  const issue: Issue = {
    analysis: 'The API prompt code should be easier to test.',
    createdAt: '2026-06-03T00:00:00.000Z',
    description: 'Refactor prompt construction out of the route.',
    events: [],
    id: 'issue-1',
    priority: 'high',
    projectId: project.id,
    status: 'ready',
    subtasks: [],
    title: 'Refactor API prompts',
    updatedAt: '2026-06-03T00:00:00.000Z',
  }

  it('when building a coding run task, then it delegates triage, planning, and execution to the agent', () => {
    const prompt = buildIssueRunTaskPrompt({
      branchName: 'agent/refactor-prompts',
      issue,
      project,
    })

    expect(prompt).toContain('Issue: Refactor API prompts')
    expect(prompt).toContain('Priority: high')
    expect(prompt).toContain('Project policy: Keep changes focused')
    expect(prompt).toContain('Branch/worktree target: agent/refactor-prompts')
    expect(prompt).toContain('Prior issue context:')
    expect(prompt).toContain('Own this issue from triage through completion')
    expect(prompt).toContain(
      'Do not wait for separate requirement-analysis or planning tasks',
    )
    expect(prompt).toContain(
      'classify scope as tiny, small, medium, large, or risky',
    )
    expect(prompt).toContain('concrete completion target')
    expect(prompt).toContain('Do not stop at analysis')
    expect(prompt).toContain('Avoid broad repo tours')
    expect(prompt).toContain('tutoring signals')
    expect(prompt).toContain('safe interpretation')
    expect(prompt).toContain('Use add_issue_comment')
    expect(prompt).toContain('kind=blocked')
    expect(prompt).toContain('inspect git status/diff')
    expect(prompt).toContain('summary issue comment')
    expect(prompt).toContain('run relevant verification')
  })

  it('when building a subtask run task, then it scopes execution to the current subtask and prior summaries', () => {
    const subtask = {
      createdAt: '2026-06-03T00:00:00.000Z',
      description: 'Add persistence and route support for issue subtasks.',
      id: 'subtask-2',
      issueId: issue.id,
      kind: 'edit' as const,
      sequence: 1,
      status: 'pending' as const,
      title: 'Persist subtasks',
      updatedAt: '2026-06-03T00:00:00.000Z',
    }
    const prompt = buildIssueSubtaskRunTaskPrompt({
      branchName: 'agent/refactor-prompts',
      issue: {
        ...issue,
        subtasks: [
          {
            createdAt: '2026-06-03T00:00:00.000Z',
            id: 'subtask-1',
            issueId: issue.id,
            kind: 'inspect',
            resultSummary:
              'Found issue store and project detail UI extension points.',
            sequence: 0,
            status: 'completed',
            title: 'Inspect workflow',
            updatedAt: '2026-06-03T00:00:00.000Z',
          },
          subtask,
        ],
      },
      project,
      subtask,
    })

    expect(prompt).toContain('Current subtask: Persist subtasks')
    expect(prompt).toContain('Subtask completion target:')
    expect(prompt).toContain('Previous completed subtasks:')
    expect(prompt).toContain('Found issue store')
    expect(prompt).toContain('Complete only this subtask')
    expect(prompt).toContain('preserving the existing issue branch/worktree')
    expect(prompt).toContain('Do not restart the whole issue from scratch')
    expect(prompt).toContain('Budget tool calls aggressively')
    expect(prompt).toContain('Edit subtask boundary')
    expect(prompt).toContain('final subtask summary')
    expect(prompt).toContain('Call finish when this subtask is complete')
  })

  it('when building an inspect subtask run task, then it forbids implementation drift', () => {
    const subtask = {
      createdAt: '2026-06-03T00:00:00.000Z',
      description: 'Catalog relevant tool result shapes and UI files.',
      id: 'subtask-inspect',
      issueId: issue.id,
      kind: 'inspect' as const,
      sequence: 0,
      status: 'pending' as const,
      title: 'Catalog tool output rendering',
      updatedAt: '2026-06-03T00:00:00.000Z',
    }
    const prompt = buildIssueSubtaskRunTaskPrompt({
      branchName: 'agent/refactor-prompts',
      issue: {
        ...issue,
        subtasks: [subtask],
      },
      project,
      subtask,
    })

    expect(prompt).toContain('Inspect subtask boundary')
    expect(prompt).toContain('do not call write_file')
    expect(prompt).toContain('do not continue into implementation')
    expect(prompt).toContain('For catalog-style inspect work')
    expect(prompt).toContain('call finish')
  })
})
