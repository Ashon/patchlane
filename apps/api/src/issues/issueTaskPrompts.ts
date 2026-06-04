import type { AgentProject, Issue, IssueSubtask } from '@patchlane/shared'

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

export const buildIssueSubtaskRunTaskPrompt = ({
  branchName,
  issue,
  project,
  subtask,
}: {
  branchName: string
  issue: Issue
  project: AgentProject
  subtask: IssueSubtask
}) => {
  const previousSubtaskSummaries = issue.subtasks
    .filter(
      (item) =>
        item.sequence < subtask.sequence &&
        (item.status === 'completed' || item.status === 'skipped'),
    )
    .map(
      (item) => `- ${item.title}: ${item.resultSummary || `${item.status}.`}`,
    )

  return [
    `Issue: ${issue.title}`,
    `Current subtask: ${subtask.title}`,
    `Subtask kind: ${subtask.kind}`,
    `Subtask status: ${subtask.status}`,
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
    'Subtask completion target:',
    subtask.description || subtask.title,
    '',
    previousSubtaskSummaries.length
      ? ['Previous completed subtasks:', ...previousSubtaskSummaries].join('\n')
      : 'Previous completed subtasks: none.',
    '',
    'Subtask execution rules:',
    '- Complete only this subtask, while preserving the existing issue branch/worktree changes.',
    '- Use earlier subtask summaries and the current workspace state as context. Do not restart the whole issue from scratch.',
    '- Budget tool calls aggressively: after a handful of targeted reads or commands, either finish, make the focused edit, run the narrow verification, or ask for a precise blocker.',
    getSubtaskKindGuidance(subtask),
    '- If this is an inspect subtask, finish with concise findings and explicitly say no file changes were needed when appropriate.',
    '- If this is an edit subtask, make the smallest correct change for this subtask and run focused verification when practical.',
    '- If this is a verify subtask, run the relevant checks, fix only small directly related failures, and summarize any remaining risk.',
    '- Use add_issue_comment for meaningful progress, blockers, and a final subtask summary.',
    '- Before finish, inspect git status/diff when file changes were made.',
    '- Call finish when this subtask is complete. Do not claim the entire issue is complete unless this is the final subtask and all prior subtasks are done.',
    '- If blocked, first add an issue comment with kind=blocked, then request_user_input with the precise missing decision.',
  ].join('\n')
}

const getSubtaskKindGuidance = (subtask: IssueSubtask) => {
  if (subtask.kind === 'inspect') {
    return [
      '- Inspect subtask boundary: do not modify files, do not call write_file, do not commit, and do not continue into implementation.',
      '- Inspect only the smallest set of files needed to answer this subtask. If you have enough findings, add a concise progress/summary issue comment and call finish.',
      '- For catalog-style inspect work, produce a compact inventory from existing evidence. Do not keep expanding the search after you can name the relevant files, data shapes, and risks.',
    ].join('\n')
  }

  if (subtask.kind === 'edit') {
    return [
      '- Edit subtask boundary: avoid broad rediscovery. Use prior inspect summaries, make the smallest relevant change, then run one focused verification.',
      '- Do not expand scope into later subtasks. Leave broader verification or publishing to their own subtasks.',
    ].join('\n')
  }

  if (subtask.kind === 'verify') {
    return [
      '- Verify subtask boundary: start from git status/diff and the previous subtask summaries.',
      '- Run the narrowest relevant check. Only edit if the check exposes a small directly related failure.',
      '- Do not perform another broad repository tour during verification.',
    ].join('\n')
  }

  if (subtask.kind === 'publish') {
    return [
      '- Publish subtask boundary: inspect status/diff, prepare the requested branch/PR action, and finish with links or blockers.',
      '- Do not make unrelated code changes during publishing.',
    ].join('\n')
  }

  return [
    '- Follow-up subtask boundary: address only the explicit follow-up target and finish once that target is resolved.',
  ].join('\n')
}
