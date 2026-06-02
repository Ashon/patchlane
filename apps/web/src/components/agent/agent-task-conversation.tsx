import { useMemo, useState } from 'react'
import type { AgentRun, LlmEndpoint } from '@agent-fleet/shared'
import {
  ChevronDown,
  Network,
  RefreshCw,
  Send,
  Sparkles,
  Square,
} from 'lucide-react'
import {
  ChatConversation,
  type ConversationMessage,
} from '@/components/chat/chat-conversation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Markdown } from '@/components/ui/markdown'
import { PromptInputAction } from '@/components/ui/prompt-input'
import {
  normalizeAgentAssistantDisplay,
  splitThinking,
} from '@/lib/chat-format'
import { cn } from '@/lib/utils'

type AgentTaskConversationProps = {
  draft: string
  endpoint: LlmEndpoint | null
  error: string | null
  isStreaming: boolean
  onChange: (value: string) => void
  onContinue: () => void
  onRewind: (messageId: string) => void
  onSend: () => void
  onStop: () => void
  run: AgentRun
}

export const AgentTaskConversation = ({
  draft,
  endpoint,
  error,
  isStreaming,
  onChange,
  onContinue,
  onRewind,
  onSend,
  onStop,
  run,
}: AgentTaskConversationProps) => {
  const canUseEndpoint = Boolean(endpoint?.enabled)
  const canContinue =
    canUseEndpoint && !isStreaming && run.status !== 'completed'
  const canSend =
    canUseEndpoint &&
    !isStreaming &&
    Boolean(draft.trim()) &&
    run.status !== 'completed'
  const contextPanel =
    run.context?.strategy === 'compacted' ? (
      <AgentContextMemoryPanel context={run.context} />
    ) : null
  const messages = useMemo<ConversationMessage[]>(() => {
    const seenAssistantDisplay = new Set<string>()

    return run.messages.flatMap<ConversationMessage>((message) => {
      if (message.role === 'tool') {
        const toolDisplay = getAgentToolDisplay(message)

        if (toolDisplay.role === 'assistant') {
          const parsed = normalizeAgentAssistantDisplay(
            splitThinking(toolDisplay.content),
          )

          if (!parsed.content && !parsed.reasoning) {
            return []
          }

          return [
            {
              id: message.id,
              role: 'assistant',
              content: parsed.content,
              reasoning: parsed.reasoning,
              createdAt: message.createdAt,
              metadata: message.metadata,
            },
          ]
        }

        return [
          {
            id: message.id,
            role: 'tool',
            content: message.content,
            status: toolDisplay.status,
            createdAt: message.createdAt,
            toolName: message.toolName,
            toolCallId: message.id,
            toolOutput: toolDisplay.output,
            toolError: toolDisplay.error,
            metadata: message.metadata,
          },
        ]
      }

      const isAssistantLike =
        message.role === 'assistant' || message.role === 'system'
      const parsed = isAssistantLike
        ? normalizeAgentAssistantDisplay(splitThinking(message.content))
        : { content: message.content, reasoning: '' }
      const isStreamingAssistant = message.id.startsWith('stream-')

      if (
        isAssistantLike &&
        !parsed.content &&
        !parsed.reasoning &&
        !isStreamingAssistant
      ) {
        return []
      }

      if (isAssistantLike && !isStreamingAssistant) {
        const displayKey = `${message.role}:${parsed.reasoning.trim()}:${parsed.content.trim()}`

        if (
          displayKey.length > message.role.length + 2 &&
          seenAssistantDisplay.has(displayKey)
        ) {
          return []
        }

        seenAssistantDisplay.add(displayKey)
      }

      return [
        {
          id: message.id,
          role: message.role,
          content: parsed.content,
          reasoning: parsed.reasoning,
          status: isStreamingAssistant ? 'streaming' : undefined,
          createdAt: message.createdAt,
          metadata: message.metadata,
        },
      ]
    })
  }, [run.messages])

  return (
    <ChatConversation
      emptyState={
        <div className="flex min-h-[32vh] flex-col items-center justify-center gap-2.5 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-card text-primary shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold">Start the coding thread</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              The agent can inspect files, edit code, run checks, and report
              progress in this conversation.
            </p>
          </div>
        </div>
      }
      error={error}
      header={contextPanel}
      inputActions={
        <>
          <PromptInputAction tooltip="Continue run">
            <Button
              disabled={!canContinue}
              onClick={onContinue}
              size="icon"
              type="button"
              variant="outline"
            >
              <RefreshCw />
            </Button>
          </PromptInputAction>
          {isStreaming ? (
            <PromptInputAction tooltip="Stop response">
              <Button
                onClick={onStop}
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
                disabled={!canSend}
                onClick={onSend}
                size="icon"
                type="button"
              >
                <Send />
              </Button>
            </PromptInputAction>
          )}
        </>
      }
      inputDisabled={!canUseEndpoint || run.status === 'completed'}
      inputFooter={
        endpoint
          ? `${endpoint.baseUrl} · ${endpoint.defaultModel}`
          : 'Select an enabled endpoint'
      }
      inputLoading={isStreaming}
      inputPlaceholder={
        canUseEndpoint
          ? 'Reply to the coding agent or add constraints...'
          : 'Select an enabled endpoint before continuing'
      }
      inputValue={draft}
      messages={messages}
      onInputChange={onChange}
      onInputSubmit={() => {
        if (canSend) {
          onSend()
        }
      }}
      onRewindMessage={(message) => onRewind(message.id)}
      showAssistantAvatar={false}
      showInlineActivity={false}
      showMessageMeta
      showStreamingPlaceholder={false}
    />
  )
}

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

