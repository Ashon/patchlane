import type {
  AgentProject,
  Issue,
  LlmEndpoint,
  SandboxFileEntry,
  SandboxWorkspace,
} from '@patchlane/shared'
import { createOpenAIClient } from '../llm/openaiClient'

type IssueAnalysisAgentInput = {
  branchName: string
  endpoint: LlmEndpoint
  fileEntries: SandboxFileEntry[]
  issue: Issue
  project: AgentProject
  workspace?: SandboxWorkspace
}

export type IssuePlanningAgentResult = {
  combinedAnalysis: string
  requirementAnalysis: string
  workPlan: string
}

const maxAnalysisChars = 7_600
const maxFileEntries = 80

export const analyzeIssueWithPlanningAgent = async (
  input: IssueAnalysisAgentInput,
): Promise<IssuePlanningAgentResult> => {
  const requirementAnalysis = await analyzeIssueRequirements(input)
  const workPlan = await planIssueWork(input, requirementAnalysis)

  return combineIssuePlanningAnalysis(requirementAnalysis, workPlan)
}

export const analyzeIssueRequirements = async (
  input: IssueAnalysisAgentInput,
) => {
  return runPlanningCompletion({
    input,
    maxTokens: 1_200,
    prompt: buildRequirementAnalysisPrompt(input),
    systemPrompt: [
      'You are a requirements analysis agent for an agentic coding platform.',
      'Your job is to clarify what the user is asking for and define acceptance criteria for a future coding agent.',
      'Do not implement code. Do not produce a full execution plan.',
      'Return concise Markdown. Use Korean if the issue or project is written in Korean; otherwise use English.',
    ].join('\n'),
  })
}

export const planIssueWork = async (
  input: IssueAnalysisAgentInput,
  requirementAnalysis: string,
) => {
  return runPlanningCompletion({
    input,
    maxTokens: 1_400,
    prompt: buildWorkPlanPrompt(input, requirementAnalysis),
    systemPrompt: [
      'You are a work planning agent for an agentic coding platform.',
      'Your job is to turn requirements analysis into a concrete coding-agent handoff plan.',
      'Do not implement code. Do not claim work is complete.',
      'Return concise Markdown. Use Korean if the issue or project is written in Korean; otherwise use English.',
    ].join('\n'),
  })
}

export const combineIssuePlanningAnalysis = (
  requirementAnalysis: string,
  workPlan: string,
): IssuePlanningAgentResult => {
  return {
    combinedAnalysis: truncateAnalysis(
      [
        '## Requirement Analysis',
        normalizeSectionBody(requirementAnalysis),
        '',
        '## Work Plan',
        normalizeSectionBody(workPlan),
      ].join('\n'),
    ),
    requirementAnalysis,
    workPlan,
  }
}

const runPlanningCompletion = async ({
  input,
  maxTokens,
  prompt,
  systemPrompt,
}: {
  input: IssueAnalysisAgentInput
  maxTokens: number
  prompt: string
  systemPrompt: string
}) => {
  const client = createOpenAIClient(input.endpoint)
  const completion = await client.chat.completions.create({
    model: input.endpoint.defaultModel,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.2,
    max_tokens: maxTokens,
  })
  const content = completion.choices[0]?.message?.content?.trim()

  if (!content) {
    throw new Error('Issue analysis agent returned an empty response')
  }

  return stripThinking(content)
}

const buildRequirementAnalysisPrompt = ({
  branchName,
  fileEntries,
  issue,
  project,
  workspace,
}: IssueAnalysisAgentInput) => {
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

const buildWorkPlanPrompt = (
  input: IssueAnalysisAgentInput,
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

const truncateAnalysis = (analysis: string) => {
  const visibleAnalysis = stripThinking(analysis)

  if (visibleAnalysis.length <= maxAnalysisChars) {
    return visibleAnalysis
  }

  return `${visibleAnalysis.slice(0, maxAnalysisChars)}\n\n[truncated for issue analysis storage limit]`
}

const stripThinking = (value: string) => {
  return value.replace(/<think>[\s\S]*?<\/think>/giu, '').trim()
}

const normalizeSectionBody = (value: string) => {
  return value.replace(/^##\s+/gmu, '### ').trim()
}
