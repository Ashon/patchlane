import {
  replaceIssueSubtasksSchema,
  type AgentProject,
  type Issue,
  type ReplaceIssueSubtasksInput,
} from '@patchlane/shared'

export const buildIssueSubtaskPlanningPrompt = ({
  issue,
  project,
}: {
  issue: Issue
  project: AgentProject
}) => {
  return [
    'Create a concise subtask plan for this project issue.',
    'Return only JSON. Do not include markdown, prose, private reasoning, or raw tool logs.',
    '',
    'JSON schema:',
    JSON.stringify(
      {
        subtasks: [
          {
            description:
              'Concrete expected outcome, target area, and verification signal.',
            kind: 'inspect | edit | verify | publish | followup',
            title: 'Short actionable subtask title',
          },
        ],
      },
      null,
      2,
    ),
    '',
    'Planning rules:',
    '- Use 2 to 8 subtasks for complex work. Use 1 subtask only for truly tiny work.',
    '- Prefer inspect, edit, and verify as the minimum shape for non-trivial coding work.',
    '- Each subtask must have a concrete completion signal and should fit in one focused agent run.',
    '- Do not create vague subtasks like "implement everything" or "finish remaining work".',
    '- Put verification in its own subtask when the change affects behavior, types, tests, or build output.',
    '- Keep subtasks ordered so later tasks can consume earlier summaries.',
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

export const parseIssueSubtaskPlan = (
  content: string,
): ReplaceIssueSubtasksInput => {
  const jsonText = extractJsonObject(content)
  const parsed = JSON.parse(jsonText) as unknown

  return replaceIssueSubtasksSchema.parse(parsed)
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
