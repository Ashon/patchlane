import type { ToolPart } from '@patchlane/ui/tool'
import type { ConversationMessage } from './chat-conversation-types'

export const toToolPart = (message: ConversationMessage): ToolPart => {
  const isStreaming = message.status === 'streaming'
  const isError = message.status === 'error'
  const contentOutput =
    message.content && !isStreaming && !isError ? message.content : undefined
  const output = message.toolOutput ?? contentOutput

  return {
    type: message.toolName || 'tool',
    state: isError
      ? 'output-error'
      : isStreaming
        ? 'input-streaming'
        : output
          ? 'output-available'
          : 'input-available',
    input: message.toolInput,
    output,
    toolCallId: message.toolCallId ?? message.id,
    errorText: message.toolError ?? (isError ? message.content : undefined),
  }
}

