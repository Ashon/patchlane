import { describe, expect, it } from '@jest/globals'
import type { AgentProject, Issue } from '@patchlane/shared'
import {
  buildIssueSubtaskPlanningPrompt,
  parseIssueSubtaskPlan,
} from './issueSubtaskPlanning'

describe('Given issue subtask planning', () => {
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
    analysis: 'The current issue flow runs one broad coding task.',
    comments: [],
    createdAt: '2026-06-03T00:00:00.000Z',
    description:
      'Allow complex agentic coding issues to be split into subtasks and verified incrementally.',
    events: [],
    id: 'issue-1',
    priority: 'high',
    projectId: project.id,
    status: 'ready',
    subtasks: [],
    title: 'Split complex issue work',
    updatedAt: '2026-06-03T00:00:00.000Z',
  }

  it('when building a planning prompt, then it asks for bounded concrete JSON subtasks', () => {
    const prompt = buildIssueSubtaskPlanningPrompt({ issue, project })

    expect(prompt).toContain('Return only JSON')
    expect(prompt).toContain('2 to 8 subtasks')
    expect(prompt).toContain('inspect, edit, and verify')
    expect(prompt).toContain('concrete completion signal')
    expect(prompt).toContain('one focused agent run')
    expect(prompt).toContain('Do not create vague subtasks')
    expect(prompt).toContain('Split complex issue work')
    expect(prompt).toContain('Prior issue context')
  })

  it('when parsing a fenced JSON plan, then it returns validated subtask inputs', () => {
    const plan = parseIssueSubtaskPlan(`
      \`\`\`json
      {
        "subtasks": [
          {
            "title": "Inspect current issue workflow",
            "description": "Find the API, store, and UI points that assume one run per issue.",
            "kind": "inspect"
          },
          {
            "title": "Persist issue subtasks",
            "description": "Add schema, database, and store support for ordered subtasks.",
            "kind": "edit"
          },
          {
            "title": "Verify subtask persistence",
            "description": "Run focused unit and type checks for the new workflow model.",
            "kind": "verify"
          }
        ]
      }
      \`\`\`
    `)

    expect(plan.subtasks.map((subtask) => subtask.kind)).toEqual([
      'inspect',
      'edit',
      'verify',
    ])
    expect(plan.subtasks[0]?.title).toBe('Inspect current issue workflow')
  })

  it('when parsing an invalid plan, then it rejects plans that are too broad to track', () => {
    expect(() =>
      parseIssueSubtaskPlan(
        JSON.stringify({
          subtasks: Array.from({ length: 21 }, (_, index) => ({
            kind: 'edit',
            title: `Unbounded task ${index}`,
          })),
        }),
      ),
    ).toThrow()
  })
})
