import type { AgentRunMessageMetadata } from '@patchlane/shared'
import { useState } from 'react'
import { Brain, CheckCircle2, Wrench, X, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Markdown } from '@/components/ui/markdown'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AgentWorkDisclosurePanel,
  AgentWorkDisclosureTrigger,
  AgentWorkPulseIndicator,
} from '@/components/ui/agent-work-disclosure'
import { ToolPayloadView } from '@/components/ui/tool-payload'
import { cn } from '@/lib/utils'
import { formatCompactNumber, formatDurationMs } from './chat-message-format'
import type { ConversationMessage } from './chat-conversation-types'
import { toToolPart } from './chat-tool-part'

type AgentWorkGroupSummary = {
  durationMs: number
  failed: number
  reasoning: number
  running: boolean
  steps: number
  tools: number
  tokens: number
}

export const AgentWorkGroupRow = ({
  messages,
  onSelect,
  selected,
}: {
  messages: ConversationMessage[]
  onSelect: () => void
  selected?: boolean
}) => {
  const summary = getAgentWorkGroupSummary(messages)
  const statusLabel = summary.failed
    ? `${summary.failed} failed`
    : summary.running
      ? 'running'
      : 'completed'

  return (
    <AgentWorkDisclosureTrigger
      className={cn(selected && 'bg-primary/5 text-foreground')}
      compact
      icon={
        <AgentWorkGroupStateIcon
          failed={summary.failed}
          running={summary.running}
        />
      }
      label="Agent work:"
      onClick={onSelect}
      open={selected}
      preview={getAgentWorkSummaryPreview(summary)}
      status={statusLabel}
      statusClassName={getAgentWorkStatusClassName(summary)}
      type="button"
    />
  )
}