type AgentRunMessage = AgentRun['messages'][number]

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

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const AgentContextMemoryPanel = ({
  context,
}: {
  context: NonNullable<AgentRun['context']>
}) => {
  const [open, setOpen] = useState(false)
  const usage = getAgentRunContextUsage(context)

  return (
    <Collapsible
      className="border-b bg-amber-50/45 text-amber-950"
      onOpenChange={setOpen}
      open={open}
    >
      <div className="px-3 py-2">
        <CollapsibleTrigger asChild>
          <button
            className="flex w-full min-w-0 items-center gap-2 text-left text-xs"
            type="button"
          >
            <Network className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">Context memory</span>
            <Badge
              className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100"
              variant="outline"
            >
              {usage}%
            </Badge>
            <span className="truncate text-amber-800">
              {context.summarizedMessages} compacted ·{' '}
              {context.retainedMessages} recent kept
            </span>
            <ChevronDown
              className={cn(
                'ml-auto h-3.5 w-3.5 shrink-0 transition-transform',
                open && 'rotate-180',
              )}
            />
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="px-3 pb-3">
          <div className="max-h-72 overflow-y-auto rounded-md border border-amber-200 bg-background px-3 py-2.5 text-sm">
            <Markdown className="prose prose-sm max-w-none dark:prose-invert prose-headings:my-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-pre:my-2 prose-code:text-xs">
              {formatContextMemoryMarkdown(context)}
            </Markdown>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

const formatContextMemoryMarkdown = (
  context: NonNullable<AgentRun['context']>,
) => {
  const summary =
    context.summary?.trim() ||
    '_No context summary is available for this compacted run._'

  return [
    '### Context Memory Prompt',
    [
      `- Strategy: \`${context.strategy}\``,
      `- Estimated tokens: \`${context.estimatedTokens.toLocaleString()}\` / \`${context.tokenBudget.toLocaleString()}\``,
      `- Compacted messages: \`${context.summarizedMessages.toLocaleString()}\``,
      `- Recent messages kept: \`${context.retainedMessages.toLocaleString()}\``,
      `- Updated: \`${formatDateTime(context.updatedAt)}\``,
    ].join('\n'),
    '### Compacted Context',
    summary,
  ].join('\n\n')
}

const getAgentRunContextUsage = (context: NonNullable<AgentRun['context']>) => {
  return Math.min(
    100,
    Math.round((context.estimatedTokens / context.tokenBudget) * 100),
  )
}

const formatDateTime = (value?: string) => {
  if (!value) {
    return 'Never'
  }

  return new Date(value).toLocaleString()
}
