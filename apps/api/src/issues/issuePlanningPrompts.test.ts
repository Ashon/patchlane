import { describe, expect, it } from '@jest/globals'
import type { AgentProject, Issue, SandboxWorkspace } from '@patchlane/shared'
import {
  buildRequirementAnalysisPrompt,
  buildWorkPlanPrompt,
  requirementAnalysisSystemPrompt,
  workPlanSystemPrompt,
  type IssuePlanningPromptInput,
} from './issuePlanningPrompts'

describe('Given issue planning prompts', () => {
  const project: AgentProject = {
    branchPrefix: 'agent',
    createdAt: '2026-06-03T00:00:00.000Z',
    description: 'Prefer small, well-tested API changes.',
    id: 'project-1',
    name: 'Patchlane',
    repositoryRef: 'main',
    repositoryUrl: 'https://github.com/ashon/patchlane',
    updatedAt: '2026-06-03T00:00:00.000Z',
  }

  const issue: Issue = {
    createdAt: '2026-06-03T00:00:00.000Z',
    description: 'Move prompt construction into tested modules.',
    events: [],
    id: 'issue-1',
    priority: 'medium',
    projectId: project.id,
    status: 'planning',
    title: 'Structure agent prompts',
    updatedAt: '2026-06-03T00:00:00.000Z',
  }

  const workspace: SandboxWorkspace = {
    cleanupStatus: 'active',
    createdAt: '2026-06-03T00:00:00.000Z',
    id: 'workspace-1',
    kind: 'project_cache',
    name: 'Patchlane cache',
    path: '/tmp/patchlane/repo',
    status: 'ready',
    updatedAt: '2026-06-03T00:00:00.000Z',
  }

  const input: IssuePlanningPromptInput = {
    branchName: 'agent/structure-prompts',
    fileEntries: [
      {
        name: 'agentRuntime.ts',
        path: 'apps/api/src/agent/agentRuntime.ts',
        size: 64000,
        type: 'file',
      },
      {
        name: 'issues',
        path: 'apps/api/src/issues',
        type: 'directory',
      },
    ],
    issue,
    project,
    workspace,
  }

  it('when building requirement analysis prompts, then it defines the markdown contract and context', () => {
    const prompt = buildRequirementAnalysisPrompt(input)

    expect(prompt).toContain('Required Markdown structure:')
    expect(prompt).toContain('### Requirement Summary')
    expect(prompt).toContain('### Acceptance Criteria')
    expect(prompt).toContain('- Project: Patchlane')
    expect(prompt).toContain(
      '- Suggested branch/worktree: agent/structure-prompts',
    )
    expect(prompt).toContain('- Path: /tmp/patchlane/repo')
    expect(prompt).toContain(
      '- file apps/api/src/agent/agentRuntime.ts (64000 bytes)',
    )
    expect(prompt).toContain('- dir apps/api/src/issues')
  })

  it('when building work plan prompts, then it includes requirements analysis and handoff sections', () => {
    const prompt = buildWorkPlanPrompt(input, 'Keep prompts tested and pure.')

    expect(prompt).toContain('### Implementation Plan')
    expect(prompt).toContain('### Verification Plan')
    expect(prompt).toContain('### Agent Handoff')
    expect(prompt).toContain('Requirements analysis:')
    expect(prompt).toContain('Keep prompts tested and pure.')
    expect(prompt).toContain('Project and workspace context:')
  })

  it('when using planning system prompts, then they prohibit implementation work', () => {
    expect(requirementAnalysisSystemPrompt).toContain('Do not implement code')
    expect(workPlanSystemPrompt).toContain('Do not claim work is complete')
  })
})
