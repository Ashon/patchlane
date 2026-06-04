import type { AgentRun } from '@patchlane/shared'

export type TaskRunMetrics = {
  assistantResponses: number
  awaitingUser: number
  durationMs: number
  providerRequests: number
  providerTotalTokens: number
  retryCount: number
  toolUses: number
  turns: number
  userMessages: number
}

export const getTaskRunMetrics = (run: AgentRun): TaskRunMetrics => {
  const usageKeys = new Set<string>()
  let assistantResponses = 0
  let durationMs = 0
  let providerRequests = 0
  let providerTotalTokens = 0
  let retryCount = 0
  let toolUses = 0
  let userMessages = 0

  for (const message of run.messages) {
    durationMs += message.metadata?.durationMs ?? 0

    if (message.role === 'assistant') {
      assistantResponses += 1
    }

    if (message.role === 'tool') {
      toolUses += 1
    }

    if (message.role === 'user') {
      userMessages += 1
    }

    const usage = message.metadata?.usage

    if (!usage) {
      continue
    }

    const key = getProviderUsageKey(run, message)

    if (usageKeys.has(key)) {
      continue
    }

    usageKeys.add(key)
    providerRequests += 1
    retryCount += Math.max(0, (message.metadata?.request?.attempt ?? 1) - 1)
    providerTotalTokens +=
      usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)
  }

  return {
    assistantResponses,
    awaitingUser: run.status === 'awaiting_user' ? 1 : 0,
    durationMs,
    providerRequests,
    providerTotalTokens,
    retryCount,
    toolUses,
    turns: providerRequests || assistantResponses || userMessages,
    userMessages,
  }
}

export const formatTaskRunMetricItems = (run?: AgentRun) => {
  if (!run) {
    return ['not started']
  }

  const metrics = getTaskRunMetrics(run)
  const items = [
    formatCount(metrics.turns, 'turn'),
    metrics.providerTotalTokens > 0
      ? `${formatCompactNumber(metrics.providerTotalTokens)} tok`
      : 'no usage',
  ]

  if (metrics.toolUses > 0) {
    items.push(formatCount(metrics.toolUses, 'tool'))
  }

  if (metrics.durationMs > 0) {
    items.push(formatDuration(metrics.durationMs))
  }

  if (metrics.retryCount > 0) {
    items.push(formatCount(metrics.retryCount, 'retry', 'retries'))
  }

  if (metrics.awaitingUser > 0) {
    items.push('awaiting user')
  }

  return items
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

const formatCount = (value: number, label: string, plural = `${label}s`) =>
  `${value.toLocaleString()} ${value === 1 ? label : plural}`

const formatCompactNumber = (value: number) => {
  if (value < 1_000) {
    return value.toLocaleString()
  }

  const compact = value / 1_000
  const maximumFractionDigits = value >= 10_000 ? 0 : 1

  return `${compact
    .toLocaleString(undefined, { maximumFractionDigits })
    .replace(/\.0$/, '')}k`
}

const formatDuration = (durationMs: number) => {
  if (durationMs < 1_000) {
    return `${durationMs}ms`
  }

  const seconds = durationMs / 1_000

  if (seconds < 60) {
    return `${seconds.toLocaleString(undefined, {
      maximumFractionDigits: seconds >= 10 ? 0 : 1,
    })}s`
  }

  const minutes = seconds / 60

  return `${minutes.toLocaleString(undefined, {
    maximumFractionDigits: minutes >= 10 ? 0 : 1,
  })}m`
}