export const AgentWorkDetailsPanel = ({
  messages,
  onClose,
}: {
  messages: ConversationMessage[]
  onClose: () => void
}) => {
  const summary = getAgentWorkGroupSummary(messages)
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({})

  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-card">
      <div className="flex h-11 min-w-0 shrink-0 items-center gap-2 border-b px-3">
        <AgentWorkGroupStateIcon
          failed={summary.failed}
          running={summary.running}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">Agent work</div>
          <div className="truncate text-xs text-muted-foreground">
            {summary.steps} steps · {summary.reasoning} reasoning ·{' '}
            {summary.tools} tools
          </div>
        </div>
        <Button
          aria-label="Close agent work details"
          onClick={onClose}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <X />
        </Button>
      </div>

      <div className="grid min-w-0 grid-cols-3 border-b text-xs">
        <MetricTile label="Tokens" value={formatMetricToken(summary.tokens)} />
        <MetricTile
          label="Duration"
          value={
            summary.durationMs ? formatDurationMs(summary.durationMs) : '-'
          }
        />
        <MetricTile
          label="Failed"
          value={summary.failed ? summary.failed.toLocaleString() : '0'}
        />
      </div>

      <ScrollArea
        className="min-h-0 min-w-0 flex-1 overflow-hidden"
        viewportClassName="min-w-0 max-w-full overflow-x-hidden p-3 [&>div]:!block [&>div]:max-w-full [&>div]:min-w-0"
      >
        <div className="min-w-0 max-w-full space-y-1 overflow-hidden">
          {messages.map((message, index) => (
            <AgentWorkDetailAction
              index={index}
              key={message.id}
              message={message}
              onOpenChange={(open) =>
                setOpenItems((current) => ({
                  ...current,
                  [message.id]: open,
                }))
              }
              open={openItems[message.id] ?? false}
            />
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}

const AgentWorkDetailAction = ({
  index,
  message,
  onOpenChange,
  open,
}: {
  index: number
  message: ConversationMessage
  onOpenChange: (open: boolean) => void
  open: boolean
}) => {
  const isTool = message.role === 'tool'
  const toolPart = isTool ? toToolPart(message) : undefined
  const error = toolPart?.state === 'output-error'
  const running = message.status === 'streaming'
  const title = isTool ? (message.toolName ?? 'tool') : 'Reasoning'
  const metricLabel = getMessageMetricLabel(message.metadata)

  return (
    <Collapsible
      className="min-w-0 max-w-full overflow-hidden"
      onOpenChange={onOpenChange}
      open={open}
    >
      <CollapsibleTrigger asChild>
        <AgentWorkDisclosureTrigger
          compact
          icon={
            <AgentWorkItemIcon
              error={error}
              isTool={isTool}
              running={running}
            />
          }
          label={`${title}:`}
          open={open}
          preview={getAgentWorkItemPreview(message, toolPart)}
          status={metricLabel}
          type="button"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="min-w-0 max-w-full overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <AgentWorkDisclosurePanel
          className="mb-2 ml-5 max-w-[calc(100%-1.25rem)] overflow-hidden"
          compact
        >
          <div className="mb-1 text-[11px] font-medium text-muted-foreground">
            Step {index + 1}
          </div>
          {isTool && toolPart ? (
            <ToolPayloadView compact showCallId={false} toolPart={toolPart} />
          ) : (
            <Markdown className="prose prose-sm min-w-0 max-w-full overflow-hidden break-words dark:prose-invert [overflow-wrap:anywhere] prose-p:my-1 prose-pre:my-1.5 prose-ol:my-1 prose-ul:my-1 prose-li:my-0 [&_*]:max-w-full">
              {message.reasoning || message.content || 'No reasoning recorded.'}
            </Markdown>
          )}
        </AgentWorkDisclosurePanel>
      </CollapsibleContent>
    </Collapsible>
  )
}

const AgentWorkGroupStateIcon = ({
  failed,
  running,
}: {
  failed: number
  running: boolean
}) => {
  if (failed) {
    return <XCircle className="h-4 w-4 shrink-0 text-destructive" />
  }

  if (running) {
    return <AgentWorkPulseIndicator />
  }

  return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
}

const AgentWorkItemIcon = ({
  error,
  isTool,
  running,
}: {
  error: boolean
  isTool: boolean
  running: boolean
}) => {
  if (running) {
    return <AgentWorkPulseIndicator />
  }

  if (error) {
    return <XCircle className="h-4 w-4 shrink-0 text-destructive" />
  }

  if (isTool) {
    return <Wrench className="h-4 w-4 shrink-0 text-foreground/70" />
  }

  return <Brain className="h-4 w-4 shrink-0 text-foreground/70" />
}

const MetricTile = ({ label, value }: { label: string; value: string }) => {
  return (
    <div className="min-w-0 border-r px-3 py-2 last:border-r-0">
      <div className="truncate text-[10px] font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="truncate text-sm font-semibold">{value}</div>
    </div>
  )
}

const getAgentWorkSummaryPreview = (summary: AgentWorkGroupSummary) => {
  return [
    `${summary.steps} steps`,
    summary.reasoning ? `${summary.reasoning} reasoning` : null,
    summary.tools ? `${summary.tools} tools` : null,
    summary.tokens ? `${formatCompactNumber(summary.tokens)} tok` : null,
    summary.durationMs ? formatDurationMs(summary.durationMs) : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

const getAgentWorkStatusClassName = (summary: AgentWorkGroupSummary) => {
  if (summary.failed) {
    return 'bg-destructive/10 text-destructive'
  }

  if (summary.running) {
    return 'bg-primary/10 text-primary'
  }

  return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
}

const getAgentWorkItemPreview = (
  message: ConversationMessage,
  toolPart?: ReturnType<typeof toToolPart>,
) => {
  if (!toolPart) {
    return normalizeInlinePreview(message.reasoning || message.content)
  }

  if (toolPart.state === 'input-streaming') {
    return 'Running tool call'
  }

  if (toolPart.errorText) {
    return 'error recorded'
  }

  const sections = [
    toolPart.input && Object.keys(toolPart.input).length > 0 ? 'input' : null,
    toolPart.output !== undefined && toolPart.output !== null ? 'output' : null,
  ].filter(Boolean)

  if (sections.length) {
    return `${sections.join(' · ')} recorded`
  }

  return 'No payload recorded'
}

const getAgentWorkGroupSummary = (
  messages: ConversationMessage[],
): AgentWorkGroupSummary => {
  const reasoning = messages.filter((message) => message.role !== 'tool').length
  const tools = messages.filter((message) => message.role === 'tool').length
  const failed = messages.filter(isFailedWorkMessage).length
  const running = messages.some((message) => message.status === 'streaming')
  const durationMs = messages.reduce(
    (sum, message) => sum + (message.metadata?.durationMs ?? 0),
    0,
  )
  const tokens = messages.reduce(
    (sum, message) => sum + getEstimatedMetadataTokens(message.metadata),
    0,
  )
  return {
    durationMs,
    failed,
    reasoning,
    running,
    steps: messages.length,
    tools,
    tokens,
  }
}

const isFailedWorkMessage = (message: ConversationMessage) => {
  if (message.status === 'error' || message.toolError) {
    return true
  }

  if (message.role !== 'tool') {
    return false
  }

  return toToolPart(message).state === 'output-error'
}

const getEstimatedMetadataTokens = (metadata?: AgentRunMessageMetadata) => {
  if (!metadata) {
    return 0
  }

  const usageTotal =
    metadata.usage?.totalTokens ??
    (metadata.usage?.inputTokens ?? 0) + (metadata.usage?.outputTokens ?? 0)

  if (usageTotal) {
    return usageTotal
  }

  return (
    (metadata.content?.estimatedTokens ?? 0) +
    (metadata.reasoning?.estimatedTokens ?? 0) +
    (metadata.tool?.input?.estimatedTokens ?? 0) +
    (metadata.tool?.output?.estimatedTokens ?? 0)
  )
}

const getMessageMetricLabel = (metadata?: AgentRunMessageMetadata) => {
  if (!metadata) {
    return ''
  }

  const parts = [
    metadata.durationMs !== undefined
      ? formatDurationMs(metadata.durationMs)
      : null,
    getEstimatedMetadataTokens(metadata)
      ? `${formatCompactNumber(getEstimatedMetadataTokens(metadata))} tok`
      : null,
  ].filter(Boolean)

  return parts.join(' · ')
}

const formatMetricToken = (tokens: number) => {
  return tokens ? `${formatCompactNumber(tokens)} tok` : '-'
}

const normalizeInlinePreview = (value: string) => {
  return value.replace(/\s+/g, ' ').trim()
}
