import type { AgentRun, Issue } from '@patchlane/shared'
import type { AgentRunStore } from '../agent/agentRunStore'
import { combineIssuePlanningAnalysis } from './issueAnalysisAgent'
import type { IssueStore } from './issueStore'

type IssueReconciliationStores = {
  issueStore: IssueStore
  runStore: AgentRunStore
}

export type IssueReconciliationResult = {
  issue: Issue
  promoted: boolean
  runs: AgentRun[]
}

export const reconcileIssuePlanningState = async ({
  issueId,
  issueStore,
  runStore,
}: IssueReconciliationStores & {
  issueId: string
}): Promise<IssueReconciliationResult> => {
  let issue = await issueStore.getIssue(issueId)
  const runs: AgentRun[] = []

  if (issue.agentRunId) {
    const codingRun = await runStore.find(issue.agentRunId)

    if (!codingRun) {
      issue = await issueStore.clearMissingAgentRunReference(
        issue.id,
        issue.agentRunId,
        `Removed stale coding task link ${issue.agentRunId.slice(0, 8)} before continuing this issue.`,
      )
    } else {
      runs.push(codingRun)
    }
  }

  if (issue.analysis || !issue.planningRunId) {
    return { issue, promoted: false, runs }
  }

  const planningRun = await runStore.find(issue.planningRunId)

  if (!planningRun) {
    return { issue, promoted: false, runs }
  }

  runs.push(planningRun)

  if (planningRun.status !== 'completed') {
    return { issue, promoted: false, runs }
  }

  const workPlan = getAgentRunResultText(planningRun)

  if (!workPlan) {
    return { issue, promoted: false, runs }
  }

  const requirementRun = issue.requirementRunId
    ? await runStore.find(issue.requirementRunId)
    : undefined

  if (requirementRun) {
    runs.push(requirementRun)
  }

  const completedRequirementAnalysis =
    requirementRun?.status === 'completed'
      ? getAgentRunResultText(requirementRun)
      : undefined
  const requirementAnalysis =
    completedRequirementAnalysis ??
    buildRecoveredRequirementContext(issue, requirementRun)
  const analysis = combineIssuePlanningAnalysis(requirementAnalysis, workPlan)

  const promotedIssue = await issueStore.analyzeIssue(issue.id, {
    analysis: analysis.combinedAnalysis,
    endpointId:
      issue.endpointId ?? planningRun.endpointId ?? requirementRun?.endpointId,
    eventMessage: `Recovered completed plan task ${planningRun.id.slice(0, 8)} and marked the issue ready to run.`,
    planningRunId: planningRun.id,
    requirementRunId: issue.requirementRunId,
  })

  return {
    issue: promotedIssue,
    promoted: true,
    runs: dedupeRuns(runs),
  }
}

export const reconcileIssueAfterAgentRun = async (
  stores: IssueReconciliationStores,
  run: AgentRun,
): Promise<IssueReconciliationResult | undefined> => {
  if (!run.issueId) {
    return undefined
  }

  if (run.kind === 'coding') {
    const issue = await stores.issueStore.markRunFinished(run)

    return issue
      ? {
          issue,
          promoted: false,
          runs: [run],
        }
      : undefined
  }

  if (run.kind !== 'requirements' && run.kind !== 'planning') {
    return undefined
  }

  if (run.status === 'awaiting_user') {
    const issue = await stores.issueStore.updateIssue(
      run.issueId,
      { status: 'awaiting_user' },
      `Agent task ${run.id.slice(0, 8)} is waiting for user input.`,
    )

    return {
      issue,
      promoted: false,
      runs: [run],
    }
  }

  return reconcileIssuePlanningState({
    ...stores,
    issueId: run.issueId,
  })
}

export const getAgentRunResultText = (run: AgentRun) => {
  const candidates = [
    run.resultSummary,
    ...run.messages
      .slice()
      .reverse()
      .filter((message) => message.toolName === 'finish')
      .map((message) => message.content),
    ...run.messages
      .slice()
      .reverse()
      .filter((message) => message.role === 'assistant')
      .map((message) => message.content),
  ]

  return candidates
    .map(cleanResultText)
    .find((candidate) => candidate && isUsableResultText(candidate))
}

const buildRecoveredRequirementContext = (
  issue: Issue,
  requirementRun?: AgentRun,
) => {
  return [
    '### Requirement Summary',
    'A separate requirement analysis result is not available. Use the original issue and the completed work plan as the source of truth.',
    '',
    '### Issue Context',
    `- Title: ${issue.title}`,
    `- Priority: ${issue.priority}`,
    `- Description: ${issue.description}`,
    '',
    '### Requirement Task State',
    requirementRun
      ? `Requirement task ${requirementRun.id.slice(0, 8)} is ${requirementRun.status}${requirementRun.error ? `: ${requirementRun.error}` : '.'}`
      : 'No requirement task is linked.',
  ].join('\n')
}

const cleanResultText = (value?: string) => {
  if (!value) {
    return undefined
  }

  return value.replace(/<think>[\s\S]*?<\/think>/giu, '').trim()
}

const isUsableResultText = (value: string) => {
  return (
    !value.startsWith('Tool iteration limit reached') &&
    !value.startsWith('Planning failed.')
  )
}

const dedupeRuns = (runs: AgentRun[]) => {
  const seen = new Set<string>()

  return runs.filter((run) => {
    if (seen.has(run.id)) {
      return false
    }

    seen.add(run.id)
    return true
  })
}
