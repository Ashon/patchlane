import type { AgentRun, AgentRunMessageMetadata } from '@agent-fleet/shared'
import { splitThinking } from './chat-format'

export type AgentRunMessage = AgentRun['messages'][number]
export type AssistantStreamSegment = {
  id: string
  content: string
  metadata?: AgentRunMessageMetadata
} | null
export type PendingToolMessage = {
  id: string
  toolInput?: Record<string, unknown>
  toolName: string
}

export const mergeToolStartMessage = (
  messages: AgentRunMessage[],
  assistantSegment: AssistantStreamSegment,
  toolMessage: AgentRunMessage,
) => {
  if (!assistantSegment) {
    return [...messages, toolMessage]
  }

  const existingIndex = messages.findIndex(
    (message) => message.id === assistantSegment.id,
  )
  const hasAssistantContent = Boolean(
    getVisibleAgentAssistantText(assistantSegment.content),
  )

  if (existingIndex < 0) {
    if (!hasAssistantContent) {
      return [...messages, toolMessage]
    }

    return [
      ...messages,
      createFinalAssistantMessage(assistantSegment, toolMessage.createdAt),
      toolMessage,
    ]
  }

  return messages.flatMap((message) => {
    if (message.id !== assistantSegment.id) {
      return [message]
    }

    if (!hasAssistantContent) {
      return [toolMessage]
    }

    return [
      {
        ...message,
        content: assistantSegment.content,
        metadata: assistantSegment.metadata ?? message.metadata,
      },
      toolMessage,
    ]
  })
}

export const mergeToolResultMessage = (
  messages: AgentRunMessage[],
  toolMessage: AgentRunMessage,
): AgentRunMessage[] => {
  const existingIndex = findMatchingToolMessageIndex(messages, toolMessage)

  if (existingIndex < 0) {
    return [...messages, toolMessage]
  }

  return messages.map((message, index) => {
    if (index !== existingIndex) {
      return message
    }

    return {
      ...message,
      role: 'tool',
      toolName: toolMessage.toolName ?? message.toolName,
      toolInput: message.toolInput ?? toolMessage.toolInput,
      content: toolMessage.content,
      metadata: toolMessage.metadata ?? message.metadata,
    }
  })
}

export const finalizeAssistantSegmentMessage = (
  messages: AgentRunMessage[],
  assistantSegment: Exclude<AssistantStreamSegment, null>,
  serverMessages: AgentRunMessage[],
) => {
  const existingIndex = messages.findIndex(
    (message) => message.id === assistantSegment.id,
  )
  const hasAssistantContent = Boolean(
    getVisibleAgentAssistantText(assistantSegment.content),
  )

  if (existingIndex < 0) {
    return hasAssistantContent
      ? [
          ...messages,
          getFinalAssistantMessage(assistantSegment, serverMessages),
        ]
      : messages
  }

  return messages.flatMap((message) => {
    if (message.id !== assistantSegment.id) {
      return [message]
    }

    return hasAssistantContent
      ? [getFinalAssistantMessage(assistantSegment, serverMessages, message)]
      : []
  })
}

export const mergeVisibleAgentRunMessages = (
  visibleMessages: AgentRunMessage[],
  serverMessages: AgentRunMessage[],
  options: { skipServerAssistantMessages?: boolean } = {},
) => {
  const merged = [...visibleMessages]
  const matchedIndexes = new Set<number>()

  for (const serverMessage of serverMessages) {
    if (
      options.skipServerAssistantMessages &&
      serverMessage.role === 'assistant'
    ) {
      continue
    }

    const existingIndex = merged.findIndex(
      (message, index) =>
        !matchedIndexes.has(index) &&
        isSameVisibleMessage(message, serverMessage),
    )

    if (existingIndex < 0) {
      merged.push(serverMessage)
      matchedIndexes.add(merged.length - 1)
      continue
    }

    matchedIndexes.add(existingIndex)
    merged[existingIndex] = mergeServerMessageIntoVisibleMessage(
      merged[existingIndex]!,
      serverMessage,
    )
  }

  return merged
}

