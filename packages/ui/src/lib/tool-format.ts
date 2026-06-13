export type JsonDetectionResult =
  | {
      isJson: true
      parsed: unknown
      type: 'array' | 'object' | 'stringified'
    }
  | {
      isJson: false
    }

export const detectJson = (value: unknown): JsonDetectionResult => {
  if (Array.isArray(value)) {
    return { isJson: true, parsed: value, type: 'array' }
  }

  if (isRecord(value)) {
    return { isJson: true, parsed: value, type: 'object' }
  }

  if (typeof value !== 'string') {
    return { isJson: false }
  }

  const trimmed = value.trim()

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return { isJson: false }
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown

    if (Array.isArray(parsed)) {
      return { isJson: true, parsed, type: 'array' }
    }

    if (isRecord(parsed)) {
      return { isJson: true, parsed, type: 'stringified' }
    }
  } catch {
    return { isJson: false }
  }

  return { isJson: false }
}

export const formatJson = (value: unknown, indent = 2) => {
  return JSON.stringify(value, null, indent)
}

export const truncateForPreview = (value: unknown, maxLength = 100) => {
  const json = detectJson(value)

  if (!json.isJson) {
    return truncateText(String(value), maxLength)
  }

  const formatted = formatJson(json.parsed, 0)

  if (formatted.length <= maxLength) {
    return formatted
  }

  if (json.type === 'array') {
    const items = json.parsed as unknown[]

    if (items.length === 0) {
      return '[]'
    }

    return `[${JSON.stringify(items[0])}] +${items.length - 1} more`
  }

  if (json.type === 'object') {
    const entries = Object.entries(json.parsed as Record<string, unknown>)

    if (entries.length === 0) {
      return '{}'
    }

    const [key, entryValue] = entries[0]!

    return `{ "${key}": ${JSON.stringify(entryValue)} } +${
      entries.length - 1
    } more`
  }

  return truncateText(formatted, maxLength)
}

const truncateText = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}...`
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
