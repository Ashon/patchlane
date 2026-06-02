export const splitThinking = (rawContent: string, rawReasoning = '') => {
  let content = rawContent
  let reasoning = rawReasoning

  while (content.includes('<think>')) {
    const openIndex = content.indexOf('<think>')
    const before = content.slice(0, openIndex)
    const afterOpen = content.slice(openIndex + '<think>'.length)
    const closeIndex = afterOpen.indexOf('</think>')

    if (closeIndex < 0) {
      reasoning = joinReasoning(reasoning, afterOpen)
      content = before
      break
    }

    reasoning = joinReasoning(reasoning, afterOpen.slice(0, closeIndex))
    content = `${before}${afterOpen.slice(closeIndex + '</think>'.length)}`
  }

  return {
    content: trimTrailingOpeningThinkFragment(
      removeToolTranscripts(content),
    ).trimStart(),
    reasoning: dedupeRepeatedLines(removeToolTranscripts(reasoning).trim()),
  }
}

export const normalizeAgentAssistantDisplay = ({
  content,
  reasoning,
}: {
  content: string
  reasoning: string
}) => {
  let normalizedReasoning = dedupeRepeatedLines(reasoning)
  let normalizedContent = content.trimStart()

  if (isDuplicateText(normalizedContent, normalizedReasoning)) {
    normalizedContent = ''
  }

  if (isAgentProgressOnlyContent(normalizedContent)) {
    normalizedReasoning = joinReasoning(normalizedReasoning, normalizedContent)
    normalizedContent = ''
  }

  return {
    content: normalizedContent,
    reasoning: normalizedReasoning,
  }
}

export const isAgentProgressOnlyContent = (value: string) => {
  const normalized = normalizeText(value)

  if (!normalized) {
    return false
  }

  if (normalized.length > 320) {
    return false
  }

  return agentProgressPatterns.some((pattern) => pattern.test(normalized))
}

const joinReasoning = (current: string, next: string) => {
  if (!next.trim()) {
    return current
  }

  return current ? `${current}${next}` : next
}

const agentProgressPatterns = [
  /^let me\b.+\b(?:check|try|use|inspect|look|read|run|find|list)\b/iu,
  /^i(?:'ll| will)\b.+\b(?:check|try|use|inspect|look|read|run|find|list)\b/iu,
  /^good,\s+i can see\b.+\blet me\b/iu,
  /^the (?:command|directory|file|path|issue)\b.+\blet me\b/iu,
  /^actually,\s+.+\blet me\b/iu,
]

const normalizeText = (value: string) => value.replace(/\s+/gu, ' ').trim()

const trimTrailingOpeningThinkFragment = (value: string) => {
  const marker = '<think>'
  const maxFragmentLength = Math.min(value.length, marker.length - 1)

  for (let length = maxFragmentLength; length > 0; length -= 1) {
    const fragment = value.slice(-length).toLowerCase()

    if (marker.startsWith(fragment)) {
      return value.slice(0, -length)
    }
  }

  return value
}

const isDuplicateText = (left: string, right: string) => {
  const normalizedLeft = normalizeText(left)
  const normalizedRight = normalizeText(right)

  return Boolean(
    normalizedLeft && normalizedRight && normalizedLeft === normalizedRight,
  )
}

const dedupeRepeatedLines = (value: string) => {
  const lines = value.split(/\r?\n/u)
  const output: string[] = []

  for (const line of lines) {
    const normalizedLine = normalizeText(line)
    const previousLine = normalizeText(output[output.length - 1] ?? '')

    if (normalizedLine && normalizedLine === previousLine) {
      continue
    }

    output.push(line)
  }

  return output.join('\n')
}

const toolTranscriptMarkerPattern =
  /^[^\S\r\n]*\[tool:[^\]\n]+\][^\S\r\n]*$/gimu

const removeToolTranscripts = (value: string) => {
  let output = ''
  let cursor = 0

  for (const match of value.matchAll(toolTranscriptMarkerPattern)) {
    const markerStart = match.index ?? 0
    const markerEnd = markerStart + match[0].length

    output += value.slice(cursor, markerStart)

    const jsonStart = skipWhitespace(value, markerEnd)
    const jsonEnd = findJsonValueEnd(value, jsonStart)

    if (jsonEnd > jsonStart) {
      cursor = skipWhitespace(value, jsonEnd)
      continue
    }

    cursor = markerEnd
  }

  output += value.slice(cursor)
  return output
}

const skipWhitespace = (value: string, start: number) => {
  let index = start

  while (index < value.length && /\s/u.test(value[index] ?? '')) {
    index += 1
  }

  return index
}

const findJsonValueEnd = (value: string, start: number) => {
  const first = value[start]

  if (first === '{' || first === '[') {
    return findJsonContainerEnd(value, start, first === '{' ? '}' : ']')
  }

  if (first === '"') {
    return findJsonStringEnd(value, start)
  }

  return start
}

const findJsonContainerEnd = (
  value: string,
  start: number,
  closingCharacter: '}' | ']',
) => {
  const stack: string[] = [closingCharacter]
  let inString = false
  let escaped = false

  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }

      if (character === '\\') {
        escaped = true
        continue
      }

      if (character === '"') {
        inString = false
      }

      continue
    }

    if (character === '"') {
      inString = true
      continue
    }

    if (character === '{') {
      stack.push('}')
      continue
    }

    if (character === '[') {
      stack.push(']')
      continue
    }

    if (character === '}' || character === ']') {
      if (character !== stack.pop()) {
        return start
      }

      if (stack.length === 0) {
        return index + 1
      }
    }
  }

  return start
}

const findJsonStringEnd = (value: string, start: number) => {
  let escaped = false

  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index]

    if (escaped) {
      escaped = false
      continue
    }

    if (character === '\\') {
      escaped = true
      continue
    }

    if (character === '"') {
      return index + 1
    }
  }

  return start
}
