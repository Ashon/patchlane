import type {
  AgentProject,
  Issue,
  SandboxFileEntry,
  SandboxWorkspace,
} from '@patchlane/shared'

export type IssuePlanningPromptInput = {
  branchName: string
  fileEntries: SandboxFileEntry[]
  issue: Issue
  project: AgentProject
  workspace?: SandboxWorkspace
}

const maxFileEntries = 80

export const requirementAnalysisSystemPrompt = [
  'You are a requirements analysis agent for an agentic coding platform.',
  'Your job is to clarify what the user is asking for and define acceptance criteria for a future coding agent.',
  'Do not implement code. Do not produce a full execution plan.',
  'Return concise Markdown. Use Korean if the issue or project is written in Korean; otherwise use English.',
].join('\n')

export const workPlanSystemPrompt = [
  'You are a work planning agent for an agentic coding platform.',
  'Your job is to turn requirements analysis into a concrete coding-agent handoff plan.',
  'Do not implement code. Do not claim work is complete.',
  'Return concise Markdown. Use Korean if the issue or project is written in Korean; otherwise use English.',
].join('\n')

export const buildRequirementAnalysisPrompt = ({
  branchName,
  fileEntries,
  issue,
  project,
  workspace,
}: IssuePlanningPromptInput) => {
  return [
    "Analyze this issue's requirements for a future coding agent.",
    '',
    'Required Markdown structure:',
    '### Requirement Summary',
    '### Acceptance Criteria',
    '### Constraints',
    '### Risks / Questions',
    '',
    'Project context:',
    `- Project: ${project.name}`,
    `- Project policy: ${project.description}`,
    `- Repository: ${project.repositoryUrl || 'not configured'}`,
    `- Repository ref: ${project.repositoryRef || 'default'}`,
    `- Suggested branch/worktree: ${branchName}`,
    '',
    'Issue context:',
    `- Title: ${issue.title}`,
    `- Priority: ${issue.priority}`,
    `- Description:\n${issue.description}`,
    '',
    'Workspace context:',
    workspace
      ? [
          `- Workspace: ${workspace.name}`,
          `- Path: ${workspace.path}`,
          `- Status: ${workspace.status}`,
          workspace.error ? `- Error: ${workspace.error}` : undefined,
        ]
          .filter(Boolean)
          .join('\n')
      : '- Workspace: not selected',
    '',
    'Repository snapshot:',
    formatFileEntries(fileEntries),
  ].join('\n')
}

export const buildWorkPlanPrompt = (
  input: IssuePlanningPromptInput,
  requirementAnalysis: string,
) => {
  return [
    'Create a coding-agent work plan from this requirements analysis.',
    '',
    'Required Markdown structure:',
    '### Implementation Plan',
    '1. List concrete engineering steps in execution order.',
    '',
    '### Verification Plan',
    '- List commands, checks, or manual review points the coding agent should run.',
    '',
    '### Agent Handoff',
    '- Include target branch/worktree, workspace, and boundaries the coding agent must respect.',
    '',
    'Requirements analysis:',
    requirementAnalysis,
    '',
    'Project and workspace context:',
    buildRequirementAnalysisPrompt(input),
  ].join('\n')
}

const formatFileEntries = (entries: SandboxFileEntry[]) => {
  if (!entries.length) {
    return '- No file snapshot available.'
  }

  return entries
    .slice(0, maxFileEntries)
    .map(
      (entry) =>
        `- ${entry.type === 'directory' ? 'dir' : 'file'} ${entry.path}${entry.size ? ` (${entry.size} bytes)` : ''}`,
    )
    .join('\n')
}
