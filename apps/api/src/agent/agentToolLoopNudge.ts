const exploratoryToolNames = new Set(['list_files', 'read_file'])

export const getBlockedToolNames = (recentToolNames: string[]) => {
  const blockedToolNames = new Set<string>()
  const lastFour = recentToolNames.slice(-4)
  const lastSix = recentToolNames.slice(-6)

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

  return undefined
}
