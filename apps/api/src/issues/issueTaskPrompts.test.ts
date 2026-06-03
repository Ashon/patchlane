import { describe, expect, it } from '@jest/globals'
import type { AgentProject, Issue } from '@patchlane/shared'
import { buildIssueRunTaskPrompt } from './issueTaskPrompts'

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
    expect(prompt).toContain('run relevant verification')
  })
})
