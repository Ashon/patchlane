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
    '- Convert the issue into a concrete completion target: expected files or behavior, verification command, and final user-facing result.',
    '- Keep moving while useful progress is possible. If a first approach fails, inspect the failure, choose a smaller correction, and verify again.',
    '- Do not stop at analysis, planning, or partial edits when the issue is still actionable.',
    '- Avoid broad repo tours. After the initial targeted inspection, every tool call should support one of these: edit, verify, inspect diff/status, or resolve a specific error.',
    '- Treat failing tests, type errors, and build errors as tutoring signals. Summarize the first actionable cause to yourself, patch it, and re-run the narrowest relevant check.',
    '- If the requested behavior is ambiguous but a conservative implementation is obvious, implement that safe interpretation and mention the assumption in the final summary.',
    '- Use add_issue_comment at meaningful progress points, decisions, blockers, and final issue summaries so the issue timeline stays useful without exposing raw logs.',
    '- Keep work isolated to this issue branch/worktree context.',
    '- Implement the requested change when actionable, run relevant verification, inspect git status/diff, add a summary issue comment, and call finish with the outcome.',
    '- If full completion is unsafe or impossible, complete the safest useful slice, verify it, and clearly state the remaining blocker or risk.',
    '- If blocked, first call add_issue_comment with kind=blocked, then call request_user_input with the exact missing decision or information. Do this only after confirming no safe useful next step remains.',
  ].join('\n')
}
