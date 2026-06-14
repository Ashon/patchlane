import type {
  AgentProject,
  AgentRun,
  Issue,
  LlmEndpoint,
} from '@patchlane/shared'

export type AgentStatisticsMetrics = {
  activeRuns: number
  assistantResponses: number
  awaitingRuns: number
  cachedInputTokens: number
  completedRuns: number
  durationMs: number
  estimatedContentTokens: number
  estimatedReasoningTokens: number
  failedRuns: number
  messages: number
  providerInputTokens: number
  providerOutputTokens: number
  providerReasoningTokens: number
  providerRequests: number
  providerTotalTokens: number
  reasoningBlocks: number
  runs: number
  toolInputTokens: number
  toolOutputTokens: number
  toolUses: number
  userMessages: number
}

export type AgentStatisticsRow = {
  description?: string
  id: string
  label: string
  metadata?: string
  status?: 'available' | 'not_collected'
  timestamp?: string
  metrics: AgentStatisticsMetrics
}

export type AgentStatistics = {
  issueRows: AgentStatisticsRow[]
  kindRows: AgentStatisticsRow[]
  modelRows: AgentStatisticsRow[]
  projectRows: AgentStatisticsRow[]
  recentRunRows: AgentStatisticsRow[]
  sourceRows: AgentStatisticsRow[]
  toolRows: AgentStatisticsRow[]
  totals: AgentStatisticsMetrics
}

type BuildAgentStatisticsInput = {
  endpoints: LlmEndpoint[]
  issues: Issue[]
  projects: AgentProject[]
  runs: AgentRun[]
}

type MutableStatisticsRow = AgentStatisticsRow

const sourceSegmentLabels = {
  adHocAgentTask: 'Agent ad-hoc tasks',
  issueWork: 'Project issue work',
  projectTask: 'Project tasks',
  supervisorChat: 'Supervisor ad-hoc chat',
}

export const buildAgentStatistics = ({
  endpoints,
  issues,
  projects,
  runs,
}: BuildAgentStatisticsInput): AgentStatistics => {
  const projectsById = new Map(projects.map((project) => [project.id, project]))
  const issuesById = new Map(issues.map((issue) => [issue.id, issue]))
  const endpointsById = new Map(
    endpoints.map((endpoint) => [endpoint.id, endpoint]),
  )
  const totals = createMetrics()
  const sourceRows = new Map<string, MutableStatisticsRow>()
  const projectRows = new Map<string, MutableStatisticsRow>()
  const issueRows = new Map<string, MutableStatisticsRow>()
  const kindRows = new Map<string, MutableStatisticsRow>()
  const modelRows = new Map<string, MutableStatisticsRow>()
  const toolRows = new Map<string, MutableStatisticsRow>()
  const recentRunRows: AgentStatisticsRow[] = []

  for (const run of runs) {
    addRunMetrics(totals, run)
    const runIssue = run.issueId ? issuesById.get(run.issueId) : undefined

    addRunMetrics(
      getOrCreateRow(sourceRows, getSourceSegmentId(run), () =>
        getSourceSegmentRow(run),
      ).metrics,
      run,
    )

    addRunMetrics(
      getOrCreateRow(kindRows, run.kind, () => ({
        id: run.kind,
        label: getAgentRunKindLabel(run.kind),
        metrics: createMetrics(),
      })).metrics,
      run,
    )

    if (run.projectId) {
      const project = projectsById.get(run.projectId)
      addRunMetrics(
        getOrCreateRow(projectRows, run.projectId, () => ({
          id: run.projectId!,
          label: project?.name ?? 'Unknown project',
          description: project?.repositoryUrl,
          metrics: createMetrics(),
        })).metrics,
        run,
      )
    }

    if (run.issueId) {
      const issue = runIssue
      const project = issue ? projectsById.get(issue.projectId) : undefined
      addRunMetrics(
        getOrCreateRow(issueRows, run.issueId, () => ({
          id: run.issueId!,
          label: issue?.title ?? 'Unknown issue',
          description: project?.name,
          metadata: issue?.status,
          metrics: createMetrics(),
        })).metrics,
        run,
      )
    }

    const runMetrics = createMetrics()
    addRunMetrics(runMetrics, run)
    recentRunRows.push({
      id: run.id,
      label: getRecentRunLabel(run, runIssue),
      description: getRunScopeLabel(run, projectsById, issuesById),
      metadata: run.status,
      timestamp: run.updatedAt,
      metrics: runMetrics,
    })

    for (const message of run.messages) {
      const model =
        message.metadata?.request?.model ||
        run.model ||
        (run.endpointId
          ? endpointsById.get(run.endpointId)?.defaultModel
          : undefined) ||
        'Unknown model'

      if (message.metadata?.usage) {
        addProviderUsage(
          getOrCreateRow(modelRows, model, () => ({
            id: model,
            label: model,
            metrics: createMetrics(),
          })).metrics,
          run,
          message,
        )
      }

      if (message.role === 'tool') {
        const toolName = message.toolName || 'tool'
        addToolMessageMetrics(
          getOrCreateRow(toolRows, toolName, () => ({
            id: toolName,
            label: toolName,
            metrics: createMetrics(),
          })).metrics,
          message,
        )
      }
    }
  }

  sourceRows.set('supervisor-chat', {
    id: 'supervisor-chat',
    label: sourceSegmentLabels.supervisorChat,
    description:
      'Not persisted yet. Supervisor/chat-panel messages stay in browser state, so usage cannot be aggregated after reload.',
    status: 'not_collected',
    metrics: createMetrics(),
  })

  return {
    issueRows: sortRows(issueRows, byTotalTokens),
    kindRows: sortRows(kindRows, byRunsThenTokens),
    modelRows: sortRows(modelRows, byProviderRequests),
    projectRows: sortRows(projectRows, byTotalTokens),
    recentRunRows: recentRunRows
      .sort((left, right) =>
        (right.timestamp ?? '').localeCompare(left.timestamp ?? ''),
      )
      .slice(0, 20),
    sourceRows: sortRows(sourceRows, byTotalTokens),
    toolRows: sortRows(toolRows, byToolUses),
    totals,
  }
}

