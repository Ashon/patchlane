export const formatAgentResultSummary = (value: string, maxLength = 2_000) => {
  return truncateText(value.trim().replace(/\s+/gu, ' '), maxLength)
}

const truncateText = (value: string, maxLength: number) => {
  const trimmed = value.trim()

  if (trimmed.length <= maxLength) {
    return trimmed
  }

  return `${trimmed.slice(0, maxLength - 4).trimEnd()}\n...`
}