export const getVisibleAgentAssistantText = (content: string) => {
  const parsed = splitThinking(content)

  return `${parsed.reasoning}\n${parsed.content}`.trim()
}

export const parseToolInputArguments = (
  value?: string,
): Record<string, unknown> | undefined => {
  if (!value) {
    return undefined
  }

  try {
    const parsed = JSON.parse(value) as unknown

    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { value: parsed }
  } catch {
    return { value }
  }
}

export const isRunningToolMessage = (message: AgentRunMessage) => {
  return (
    message.role === 'tool' &&
    message.content === `Running ${message.toolName || 'tool'}...`
  )
}

const findMatchingToolMessageIndex = (
  messages: AgentRunMessage[],
  toolMessage: AgentRunMessage,
) => {
  const idIndex = messages.findIndex((message) => message.id === toolMessage.id)

  if (idIndex >= 0) {
    return idIndex
  }

  const runningIndex = findLastIndex(
    messages,
    (message) =>
      message.role === 'tool' &&
      message.toolName === toolMessage.toolName &&
      isRunningToolMessage(message),
  )

  if (runningIndex >= 0) {
    return runningIndex
  }

  return findLastIndex(
    messages,
    (message) =>
      message.role === 'tool' &&
      message.toolName === toolMessage.toolName &&
      message.content === toolMessage.content,
  )
}

const mergeServerMessageIntoVisibleMessage = (
  visibleMessage: AgentRunMessage,
  serverMessage: AgentRunMessage,
): AgentRunMessage => {
  if (visibleMessage.role === 'tool' && serverMessage.role === 'tool') {
    return {
      ...serverMessage,
      id: visibleMessage.id,
      createdAt: visibleMessage.createdAt,
      toolInput: visibleMessage.toolInput ?? serverMessage.toolInput,
      metadata: serverMessage.metadata ?? visibleMessage.metadata,
    }
  }

  if (serverMessage.metadata) {
    return {
      ...visibleMessage,
      metadata: serverMessage.metadata,
    }
  }

  return visibleMessage
}

const isSameVisibleMessage = (
  left: AgentRunMessage,
  right: AgentRunMessage,
) => {
  if (left.id === right.id) {
    return true
  }

  if (left.role === 'assistant' && right.role === 'assistant') {
    const leftContent = getVisibleAgentAssistantText(left.content)
    const rightContent = getVisibleAgentAssistantText(right.content)

    if (leftContent && rightContent && leftContent === rightContent) {
      return true
    }
  }

  if (left.role === 'tool' && right.role === 'tool') {
    if (left.toolName !== right.toolName) {
      return false
    }

    if (left.content === right.content) {
      return true
    }

    if (isRunningToolMessage(left) || isRunningToolMessage(right)) {
      return true
    }
  }

  return (
    left.role === right.role &&
    left.toolName === right.toolName &&
    left.content === right.content
  )
}

const createFinalAssistantMessage = (
  assistantSegment: Exclude<AssistantStreamSegment, null>,
  createdAt: string,
): AgentRunMessage => ({
  id: assistantSegment.id,
  role: 'assistant',
  content: assistantSegment.content,
  metadata: assistantSegment.metadata,
  createdAt,
})

const getFinalAssistantMessage = (
  assistantSegment: Exclude<AssistantStreamSegment, null>,
  serverMessages: AgentRunMessage[],
  fallback?: AgentRunMessage,
) => {
  const serverMessage = serverMessages.find(
    (message) =>
      message.role === 'assistant' &&
      message.content === assistantSegment.content,
  )

  return {
    ...(serverMessage ??
      fallback ??
      createFinalAssistantMessage(assistantSegment, new Date().toISOString())),
    id: fallback?.id ?? assistantSegment.id,
    content: serverMessage?.content ?? assistantSegment.content,
    metadata:
      serverMessage?.metadata ?? assistantSegment.metadata ?? fallback?.metadata,
  }
}

const findLastIndex = <T,>(
  values: T[],
  predicate: (value: T, index: number) => boolean,
) => {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index]!, index)) {
      return index
    }
  }

  return -1
}
