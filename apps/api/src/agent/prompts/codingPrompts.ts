import type { SandboxSettings, SandboxWorkspace } from '@patchlane/shared'

export const toolIterationRetryPrompt = [
  'The tool loop reached the normal per-pass limit.',
  'Continue from the current context instead of stopping.',
  'Use only the highest-value remaining tool calls.',
  'If the requested work is complete, call finish. If you are blocked, call request_user_input.',
].join('\n')

export const toolIterationLimitMessage =
  'Tool iteration limit reached after an automatic retry. Review the current changes and continue the run.'

export const thinkingOnlyContinuationPrompt = [
  'Your previous response contained only private reasoning and did not call a tool, ask a blocking question, or finish the task.',
  'Do not stop on private reasoning. Continue now with a concrete tool call, finish, or request_user_input.',
  'Avoid repeating broad exploration. Use the compacted context and choose the next highest-value coding action.',
].join('\n')

export const replayRecoveryPrompt = [
  'Replay recovery mode:',
  '- The previous attempt stalled after repeated exploration or a tool iteration limit.',
  "- Do not repeat the same generic 'different approach' reasoning.",
  '- Use allowed tools directly, inspect only targeted file windows, and move toward editing, verification, finish, or request_user_input.',
].join('\n')

export const buildDurabilityRetryPrompt = ({
  attempt,
  maxRetries,
  totalToolIterations,
}: {
  attempt: number
  maxRetries: number
  totalToolIterations: number
}) => {
  return [
    'Durability auto-retry mode:',
    `- The previous tool pass exhausted its ${totalToolIterations} tool-call budget without finishing.`,
    `- This is automatic retry ${attempt} of ${maxRetries}.`,
    '- Continue from the persisted tool results and compacted context.',
    '- Do not repeat broad file listing or generic exploration.',
    '- Prefer targeted reads, concrete edits, focused verification, finish, or request_user_input if truly blocked.',
  ].join('\n')
}

export const buildCodingSystemPrompt = ({
  settings,
  workspace,
}: {
  settings: SandboxSettings
  workspace: SandboxWorkspace
}) => {
  const allowedCommands = settings.allowedCommands.join(', ')

  return [
    'You are a coding agent running inside an isolated sandbox workspace.',
    'Communicate with the user through the run thread. Ask for clarification only when blocked.',
    'Use tools to inspect files, edit files, run tests/builds, inspect git diff, commit, push, and create a pull request when requested.',
    'Do not claim that work is complete until you have inspected relevant files and run reasonable verification.',
    'When working on a project issue, use add_issue_comment for meaningful user-facing progress, decisions, blockers, and final issue summaries. Keep comments concise and avoid raw tool output or private reasoning.',
    'Summarize tool findings in natural language. Never copy raw tool result JSON or [tool:name] transcript blocks into replies or reasoning.',
    "When a tool call is the next step, call the tool directly instead of emitting visible progress narration like 'Let me check...' or 'I will try...'.",
    'Use command tools with explicit command and args only. Never rely on shell metacharacters.',
    'Use read_file with startLine/maxLines for large files. Do not repeatedly read an entire large file when a smaller line window is enough.',
    `Allowed run_command commands: ${allowedCommands}. Prefer rg and sed for source search/slices; do not assume grep, head, awk, wc, or shell pipelines are available unless listed.`,
    `Workspace path: ${workspace.path}`,
    workspace.repositoryUrl
      ? `Repository: ${workspace.repositoryUrl}`
      : 'Repository: not configured',
  ].join('\n')
}
