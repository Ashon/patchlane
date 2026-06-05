const exploratoryToolNames = new Set(['list_files', 'read_file'])
const broadToolNames = new Set(['list_files', 'read_file', 'run_command'])

export type RecentToolCall = {
  input?: Record<string, unknown>
  name: string
}

type ToolCallHistoryItem = RecentToolCall | string

const exactRepeatThresholds = new Map<string, number>([
  ['list_files', 2],
  ['read_file', 2],
  ['run_command', 3],
  ['git_status', 3],
  ['git_diff', 3],
])

export const isToolCallBlocked = (
  recentToolCalls: ToolCallHistoryItem[],
  candidate: RecentToolCall,
) => {
  const threshold = exactRepeatThresholds.get(candidate.name)

  if (!threshold) {
    return false
  }

  const candidateFingerprint = getToolCallFingerprint(candidate)

  return (
    normalizeToolCalls(recentToolCalls)
      .slice(-8)
      .filter(
        (toolCall) => getToolCallFingerprint(toolCall) === candidateFingerprint,
      ).length >= threshold
  )
}

export const getToolLoopNudgePrompt = (
  recentToolCalls: ToolCallHistoryItem[],
) => {
  const recentToolNames = normalizeToolCalls(recentToolCalls).map(
    (toolCall) => toolCall.name,
  )
  const lastFour = recentToolNames.slice(-4)

  if (
    lastFour.length === 4 &&
    lastFour.every((toolName) => exploratoryToolNames.has(toolName))
  ) {
    return [
      'Tool loop checkpoint: you have used exploratory file tools repeatedly.',
      'Stop broad listing and reading now.',
      'Choose one concrete next action: edit the relevant file, run one focused verification command, call finish if already complete, or request_user_input with a precise blocker.',
    ].join(' ')
  }

  const lastSix = recentToolNames.slice(-6)
  const commandCount = lastSix.filter(
    (toolName) => toolName === 'run_command',
  ).length

  if (lastSix.length === 6 && commandCount >= 5) {
    return [
      'Tool loop checkpoint: you have run many commands in a row.',
      'Do not run another command unless it is the narrow verification for a specific fix.',
      'Inspect status/diff, fix the first actionable failure, or call finish if the issue is verified.',
    ].join(' ')
  }

  const lastTen = recentToolNames.slice(-10)
  const broadToolCount = lastTen.filter((toolName) =>
    broadToolNames.has(toolName),
  ).length

  if (lastTen.length === 10 && broadToolCount >= 8) {
    return [
      'Tool loop checkpoint: this run has spent too many calls on broad exploration.',
      'Do not list, grep, cat, or read more files.',
      'Use the context already gathered to call finish, make one focused edit, run one narrow verification, or ask one precise blocker question.',
    ].join(' ')
  }

  return undefined
}

const normalizeToolCalls = (items: ToolCallHistoryItem[]): RecentToolCall[] => {
  return items.map((item) => (typeof item === 'string' ? { name: item } : item))
}

const getToolCallFingerprint = (toolCall: RecentToolCall) => {
  return `${toolCall.name}:${stableStringify(
    getComparableToolInput(toolCall.name, toolCall.input),
  )}`
}

const getComparableToolInput = (
  toolName: string,
  input: Record<string, unknown> | undefined,
) => {
  if (toolName === 'list_files') {
    return {
      path: getString(input?.path) || '.',
    }
  }

  if (toolName === 'read_file') {
    return {
      path: getString(input?.path),
      startLine: getNumber(input?.startLine) ?? 1,
      maxLines: getNumber(input?.maxLines) ?? 240,
    }
  }

  if (toolName === 'run_command') {
    return {
      command: getString(input?.command),
      args: Array.isArray(input?.args) ? input.args.map(String) : [],
      cwd: getString(input?.cwd) || '.',
    }
  }

  if (toolName === 'git_status' || toolName === 'git_diff') {
    return {}
  }

  return input ?? {}
}

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}

const getString = (value: unknown) => {
  return typeof value === 'string' ? value : undefined
}

const getNumber = (value: unknown) => {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
