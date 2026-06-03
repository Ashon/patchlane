import { useMemo, useRef, useState } from 'react'
import type { LlmChatMessage, LlmEndpoint } from '@agent-fleet/shared'
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
  systemPrompt?: string
  title?: string
  variant?: 'page' | 'sidebar'
}

type ChatMessage = ConversationMessage & {
  role: 'user' | 'assistant'
  reasoning: string
}

export const ChatPanel = ({
  contextLabel,
  endpoint,
  endpoints,
  loading = false,
  onEndpointChange,
  systemPrompt,
  title = 'Agent Chat',
  variant = 'page',
}: ChatPanelProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const canChat = Boolean(endpoint?.enabled)
  const isSidebar = variant === 'sidebar'
  const panelSuggestions = isSidebar ? supervisorChatSuggestions : chatSuggestions

  const apiMessages = useMemo<LlmChatMessage[]>(
    () =>
      messages
        .filter(
          (message) =>
            message.role === 'user' ||
            (message.role === 'assistant' && message.status === 'done'),
        )
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
    [messages],
  )

  const sendMessage = async (value = input) => {
    const prompt = value.trim()

    if (!endpoint || !canChat || !prompt || isStreaming) {
      return
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      reasoning: '',
      status: 'done',
    }
    const assistantId = crypto.randomUUID()
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      reasoning: '',
      status: 'streaming',
    }
    const controller = new AbortController()

    abortRef.current = controller
    setInput('')
    setError(null)
    setIsStreaming(true)
    setMessages((current) => [...current, userMessage, assistantMessage])

    try {
      let rawContent = ''
      let rawReasoning = ''

      await api.streamChat(
        {
          endpointId: endpoint.id,
          maxTokens: 2048,
          messages: [
            ...(systemPrompt
              ? ([{ role: 'system', content: systemPrompt }] satisfies LlmChatMessage[])
              : []),
            ...apiMessages,
            { role: 'user', content: prompt },
          ],
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
      if (isAbortError(streamError)) {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? { ...message, status: 'stopped' }
              : message,
          ),
        )
      } else {
        const message = getErrorMessage(streamError)
        setError(message)
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId
              ? {
                  ...item,
                  content: message,
                  status: 'error',
                }
              : item,
          ),
        )
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
            ? 'Ask the supervisor...'
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

const isAbortError = (error: unknown) => {
  return error instanceof DOMException && error.name === 'AbortError'
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown chat error'
}
