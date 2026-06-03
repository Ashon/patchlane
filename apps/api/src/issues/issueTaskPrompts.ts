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
      ? `Prior issue context:\n${issue.analysis}`
      : 'Prior issue context: none. You must assess the issue directly.',
    '',
    'Agent-driven workflow:',
    '- Own this issue from triage through completion. Do not wait for separate requirement-analysis or planning tasks.',
    '- Inspect the workspace enough to classify scope as tiny, small, medium, large, or risky.',
    '- Decide whether the issue is actionable, under-specified, or unsafe before editing.',
    '- For tiny obvious tasks, proceed directly after targeted inspection.',
    '- For larger or risky tasks, form a concise plan from the inspection results before making changes.',
    '- Keep work isolated to this issue branch/worktree context.',
    '- Implement the requested change when actionable, run relevant verification, and call finish with the outcome.',
    '- If blocked, call request_user_input with the exact missing decision or information.',
  ].join('\n')
}
