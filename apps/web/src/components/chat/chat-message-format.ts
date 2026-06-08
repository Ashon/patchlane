export const formatCompactNumber = (value: number) => {
  if (value >= 1_000_000) {
    return `${trimTrailingZero((value / 1_000_000).toFixed(1))}m`
  }

  if (value >= 1_000) {
    return `${trimTrailingZero((value / 1_000).toFixed(1))}k`
  }

  return value.toLocaleString()
}

export const formatDurationMs = (durationMs: number) => {
  if (durationMs < 1_000) {
    return `${durationMs}ms`
  }

  if (durationMs < 60_000) {
    return `${trimTrailingZero((durationMs / 1_000).toFixed(1))}s`
  }

  const minutes = Math.floor(durationMs / 60_000)
  const seconds = Math.round((durationMs % 60_000) / 1_000)

  return `${minutes}m ${seconds}s`
}

export const formatDateTime = (value: string) => {
  return new Date(value).toLocaleString()
}

export const formatRelativeDateTime = (value: string) => {
  const date = new Date(value)
  const diffMs = Date.now() - date.getTime()

  if (diffMs < 45_000) {
    return 'just now'
  }

  const minutes = Math.round(diffMs / 60_000)

  if (minutes < 60) {
    return `${minutes}m ago`
  }

  const hours = Math.round(minutes / 60)

  if (hours < 24) {
    return `${hours}h ago`
  }

  const days = Math.round(hours / 24)

  if (days < 7) {
    return `${days}d ago`
  }

  return date.toLocaleDateString()
}

const trimTrailingZero = (value: string) => value.replace(/\.0$/u, '')

