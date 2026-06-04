const exploratoryToolNames = new Set(['list_files', 'read_file'])
const broadToolNames = new Set(['list_files', 'read_file', 'run_command'])

export const getBlockedToolNames = (recentToolNames: string[]) => {
  const blockedToolNames = new Set<string>()
  const lastFour = recentToolNames.slice(-4)
  const lastSix = recentToolNames.slice(-6)
  const lastTen = recentToolNames.slice(-10)

  if (
    lastFour.length === 4 &&
    lastFour.every((toolName) => exploratoryToolNames.has(toolName))
  ) {
    blockedToolNames.add('list_files')
  }

  if (
    lastSix.length === 6 &&
    lastSix.filter((toolName) => exploratoryToolNames.has(toolName)).length >= 5
  ) {
    blockedToolNames.add('read_file')
  }

  if (
    lastSix.length === 6 &&
    lastSix.filter((toolName) => toolName === 'run_command').length >= 5
  ) {
    blockedToolNames.add('run_command')
  }

  if (
    lastTen.length === 10 &&
    lastTen.filter((toolName) => broadToolNames.has(toolName)).length >= 8
  ) {
    blockedToolNames.add('list_files')
    blockedToolNames.add('read_file')
    blockedToolNames.add('run_command')
  }

  return blockedToolNames
}

export const getToolLoopNudgePrompt = (recentToolNames: string[]) => {
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
