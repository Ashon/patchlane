import { useMemo, useRef, useState } from 'react'
import type { LlmChatMessage, LlmEndpoint } from '@patchlane/shared'
import {
  ChatConversation,
  type ConversationMessage,
} from '@/components/chat/chat-conversation'
import { api } from '@/lib/api'
import { splitThinking } from '@/lib/chat-format'
import { ChatPanelEmptyState } from './chat-panel-empty-state'
import { ChatPanelHeader } from './chat-panel-header'
import { ChatPanelInputActions } from './chat-panel-input-actions'
import {
  chatSuggestions,
  supervisorChatSuggestions,
} from './chat-panel-suggestions'

type ChatPanelProps = {
  contextLabel?: string
  endpoint: LlmEndpoint | null
  endpoints: LlmEndpoint[]
  loading?: boolean
  onEndpointChange: (id: string) => void
  orchestrator?: boolean
  systemPrompt?: string
  title?: string
  variant?: 'page' | 'sidebar'
}

export const ChatPanel = ({
  contextLabel,
  endpoint,
  endpoints,
  loading = false,
  onEndpointChange,
  orchestrator = false,
  systemPrompt,
  title = 'Agent Chat',
  variant = 'page',
}: ChatPanelProps) => {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const canChat = Boolean(endpoint?.enabled)
  const isSidebar = variant === 'sidebar'
  const panelSuggestions = isSidebar
    ? supervisorChatSuggestions
    : chatSuggestions

  const apiMessages = useMemo<LlmChatMessage[]>(
    () =>
      messages
        .filter(
          (message) =>
            message.role === 'user' ||
            (message.role === 'assistant' && message.status === 'done'),
        )
        .map((message) => ({
          role: message.role as 'user' | 'assistant',
          content: message.content,
        })),
    [messages],
  )

  const buildHistory = (prompt: string): LlmChatMessage[] => [
    ...(systemPrompt
      ? ([{ role: 'system', content: systemPrompt }] satisfies LlmChatMessage[])
      : []),
    ...apiMessages,
    { role: 'user', content: prompt },
  ]

  const handleStreamFailure = (streamError: unknown, assistantId?: string) => {
    if (isAbortError(streamError)) {
      setMessages((current) =>
        current.map((message) =>
          message.status === 'streaming'
            ? { ...message, status: 'stopped' }
            : message,
        ),
      )
      return
    }

    const message = getErrorMessage(streamError)
    setError(message)
    setMessages((current) =>
      current.map((item) =>
        item.status === 'streaming' ||
        (assistantId !== undefined && item.id === assistantId)
          ? {
              ...item,
              status: 'error',
              content:
                item.role === 'assistant' && !item.content
                  ? message
                  : item.content,
            }
          : item,
      ),
    )
  }

  const sendSupervisorMessage = async (
    history: LlmChatMessage[],
    controller: AbortController,
  ) => {
    if (!endpoint) {
      return
    }

    const assistantId = crypto.randomUUID()
    let assistantCreated = false
    let assistantContent = ''

    try {
      await api.streamSupervisorChat(
        {
          endpointId: endpoint.id,
          messages: history,
          model: endpoint.defaultModel,
        },
        {
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === 'tool_call') {
              const toolMessage: ConversationMessage = {
                id: event.id,
                role: 'tool',
                content: '',
                status: 'streaming',
                toolName: event.name,
                toolCallId: event.id,
                toolInput: parseToolArguments(event.arguments),
              }
              setMessages((current) => [...current, toolMessage])
            } else if (event.type === 'tool_result') {
              const parsedOutput = parseJson(event.result)
              setMessages((current) =>
                current.map((message) =>
                  message.id === event.id
                    ? {
                        ...message,
                        status: event.ok ? 'done' : 'error',
                        content: event.result,
                        toolOutput: parsedOutput,
                        toolError: event.ok
                          ? undefined
                          : (extractErrorText(parsedOutput) ??
                            'Tool call failed'),
                      }
                    : message,
                ),
              )
            } else if (event.type === 'delta') {
              assistantContent += event.content || ''

              if (!assistantCreated) {
                assistantCreated = true
                setMessages((current) => [
                  ...current,
                  {
                    id: assistantId,
                    role: 'assistant',
                    content: assistantContent,
                    status: 'streaming',
                  },
                ])
              } else {
                setMessages((current) =>
                  current.map((message) =>
                    message.id === assistantId
                      ? { ...message, content: assistantContent }
                      : message,
                  ),
                )
              }
            } else if (event.type === 'finish') {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId
                    ? {
                        ...message,
                        status: 'done',
                        finishReason: event.finishReason,
                      }
                    : message,
                ),
              )
            } else if (event.type === 'error') {
              throw new Error(event.error)
            }
          },
        },
      )

      if (!assistantCreated) {
        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: 'assistant',
            content: 'Done.',
            status: 'done',
          },
        ])
      }
    } catch (streamError) {
      handleStreamFailure(streamError, assistantId)
    }
  }

  const sendPlainMessage = async (
    history: LlmChatMessage[],
    controller: AbortController,
  ) => {
    if (!endpoint) {
      return
    }

    const assistantId = crypto.randomUUID()
    setMessages((current) => [
      ...current,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        reasoning: '',
        status: 'streaming',
      },
    ])

    try {
      let rawContent = ''
      let rawReasoning = ''

      await api.streamChat(
        {
          endpointId: endpoint.id,
          maxTokens: 2048,
          messages: history,
          model: endpoint.defaultModel,
          temperature: 0.2,
        },
        {
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === 'delta') {
              rawContent += event.content || ''
              rawReasoning += event.reasoning || ''
              const parsed = splitThinking(rawContent, rawReasoning)

              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId
                    ? {
                        ...message,
                        content: parsed.content,
                        reasoning: parsed.reasoning,
                        status: 'streaming',
                      }
                    : message,
                ),
              )
            }

            if (event.type === 'finish') {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId
                    ? { ...message, finishReason: event.finishReason }
                    : message,
                ),
              )
            }

            if (event.type === 'error') {
              throw new Error(event.error)
            }
          },
        },
      )

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId ? { ...message, status: 'done' } : message,
        ),
      )
    } catch (streamError) {
      handleStreamFailure(streamError, assistantId)
    }
  }

  const sendMessage = async (value = input) => {
    const prompt = value.trim()

    if (!endpoint || !canChat || !prompt || isStreaming) {
      return
    }

    const userMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      status: 'done',
    }
    const controller = new AbortController()
    const history = buildHistory(prompt)

    abortRef.current = controller
    setInput('')
    setError(null)
    setIsStreaming(true)
    setMessages((current) => [...current, userMessage])

    try {
      if (orchestrator) {
        await sendSupervisorMessage(history, controller)
      } else {
        await sendPlainMessage(history, controller)
      }
    } finally {
      abortRef.current = null
      setIsStreaming(false)
    }
  }

  const stopStreaming = () => {
    abortRef.current?.abort()
  }

  const clearChat = () => {
    stopStreaming()
    setMessages([])
    setError(null)
  }

  return (
    <ChatConversation
      emptyState={
        <ChatPanelEmptyState
          canChat={canChat}
          isSidebar={isSidebar}
          isStreaming={isStreaming}
          onSuggestionClick={(suggestion) => void sendMessage(suggestion)}
          suggestions={panelSuggestions}
        />
      }
      error={error}
      header={
        <ChatPanelHeader
          canChat={canChat}
          contextLabel={contextLabel}
          endpoint={endpoint}
          endpoints={endpoints}
          hasConversation={Boolean(messages.length || error)}
          isSidebar={isSidebar}
          isStreaming={isStreaming}
          loading={loading}
          onClear={clearChat}
          onEndpointChange={onEndpointChange}
          title={title}
        />
      }
      inputActions={
        <ChatPanelInputActions
          canChat={canChat}
          input={input}
          isStreaming={isStreaming}
          onSend={() => void sendMessage()}
          onStop={stopStreaming}
        />
      }
      inputDisabled={!canChat}
      inputFooter={
        isSidebar
          ? (contextLabel ?? 'Supervisor Chat')
          : endpoint
            ? `${endpoint.baseUrl} · ${endpoint.defaultModel}`
            : 'Select an enabled endpoint'
      }
      inputLoading={isStreaming}
      inputPlaceholder={
        canChat
          ? isSidebar
            ? 'Ask the supervisor to plan, create, or assign...'
            : 'Ask the selected model...'
          : 'Select an enabled endpoint first'
      }
      inputValue={input}
      messages={messages}
      onInputChange={setInput}
      onInputSubmit={() => {
        void sendMessage()
      }}
      showAssistantAvatar={!isSidebar}
      wideMessages={isSidebar}
    />
  )
}

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const parseToolArguments = (
  value: string,
): Record<string, unknown> | undefined => {
  const parsed = parseJson(value)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : undefined
}

const extractErrorText = (value: unknown): string | undefined => {
  if (
    value &&
    typeof value === 'object' &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'string'
  ) {
    return (value as { error: string }).error
  }

  return undefined
}

const isAbortError = (error: unknown) => {
  return error instanceof DOMException && error.name === 'AbortError'
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown chat error'
}
