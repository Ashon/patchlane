import type { AgentProject, Issue, IssueTask } from '@patchlane/shared'

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

export const buildIssueTaskRunTaskPrompt = ({
  branchName,
  issue,
  project,
  task,
}: {
  branchName: string
  issue: Issue
  project: AgentProject
  task: IssueTask
}) => {
  const previousTaskSummaries = issue.subtasks
    .filter(
      (item) =>
        item.sequence < task.sequence &&
        (item.status === 'completed' || item.status === 'skipped'),
    )
    .map(
      (item) => `- ${item.title}: ${item.resultSummary || `${item.status}.`}`,
    )

  return [
    `Issue: ${issue.title}`,
    `Current task: ${task.title}`,
    `Task kind: ${task.kind}`,
    `Task status: ${task.status}`,
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
    'Task completion target:',
    task.description || task.title,
    '',
    previousTaskSummaries.length
      ? ['Previous completed tasks:', ...previousTaskSummaries].join('\n')
      : 'Previous completed tasks: none.',
    '',
    'Task execution rules:',
    '- Complete only this task, while preserving the existing issue branch/worktree changes.',
    '- Use earlier task summaries and the current workspace state as context. Do not restart the whole issue from scratch.',
    getIssueTaskBudgetGuidance(task),
    getIssueTaskKindGuidance(task),
    '- If this is a research task, finish with evidence-backed findings, a recommended implementation plan, a verification strategy, and an explicit no-file-changes note.',
    '- If this is an inspect task, finish with concise findings and explicitly say no file changes were needed when appropriate.',
    '- If this is an edit task, make the smallest correct change for this task and run focused verification when practical.',
    '- If this is a verify task, run the relevant checks, fix only small directly related failures, and summarize any remaining risk.',
    '- Use add_issue_comment for meaningful progress, blockers, and a final task summary.',
    '- Before finish, inspect git status/diff when file changes were made.',
    '- Call finish when this task is complete. Do not claim the entire issue is complete unless this is the final task and all prior tasks are done.',
    '- If blocked, first add an issue comment with kind=blocked, then request_user_input with the precise missing decision.',
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
  subtask: IssueTask
}) =>
  buildIssueTaskRunTaskPrompt({
    branchName,
    issue,
    project,
    task: subtask,
  })

const getIssueTaskKindGuidance = (task: IssueTask) => {
  if (task.kind === 'research') {
    return [
      '- Research task boundary: do not modify files, do not call write_file, do not commit, and do not continue into implementation.',
      '- Build an evidence-backed map of the relevant files, data flow, prompt/contracts, likely failure modes, and open questions.',
      '- Use targeted searches plus confirming file reads or safe read-only commands. Each tool call should test a concrete hypothesis or close a named knowledge gap.',
      '- End with the recommended edit sequence, the narrowest useful verification commands, residual risks, and confirmation that no repository files were changed.',
    ].join('\n')
  }

  if (task.kind === 'inspect') {
    return [
      '- Inspect task boundary: do not modify files, do not call write_file, do not commit, and do not continue into implementation.',
      '- Inspect only the smallest set of files needed to answer this task. If you have enough findings, add a concise progress/summary issue comment and call finish.',
      '- For catalog-style inspect work, produce a compact inventory from existing evidence. Do not keep expanding the search after you can name the relevant files, data shapes, and risks.',
    ].join('\n')
  }

  if (task.kind === 'edit') {
    return [
      '- Edit task boundary: avoid broad rediscovery. Use prior inspect summaries, make the smallest relevant change, then run one focused verification.',
      '- Do not expand scope into later tasks. Leave broader verification or publishing to their own tasks.',
    ].join('\n')
  }

  if (task.kind === 'verify') {
    return [
      '- Verify task boundary: start from git status/diff and the previous task summaries.',
      '- Run the narrowest relevant check. Only edit if the check exposes a small directly related failure.',
      '- Do not perform another broad repository tour during verification.',
    ].join('\n')
  }

  if (task.kind === 'publish') {
    return [
      '- Publish task boundary: inspect status/diff, prepare the requested branch/PR action, and finish with links or blockers.',
      '- Do not make unrelated code changes during publishing.',
    ].join('\n')
  }

  return [
    '- Follow-up task boundary: address only the explicit follow-up target and finish once that target is resolved.',
  ].join('\n')
}

const getIssueTaskBudgetGuidance = (task: IssueTask) => {
  if (task.kind === 'research') {
    return [
      '- Budget research deliberately: start with a compact repo map, then follow only the branches needed to answer the task.',
      '- Do not stop at the first plausible answer. Cross-check important claims against source files, tests, schemas, or runtime prompts before finishing.',
    ].join('\n')
  }

  return '- Budget tool calls aggressively: after a handful of targeted reads or commands, either finish, make the focused edit, run the narrow verification, or ask for a precise blocker.'
}
