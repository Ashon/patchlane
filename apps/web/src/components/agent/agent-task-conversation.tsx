import { useMemo, useState } from 'react'
import type { AgentRun, LlmEndpoint } from '@patchlane/shared'
import {
  ChevronDown,
  Network,
  RefreshCw,
  Send,
  Sparkles,
  Square,
} from 'lucide-react'
import { ChatConversation } from '@/components/chat/chat-conversation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Markdown } from '@/components/ui/markdown'
import { PromptInputAction } from '@/components/ui/prompt-input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getAgentTaskConversationMessages } from '@/lib/agent-task-messages'
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
  const messages = useMemo(
    () => getVisibleAgentTaskMessages(run, isStreaming),
    [isStreaming, run],
  )

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
      preserveEmptyMessages
      showAssistantAvatar={false}
      showInlineActivity={false}
      showMessageMeta
      showStreamingPlaceholder
      wideMessages
    />
  )
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
      className="border-b bg-amber-500/10 text-amber-500"
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
            <Badge className="border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300">
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
        <div className="m-3 mt-0 rounded-md border bg-background">
          <ScrollArea className="max-h-72" viewportClassName="px-3 py-2.5">
            <Markdown className="prose prose-sm max-w-none dark:prose-invert prose-headings:my-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-pre:my-2 prose-code:text-xs">
              {formatContextMemoryMarkdown(context)}
            </Markdown>
          </ScrollArea>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

const getVisibleAgentTaskMessages = (run: AgentRun, isStreaming: boolean) => {
  return getAgentTaskConversationMessages(run, isStreaming)
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
