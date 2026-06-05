import type { AgentRun } from '@patchlane/shared'
import type { ConversationMessage } from '../components/chat/chat-conversation'
import { splitThinking } from './chat-format'

type AgentRunMessage = AgentRun['messages'][number]

type AgentToolDisplay =
  | {
      role: 'assistant'
      content: string
    }
  | {
      role: 'tool'
      status: ConversationMessage['status']
      output?: unknown
      error?: string
    }

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

export const getAgentTaskConversationMessages = (
  run: AgentRun,
  isStreaming: boolean,
) => {
  const activeStreamingAssistantId = getActiveStreamingAssistantId(
    run,
    isStreaming,
  )

  return dedupeAdjacentAssistantMessages(
    run.messages.map<ConversationMessage>((message) => {
      if (message.role === 'tool') {
        const toolDisplay = getAgentToolDisplay(message)

        if (toolDisplay.role === 'assistant') {
          const parsed = splitThinking(toolDisplay.content)

          return {
            id: message.id,
            role: 'assistant',
            content: parsed.content,
            reasoning: parsed.reasoning,
            createdAt: message.createdAt,
            metadata: message.metadata,
          }
        }

        return {
          id: message.id,
          role: 'tool',
          content: message.content,
          status: toolDisplay.status,
          createdAt: message.createdAt,
          toolName: message.toolName,
          toolCallId: message.id,
          toolInput: message.toolInput,
          toolOutput: toolDisplay.output,
          toolError: toolDisplay.error,
          metadata: message.metadata,
        }
      }

      const isAssistantLike =
        message.role === 'assistant' || message.role === 'system'
      const parsed = isAssistantLike
        ? splitThinking(message.content)
        : { content: message.content, reasoning: '' }
      const isStreamingAssistant = message.id === activeStreamingAssistantId

      return {
        id: message.id,
        role: message.role,
        content: parsed.content,
        reasoning: parsed.reasoning,
        status: isStreamingAssistant ? 'streaming' : undefined,
        createdAt: message.createdAt,
        metadata: message.metadata,
      }
    }),
  )
}

const getActiveStreamingAssistantId = (run: AgentRun, isStreaming: boolean) => {
  if (!isStreaming) {
    return undefined
  }

  const latestUserIndex = findLastIndex(
    run.messages,
    (message) => message.role === 'user',
  )
  const latestMessage = run.messages[run.messages.length - 1]

  return latestMessage &&
    run.messages.length - 1 > latestUserIndex &&
    latestMessage.role === 'assistant' &&
    latestMessage.id.startsWith('stream-')
    ? latestMessage.id
    : undefined
}

const findLastIndex = <T>(
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

const dedupeAdjacentAssistantMessages = (messages: ConversationMessage[]) => {
  const output: ConversationMessage[] = []

  for (const message of messages) {
    const previous = output[output.length - 1]
    const previousKey = previous ? getAssistantMessageDisplayKey(previous) : ''
    const messageKey = getAssistantMessageDisplayKey(message)

    if (previous && messageKey && previousKey === messageKey) {
      if (!previous.metadata && message.metadata) {
        output[output.length - 1] = {
          ...previous,
          metadata: message.metadata,
        }
      }

      continue
    }

    output.push(message)
  }

  return output
}

const getAssistantMessageDisplayKey = (message: ConversationMessage) => {
  if (message.role !== 'assistant' && message.role !== 'system') {
    return ''
  }

  const content = message.content.trim()
  const reasoning = (message.reasoning ?? '').trim()

  if (!content && !reasoning) {
    return ''
  }

  return `${message.role}:${reasoning}:${content}`
}

const getAgentToolDisplay = (message: AgentRunMessage): AgentToolDisplay => {
  if (message.content === `Running ${message.toolName || 'tool'}...`) {
    return {
      role: 'tool',
      status: 'streaming',
    }
  }

  if (message.toolName === 'request_user_input') {
    return {
      role: 'assistant',
      content: message.content,
    }
  }

  const payload = parseToolPayload(message.content)
  const error = getToolPayloadError(payload)

  return {
    role: 'tool',
    status: error ? 'error' : 'done',
    output: payload ?? message.content,
    error,
  }
}

const parseToolPayload = (content: string) => {
  try {
    return JSON.parse(content) as unknown
  } catch {
    return null
  }
}

const getToolPayloadError = (payload: unknown) => {
  if (!isRecord(payload)) {
    return undefined
  }

  if (typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error.trim()
  }

  if (payload.ok === false) {
    const stderr =
      typeof payload.stderr === 'string' ? payload.stderr.trim() : ''
    const stdout =
      typeof payload.stdout === 'string' ? payload.stdout.trim() : ''
    const exitCode =
      typeof payload.exitCode === 'number'
        ? `Command exited with code ${payload.exitCode}.`
        : ''

    return stderr || stdout || exitCode || 'Tool returned ok: false.'
  }

  return undefined
}

const truncateText = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
