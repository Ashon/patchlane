import type { LlmEndpoint } from '@patchlane/shared'
import { createOpenAIClient } from '../llm/openaiClient'
import {
  buildRequirementAnalysisPrompt,
  buildWorkPlanPrompt,
  type IssuePlanningPromptInput,
  requirementAnalysisSystemPrompt,
  workPlanSystemPrompt,
} from './issuePlanningPrompts'

type IssueAnalysisAgentInput = IssuePlanningPromptInput & {
  endpoint: LlmEndpoint
}

export type IssuePlanningAgentResult = {
  combinedAnalysis: string
  requirementAnalysis: string
  workPlan: string
}

const maxAnalysisChars = 7_600

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
    systemPrompt: requirementAnalysisSystemPrompt,
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
    systemPrompt: workPlanSystemPrompt,
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
