import {
  replaceIssueTasksSchema,
  replaceIssueSubtasksSchema,
  type AgentProject,
  type Issue,
  type ReplaceIssueTasksInput,
  type ReplaceIssueSubtasksInput,
} from '@patchlane/shared'

export const buildIssueTaskPlanningPrompt = ({
  issue,
  project,
}: {
  issue: Issue
  project: AgentProject
}) => {
  return [
    'Create a concise issue task plan for this project issue.',
    'Return only JSON. Do not include markdown, prose, private reasoning, or raw tool logs.',
    '',
    'JSON schema:',
    JSON.stringify(
      {
        tasks: [
          {
            description:
              'Concrete expected outcome, target area, and verification signal.',
            kind: 'inspect | edit | verify | publish | followup',
            title: 'Short actionable issue task title',
          },
        ],
      },
      null,
      2,
    ),
    '',
    'Planning rules:',
    '- Use 2 to 8 issue tasks for complex work. Use 1 task only for truly tiny work.',
    '- Prefer inspect, edit, and verify as the minimum shape for non-trivial coding work.',
    '- Each task must have a concrete completion signal and should fit in one focused agent run.',
    '- Do not create vague tasks like "implement everything" or "finish remaining work".',
    '- Put verification in its own task when the change affects behavior, types, tests, or build output.',
    '- Keep tasks ordered so later tasks can consume earlier summaries.',
    '',
    `Project: ${project.name}`,
    `Project policy: ${project.description}`,
    project.repositoryUrl
      ? `Repository: ${project.repositoryUrl}`
      : 'Repository: not configured',
    project.repositoryRef
      ? `Repository ref: ${project.repositoryRef}`
      : 'Repository ref: default',
    '',
    `Issue: ${issue.title}`,
    `Priority: ${issue.priority}`,
    'Issue description:',
    issue.description,
    '',
    issue.analysis ? `Prior issue context:\n${issue.analysis}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const buildIssueSubtaskPlanningPrompt = buildIssueTaskPlanningPrompt

export const parseIssueTaskPlan = (content: string): ReplaceIssueTasksInput => {
  const jsonText = extractJsonObject(content)
  const parsed = parsePlanningJson(jsonText)
  const taskPlan = replaceIssueTasksSchema.safeParse(parsed)

  if (taskPlan.success) {
    return taskPlan.data
  }

  const legacyPlan = replaceIssueSubtasksSchema.parse(parsed)

  return { tasks: legacyPlan.subtasks }
}

export const parseIssueSubtaskPlan = (
  content: string,
): ReplaceIssueSubtasksInput => {
  const taskPlan = parseIssueTaskPlan(content)

  return { subtasks: taskPlan.tasks }
}

const extractJsonObject = (content: string) => {
  const trimmed = content.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu)

  if (fenced?.[1]) {
    return fenced[1].trim()
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')

  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1)
  }

  return trimmed
}

const parsePlanningJson = (jsonText: string): unknown => {
  try {
    return JSON.parse(jsonText) as unknown
  } catch (error) {
    const repaired = repairJsonLikePlan(jsonText)

    if (repaired === jsonText) {
      throw error
    }

    return JSON.parse(repaired) as unknown
  }
}

const repairJsonLikePlan = (jsonText: string) => {
  return jsonText
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/gu, '$1"$2"$3')
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/gu, (_match, value: string) =>
      JSON.stringify(value.replace(/\\'/gu, "'")),
    )
    .replace(/,\s*([}\]])/gu, '$1')
}
