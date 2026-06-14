export const agentRunCancellationMessage = 'Agent run stopped by user.'

export class AgentRunCancelledError extends Error {
  constructor(message = agentRunCancellationMessage) {
    super(message)
    this.name = 'AgentRunCancelledError'
  }
}

export const throwIfAgentRunCancelled = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new AgentRunCancelledError(getAbortReasonMessage(signal))
  }
}

export const isAgentRunCancelledError = (error: unknown) => {
  if (error instanceof AgentRunCancelledError) {
    return true
  }

  if (!(error instanceof Error)) {
    return false
  }

  return error.name === 'AbortError' || error.name === 'APIUserAbortError'
}

const getAbortReasonMessage = (signal: AbortSignal) => {
  const reason = signal.reason

  if (typeof reason === 'string' && reason.trim()) {
    return reason
  }

  if (reason instanceof Error && reason.message.trim()) {
    return reason.message
  }

  return agentRunCancellationMessage
}
