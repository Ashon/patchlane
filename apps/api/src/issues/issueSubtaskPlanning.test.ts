import { describe, expect, it } from '@jest/globals'
import type { AgentProject, Issue } from '@patchlane/shared'
import {
  buildIssueTaskPlanningPrompt,
  parseIssueTaskPlan,
} from './issueSubtaskPlanning'

describe('Given issue task planning', () => {
  const project: AgentProject = {
    branchPrefix: 'agent',
    code: 'PLN',
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
      'Allow complex agentic coding issues to be split into tasks and verified incrementally.',
    events: [],
    id: 'issue-1',
    number: 1,
    priority: 'high',
    projectId: project.id,
    status: 'ready',
    subtasks: [],
    title: 'Split complex issue work',
    updatedAt: '2026-06-03T00:00:00.000Z',
  }

  it('when building a planning prompt, then it asks for bounded concrete JSON tasks', () => {
    const prompt = buildIssueTaskPlanningPrompt({ issue, project })

    expect(prompt).toContain('Return only JSON')
    expect(prompt).toContain('2 to 8 issue tasks')
    expect(prompt).toContain('"tasks"')
    expect(prompt).toContain('research or inspect, edit, and verify')
    expect(prompt).toContain('Use research instead of inspect')
    expect(prompt).toContain('A research task is read-only')
    expect(prompt).toContain('concrete completion signal')
    expect(prompt).toContain('one focused agent run')
    expect(prompt).toContain('Do not create vague tasks')
    expect(prompt).toContain('Split complex issue work')
    expect(prompt).toContain('Prior issue context')
  })

  it('when parsing a fenced JSON plan, then it returns validated task inputs', () => {
    const plan = parseIssueTaskPlan(`
      \`\`\`json
      {
        "tasks": [
          {
            "title": "Research current issue workflow",
            "description": "Find the API, store, and UI points that assume one run per issue.",
            "kind": "research"
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

    expect(plan.tasks.map((task) => task.kind)).toEqual([
      'research',
      'edit',
      'verify',
    ])
    expect(plan.tasks[0]?.title).toBe('Research current issue workflow')
  })

  it('when parsing a legacy subtask JSON plan, then it maps it to issue tasks', () => {
    const plan = parseIssueTaskPlan(
      JSON.stringify({
        subtasks: [
          {
            kind: 'inspect',
            title: 'Inspect current issue workflow',
          },
        ],
      }),
    )

    expect(plan.tasks[0]?.title).toBe('Inspect current issue workflow')
  })

  it('when parsing a JSON-like plan, then it repairs common model formatting drift', () => {
    const plan = parseIssueTaskPlan(`
      Here is the plan:
      {
        tasks: [
          {
            title: 'Inspect current issue workflow',
            description: 'Find API and UI validation points.',
            kind: 'inspect',
          },
          {
            title: 'Verify title-only issue creation',
            description: 'Run focused API and web checks.',
            kind: 'verify',
          },
        ],
      }
    `)

    expect(plan.tasks).toHaveLength(2)
    expect(plan.tasks[0]?.kind).toBe('inspect')
    expect(plan.tasks[1]?.title).toBe('Verify title-only issue creation')
  })

  it('when parsing an invalid plan, then it rejects plans that are too broad to track', () => {
    expect(() =>
      parseIssueTaskPlan(
        JSON.stringify({
          tasks: Array.from({ length: 21 }, (_, index) => ({
            kind: 'edit',
            title: `Unbounded task ${index}`,
          })),
        }),
      ),
    ).toThrow()
  })
})
