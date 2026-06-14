import { useMemo, useState } from 'react'
import type { AgentRun, AgentRuntime, LlmEndpoint } from '@patchlane/shared'
import {
  ChevronDown,
  Network,
  RefreshCw,
  Send,
  Sparkles,
  Square,
} from 'lucide-react'
import { ChatConversation } from '@/components/chat/chat-conversation'
import { Badge } from '@patchlane/ui/badge'
import { Button } from '@patchlane/ui/button'
import { Loader } from '@patchlane/ui/loader'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@patchlane/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@patchlane/ui/collapsible'
import { Markdown } from '@patchlane/ui/markdown'
import { PromptInputAction } from '@patchlane/ui/prompt-input'
import { ScrollArea } from '@patchlane/ui/scroll-area'
import { getAgentTaskConversationMessages } from '@/lib/agent-task-messages'
import { cn } from '@/lib/utils'

type AgentTaskConversationProps = {
  draft: string
  endpoint: LlmEndpoint | null
  endpoints: LlmEndpoint[]
  error: string | null
  isStreaming: boolean
  onChange: (value: string) => void
  onContinue: () => void
  onRewind: (messageId: string) => void
  onRuntimeChange: (runtime: AgentRuntime) => void
  onSend: () => void
  onStop: () => void
  run: AgentRun
}

export const AgentTaskConversation = ({
  draft,
  endpoint,
  endpoints,
  error,
  isStreaming,
  onChange,
  onContinue,
  onRewind,
  onRuntimeChange,
  onSend,
  onStop,
  run,
}: AgentTaskConversationProps) => {
  const usesEndpoint = run.agentRuntime === 'patchlane'
  const runEndpoint = run.endpointId
    ? endpoints.find((item) => item.id === run.endpointId)
    : undefined
  const canUseBackend =
    !usesEndpoint || Boolean(runEndpoint?.enabled ?? endpoint?.enabled)
  const terminal = run.status === 'completed' || run.status === 'cancelled'
  const canContinue = canUseBackend && !isStreaming && !terminal
  const canSend =
    canUseBackend && !isStreaming && Boolean(draft.trim()) && !terminal
  const inputFooter = (
    <AgentRuntimeFooter
      disabled={isStreaming || run.status === 'running' || terminal}
      endpoints={endpoints}
      loading={isStreaming}
      onChange={onRuntimeChange}
      run={run}
    />
  )
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
      compactAgentWork
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
      inputDisabled={!canUseBackend || terminal}
      inputFooter={inputFooter}
      inputLoading={isStreaming}
      inputPlaceholder={
        canUseBackend
          ? 'Reply to the coding agent or add constraints...'
          : usesEndpoint
            ? 'Select an enabled endpoint before continuing'
            : `${getAgentRuntimeLabel(run.agentRuntime)} is not available`
      }
      inputTextareaDisabled={!canUseBackend || terminal || isStreaming}
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
      showInputLoadingIndicator={false}
      showInlineActivity={false}
      showMessageMeta
      showStreamingPlaceholder
      wideMessages
    />
  )
}

const AgentRuntimeFooter = ({
  disabled,
  endpoints,
  loading,
  onChange,
  run,
}: {
  disabled: boolean
  endpoints: LlmEndpoint[]
  loading: boolean
  onChange: (runtime: AgentRuntime) => void
  run: AgentRun
}) => {
  const openAiAvailable = endpoints.some(
    (item) => item.enabled && item.runtimeType === 'openai_compatible',
  )
  const openCodeAvailable = endpoints.some(
    (item) => item.enabled && item.runtimeType === 'opencode_cli',
  )
  const codexAvailable = endpoints.some(
    (item) => item.enabled && item.runtimeType === 'codex_cli',
  )

  return (
    <div
      className="flex min-w-0 items-center gap-1.5"
      onClick={(event) => event.stopPropagation()}
    >
      {loading ? (
        <span
          aria-label="LLM response generating"
          className="flex h-6 shrink-0 items-center"
          role="status"
        >
          <Loader className="text-primary" size="md" variant="pulse-dot" />
        </span>
      ) : null}
      <Select
        disabled={disabled}
        onValueChange={(value) => {
          const runtime = parseAgentRuntime(value)

          if (runtime !== run.agentRuntime) {
            onChange(runtime)
          }
        }}
        value={run.agentRuntime}
      >
        <SelectTrigger className="h-6 min-w-28 max-w-40 border-0 bg-transparent px-1.5 text-xs shadow-none hover:bg-muted/70 focus:ring-0 data-[state=open]:bg-muted/70 disabled:cursor-default disabled:opacity-100">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            disabled={!openAiAvailable && run.agentRuntime !== 'patchlane'}
            value="patchlane"
          >
            Patchlane
          </SelectItem>
          <SelectItem
            disabled={!openCodeAvailable && run.agentRuntime !== 'opencode'}
            value="opencode"
          >
            OpenCode
          </SelectItem>
          <SelectItem
            disabled={!codexAvailable && run.agentRuntime !== 'codex'}
            value="codex"
          >
            Codex
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

const parseAgentRuntime = (value: string): AgentRuntime => {
  if (value === 'opencode' || value === 'codex') {
    return value
  }

  return 'patchlane'
}

const getAgentRuntimeLabel = (runtime: AgentRun['agentRuntime']) => {
  if (runtime === 'opencode') {
    return 'OpenCode'
  }

  if (runtime === 'codex') {
    return 'Codex'
  }

  return 'Patchlane'
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
