import type { AgentProject, Issue } from '@patchlane/shared'

export const buildIssueRunTaskPrompt = ({
  branchName,
  issue,
  project,
}: {
  branchName: string
  issue: Issue
  project: AgentProject
}) => {
  return [
    `Issue: ${issue.title}`,
    `Priority: ${issue.priority}`,
    `Project: ${project.name}`,
    project.repositoryUrl
      ? `Repository: ${project.repositoryUrl}`
      : 'Repository: not configured',
    project.repositoryRef
      ? `Repository ref: ${project.repositoryRef}`
      : 'Repository ref: default',
    `Project policy: ${project.description}`,
    `Branch/worktree target: ${branchName}`,
    '',
    'Issue description:',
    issue.description,
    '',
    issue.analysis
      ? `Current analysis:\n${issue.analysis}`
      : 'Current analysis: not available',
    '',
    'Execution policy:',
    '- Inspect the workspace before editing.',
    '- Keep work isolated to this issue branch/worktree context.',
    '- Implement the requested change when the issue is actionable.',
    '- Run relevant verification and summarize outcomes.',
    '- If the issue is blocked, stop and explain exactly what input is needed.',
  ].join('\n')
}

export const buildIssueRequirementTaskPrompt = ({
  branchName,
  issue,
  projectName,
}: {
  branchName: string
  issue: Issue
  projectName: string
}) => {
  return [
    'Analyze requirements for this issue. This task is generated from the Projects planning flow.',
    '',
    `Project: ${projectName}`,
    `Issue: ${issue.title}`,
    `Priority: ${issue.priority}`,
    `Target branch/worktree: ${branchName}`,
    '',
    'Issue description:',
    issue.description,
  ].join('\n')
}

export const buildIssuePlanningTaskPrompt = ({
  branchName,
  issue,
  projectName,
  requirementRunId,
}: {
  branchName: string
  issue: Issue
  projectName: string
  requirementRunId: string
}) => {
  return [
    'Create a concrete work plan for the coding agent. This task is generated from the Projects planning flow.',
    '',
    `Project: ${projectName}`,
    `Issue: ${issue.title}`,
    `Priority: ${issue.priority}`,
    `Target branch/worktree: ${branchName}`,
    `Requirement analysis task: ${requirementRunId}`,
    '',
    'Issue description:',
    issue.description,
  ].join('\n')
}
