const sentenceBoundaryPattern = /([.!?])(?=(?:[A-Z]|I['’]|\[[^\]]+\]|\*\*|`))/gu
const sentenceSplitPattern =
  /(?<=[.!?])\s+(?=(?:[A-Z]|I['’]|\[[^\]]+\]|\*\*|`))/gu

export const formatAgentResultSummary = (value: string, maxLength = 2_000) => {
  return truncateText(value.trim().replace(/\s+/gu, ' '), maxLength)
}

export const formatAgentIssueSummary = (value: string, maxLength = 3_800) => {
  return truncateText(formatReadableMarkdown(value), maxLength)
}

const formatReadableMarkdown = (value: string) => {
  const normalized = value
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/[ \t]+/gu, ' '))
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()

  if (!normalized) {
    return ''
  }

  const repaired = normalized.replace(sentenceBoundaryPattern, '$1\n\n')

  if (hasReadableStructure(repaired)) {
    return repaired.replace(/\n{3,}/gu, '\n\n').trim()
  }

  return splitLongPlainText(repaired)
}

const hasReadableStructure = (value: string) => {
  return (
    value.includes('\n\n') ||
    value.split('\n').some((line) => /^([-*]|\d+\.)\s+/u.test(line.trim()))
  )
}

const splitLongPlainText = (value: string) => {
  if (value.length < 500) {
    return value
  }

  const sentences = value.split(sentenceSplitPattern)

  if (sentences.length < 4) {
    return value
  }

  const paragraphs: string[] = []

  for (let index = 0; index < sentences.length; index += 2) {
    paragraphs.push(
      sentences
        .slice(index, index + 2)
        .join(' ')
        .trim(),
    )
  }

  return paragraphs.filter(Boolean).join('\n\n')
}

const truncateText = (value: string, maxLength: number) => {
  const trimmed = value.trim()

  if (trimmed.length <= maxLength) {
    return trimmed
  }

  return `${trimmed.slice(0, maxLength - 4).trimEnd()}\n...`
}
