import { useMemo, useRef, useState } from 'react'
import type { LlmChatMessage, LlmEndpoint } from '@agent-fleet/shared'
import { Cpu, MessageSquare, Send, Sparkles, Square } from 'lucide-react'
import {
  ChatConversation,
  type ConversationMessage,
} from '@/components/chat/chat-conversation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PromptInputAction } from '@/components/ui/prompt-input'
import { PromptSuggestion } from '@/components/ui/prompt-suggestion'
import { api } from '@/lib/api'
import { splitThinking } from '@/lib/chat-format'
import { cn } from '@/lib/utils'

type ChatPanelProps = {
  endpoint: LlmEndpoint | null
}

type ChatMessage = ConversationMessage & {
  role: 'user' | 'assistant'
  reasoning: string
}

const suggestions = [
  '현재 모델의 장단점을 Markdown 표로 정리해줘.',
  'TypeScript Express SSE 예제를 코드 블록으로 보여줘.',
  '이 프로젝트에서 agent fleet 기능을 어떻게 확장할지 제안해줘.',
]

export const ChatPanel = ({ endpoint }: ChatPanelProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const canChat = Boolean(endpoint?.enabled)

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
          messages: [...apiMessages, { role: 'user', content: prompt }],
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
        <div className="flex min-h-[32vh] flex-col items-center justify-center gap-2.5 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-card text-primary shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold">Start a conversation</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              Streaming responses, reasoning panels, Markdown, tables, and code
              blocks are enabled.
            </p>
          </div>
          <div className="flex max-w-2xl flex-wrap justify-center gap-2">
            {suggestions.map((suggestion) => (
              <PromptSuggestion
                disabled={!canChat || isStreaming}
                key={suggestion}
                onClick={() => void sendMessage(suggestion)}
                type="button"
              >
                {suggestion}
              </PromptSuggestion>
            ))}
          </div>
        </div>
      }
      error={error}
      header={
        <header className="flex min-h-10 flex-col gap-2 border-b bg-card px-3 py-2 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">Agent Chat</h2>
              <p className="truncate text-xs text-muted-foreground">
                {endpoint
                  ? `${endpoint.name} / ${endpoint.defaultModel}`
                  : 'No endpoint selected'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className={cn(
                'gap-1',
                canChat
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50'
                  : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50',
              )}
              variant="outline"
            >
              <Cpu className="h-3.5 w-3.5" />
              {canChat ? 'Ready' : 'Unavailable'}
            </Badge>
            <Button
              disabled={!messages.length && !error}
              onClick={clearChat}
              size="sm"
              type="button"
              variant="outline"
            >
              Clear
            </Button>
          </div>
        </header>
      }
      inputActions={
        isStreaming ? (
          <PromptInputAction tooltip="Stop response">
            <Button
              onClick={stopStreaming}
              size="icon"
              type="button"
              variant="outline"
            >
              <Square />
            </Button>
          </PromptInputAction>
        ) : (
          <PromptInputAction tooltip="Send message">
            <Button
              disabled={!canChat || !input.trim()}
              onClick={() => void sendMessage()}
              size="icon"
              type="button"
            >
              <Send />
            </Button>
          </PromptInputAction>
        )
      }
      inputDisabled={!canChat}
      inputFooter={
        endpoint
          ? `${endpoint.baseUrl} · ${endpoint.defaultModel}`
          : 'Select an enabled endpoint'
      }
      inputLoading={isStreaming}
      inputPlaceholder={
        canChat
          ? 'Ask the selected model...'
          : 'Select an enabled endpoint first'
      }
      inputValue={input}
      messages={messages}
      onInputChange={setInput}
      onInputSubmit={() => {
        void sendMessage()
      }}
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