export const createMetrics = (): AgentStatisticsMetrics => ({
  activeRuns: 0,
  assistantResponses: 0,
  awaitingRuns: 0,
  cachedInputTokens: 0,
  completedRuns: 0,
  durationMs: 0,
  estimatedContentTokens: 0,
  estimatedReasoningTokens: 0,
  failedRuns: 0,
  messages: 0,
  providerInputTokens: 0,
  providerOutputTokens: 0,
  providerReasoningTokens: 0,
  providerRequests: 0,
  providerTotalTokens: 0,
  reasoningBlocks: 0,
  runs: 0,
  toolInputTokens: 0,
  toolOutputTokens: 0,
  toolUses: 0,
  userMessages: 0,
})

const usageKeysByMetric = new WeakMap<AgentStatisticsMetrics, Set<string>>()

const addRunMetrics = (metrics: AgentStatisticsMetrics, run: AgentRun) => {
  metrics.runs += 1

  if (run.status === 'completed') {
    metrics.completedRuns += 1
  } else if (run.status === 'failed') {
    metrics.failedRuns += 1
  } else if (run.status === 'awaiting_user') {
    metrics.awaitingRuns += 1
  } else if (run.status === 'running') {
    metrics.activeRuns += 1
  }

  for (const message of run.messages) {
    metrics.messages += 1

    if (message.role === 'user') {
      metrics.userMessages += 1
    }

    if (message.role === 'assistant') {
      metrics.assistantResponses += 1
    }

    if (message.role === 'tool') {
      metrics.toolUses += 1
    }

    if (
      message.role === 'assistant' &&
      (message.metadata?.reasoning || message.content.includes('<think>'))
    ) {
      metrics.reasoningBlocks += 1
    }

    addMessageMetadataMetrics(metrics, run, message)
  }
}

const addToolMessageMetrics = (
  metrics: AgentStatisticsMetrics,
  message: AgentRun['messages'][number],
) => {
  metrics.toolUses += 1
  metrics.durationMs += message.metadata?.durationMs ?? 0
  metrics.toolInputTokens += message.metadata?.tool?.input?.estimatedTokens ?? 0
  metrics.toolOutputTokens +=
    message.metadata?.tool?.output?.estimatedTokens ?? 0
}

const addMessageMetadataMetrics = (
  metrics: AgentStatisticsMetrics,
  run: AgentRun,
  message: AgentRun['messages'][number],
) => {
  const metadata = message.metadata

  if (!metadata) {
    return
  }

  metrics.durationMs += metadata.durationMs ?? 0
  metrics.estimatedContentTokens += metadata.content?.estimatedTokens ?? 0
  metrics.estimatedReasoningTokens += metadata.reasoning?.estimatedTokens ?? 0
  metrics.toolInputTokens += metadata.tool?.input?.estimatedTokens ?? 0
  metrics.toolOutputTokens += metadata.tool?.output?.estimatedTokens ?? 0

  addProviderUsage(metrics, run, message)
}

