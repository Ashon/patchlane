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

const trimTrailingZero = (value: string) => value.replace(/\.0$/u, '')