const addProviderUsage = (
  metrics: AgentStatisticsMetrics,
  run: AgentRun,
  message: AgentRun['messages'][number],
) => {
  const usage = message.metadata?.usage

  if (!usage) {
    return
  }

  const key = getProviderUsageKey(run, message)
  const usageKeys = getUsageKeys(metrics)

  if (usageKeys.has(key)) {
    return
  }

  usageKeys.add(key)
  metrics.providerRequests += 1
  metrics.providerInputTokens += usage.inputTokens ?? 0
  metrics.providerOutputTokens += usage.outputTokens ?? 0
  metrics.providerTotalTokens +=
    usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)
  metrics.providerReasoningTokens += usage.reasoningTokens ?? 0
  metrics.cachedInputTokens += usage.cachedInputTokens ?? 0
}

const getUsageKeys = (metrics: AgentStatisticsMetrics) => {
  let keys = usageKeysByMetric.get(metrics)

  if (!keys) {
    keys = new Set<string>()
    usageKeysByMetric.set(metrics, keys)
  }

  return keys
}

const getProviderUsageKey = (
  run: AgentRun,
  message: AgentRun['messages'][number],
) => {
  const request = message.metadata?.request

  if (request?.attempt && request.iteration) {
    return `${run.id}:${request.attempt}:${request.iteration}`
  }

  return `${run.id}:${message.id}`
}

const getOrCreateRow = (
  rows: Map<string, MutableStatisticsRow>,
  id: string,
  create: () => MutableStatisticsRow,
) => {
  const row = rows.get(id)

  if (row) {
    return row
  }

  const next = create()
  rows.set(id, next)
  return next
}

const getSourceSegmentId = (run: AgentRun) => {
  if (run.issueId) {
    return 'issue-work'
  }

  if (run.projectId) {
    return 'project-task'
  }

  return 'ad-hoc-agent-task'
}

const getSourceSegmentRow = (run: AgentRun): MutableStatisticsRow => {
  const id = getSourceSegmentId(run)

  if (id === 'issue-work') {
    return {
      id,
      label: sourceSegmentLabels.issueWork,
      description:
        'Runs linked to project issues, requirement analysis, planning, and implementation.',
      metrics: createMetrics(),
    }
  }

  if (id === 'project-task') {
    return {
      id,
      label: sourceSegmentLabels.projectTask,
      description: 'Runs linked to a project without a specific issue.',
      metrics: createMetrics(),
    }
  }

  return {
    id,
    label: sourceSegmentLabels.adHocAgentTask,
    description: 'Manual Agent tasks started outside a project issue.',
    metrics: createMetrics(),
  }
}

const getRunScopeLabel = (
  run: AgentRun,
  projectsById: Map<string, AgentProject>,
  issuesById: Map<string, Issue>,
) => {
  const issue = run.issueId ? issuesById.get(run.issueId) : undefined
  const project = run.projectId ? projectsById.get(run.projectId) : undefined

  if (project && issue) {
    return `${project.name} / ${project.code}-${issue.number}`
  }

  if (project) {
    return project.name
  }

  return 'Ad-hoc agent task'
}

const getRecentRunLabel = (run: AgentRun, issue?: Issue) => {
  const subtask = issue?.subtasks.find(
    (task) => task.id === run.subtaskId || task.agentRunId === run.id,
  )

  if (subtask) {
    return subtask.title
  }

  const issuePrefix = issue?.title ? `${issue.title}:` : ''

  if (issuePrefix && run.title.startsWith(issuePrefix)) {
    const taskTitle = run.title.slice(issuePrefix.length).trim()

    if (taskTitle) {
      return taskTitle
    }
  }

  return run.title
}

const getAgentRunKindLabel = (kind: AgentRun['kind']) => {
  if (kind === 'planning') {
    return 'plan'
  }

  if (kind === 'research') {
    return 'research'
  }

  if (kind === 'verification') {
    return 'verify'
  }

  return kind
}

const sortRows = (
  rows: Map<string, AgentStatisticsRow>,
  compare: (left: AgentStatisticsRow, right: AgentStatisticsRow) => number,
) => Array.from(rows.values()).sort(compare)

const byTotalTokens = (left: AgentStatisticsRow, right: AgentStatisticsRow) =>
  right.metrics.providerTotalTokens +
  right.metrics.toolOutputTokens -
  (left.metrics.providerTotalTokens + left.metrics.toolOutputTokens)

const byRunsThenTokens = (
  left: AgentStatisticsRow,
  right: AgentStatisticsRow,
) => right.metrics.runs - left.metrics.runs || byTotalTokens(left, right)

const byProviderRequests = (
  left: AgentStatisticsRow,
  right: AgentStatisticsRow,
) =>
  right.metrics.providerRequests - left.metrics.providerRequests ||
  byTotalTokens(left, right)

const byToolUses = (left: AgentStatisticsRow, right: AgentStatisticsRow) =>
  right.metrics.toolUses - left.metrics.toolUses || byTotalTokens(left, right)
