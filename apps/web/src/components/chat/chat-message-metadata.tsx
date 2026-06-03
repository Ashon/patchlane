import type { AgentRunMessageMetadata } from '@patchlane/shared'
import { Button } from '@/components/ui/button'
import { MessageAction } from '@/components/ui/message'
import { overlayActionButtonClass } from './chat-message-action-button'
import { formatCompactNumber, formatDurationMs } from './chat-message-format'

type MetadataItem = {
  label: string
  title?: string
}

type TokenUsage = NonNullable<AgentRunMessageMetadata['usage']>

export const getMetadataAccessory = (metadata?: AgentRunMessageMetadata) => {
  const items = getMessageMetadataItems(metadata)

  if (!items.length) {
    return null
  }

  return <MetadataChip items={items} label={getMetadataActionLabel(metadata)} />
}

const MetadataChip = ({
  items,
  label,
}: {
  items: MetadataItem[]
  label: string
}) => {
  return (
    <MessageAction
      className="max-w-[360px]"
      tooltip={<MetadataTooltip items={items} />}
    >
      <Button
        aria-label="Show message metadata"
        className={overlayActionButtonClass}
        size="xs"
        type="button"
        variant="ghost"
      >
        <span>{label}</span>
      </Button>
    </MessageAction>
  )
}

const MetadataTooltip = ({ items }: { items: MetadataItem[] }) => {
  return (
    <div className="grid gap-1.5">
      <div className="font-semibold">Event metadata</div>
      <div className="grid gap-1">
        {items.map((item) => (
          <div className="leading-4" key={item.label}>
            <div className="font-semibold">{item.label}</div>
            {item.title ? (
              <div className="whitespace-pre-line">{item.title}</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

const getMessageMetadataItems = (metadata?: AgentRunMessageMetadata) => {
  if (!metadata) {
    return []
  }

  const items: MetadataItem[] = []

  if (metadata.durationMs !== undefined) {
    items.push({
      label: `duration ${formatDurationMs(metadata.durationMs)}`,
      title: `duration: ${metadata.durationMs.toLocaleString()} ms`,
    })
  }

  if (metadata.context) {
    const usage = Math.min(
      100,
      Math.round(
        (metadata.context.estimatedTokens / metadata.context.tokenBudget) * 100,
      ),
    )

    items.push({
      label: `ctx ${usage}% · ${formatCompactNumber(metadata.context.estimatedTokens)}/${formatCompactNumber(metadata.context.tokenBudget)} tok`,
      title: [
        `strategy: ${metadata.context.strategy}`,
        `estimated tokens: ${metadata.context.estimatedTokens.toLocaleString()}`,
        `budget: ${metadata.context.tokenBudget.toLocaleString()}`,
      ].join('\n'),
    })

    if (metadata.context.promptMessages !== undefined) {
      items.push({
        label: `prompt ${metadata.context.promptMessages.toLocaleString()} msgs`,
      })
    }

    if (metadata.context.summarizedMessages > 0) {
      items.push({
        label: `compact ${metadata.context.summarizedMessages.toLocaleString()} · keep ${metadata.context.retainedMessages.toLocaleString()}`,
      })
    }
  }

  if (metadata.request?.attempt || metadata.request?.iteration) {
    const attempt = metadata.request.attempt
      ? `a${metadata.request.attempt}`
      : null
    const iteration = metadata.request.iteration
      ? `i${metadata.request.iteration}`
      : null

    items.push({
      label: [attempt, iteration].filter(Boolean).join(' · '),
      title: [
        metadata.request.model ? `model: ${metadata.request.model}` : null,
        metadata.request.maxOutputTokens
          ? `max output tokens: ${metadata.request.maxOutputTokens.toLocaleString()}`
          : null,
      ]
        .filter(Boolean)
        .join('\n'),
    })
  }

  const usage = getRenderableUsage(metadata.usage)

  if (usage) {
    items.push({
      label: getUsageItemLabel(usage),
      title: getUsageItemTitle(usage),
    })
  }

  if (metadata.content) {
    items.push({
      label: `content est ${formatCompactNumber(metadata.content.estimatedTokens)} tok · ${formatCompactNumber(metadata.content.characters)} ch`,
      title: `content characters: ${metadata.content.characters.toLocaleString()}`,
    })
  }

  if (metadata.reasoning) {
    items.push({
      label: `reason est ${formatCompactNumber(metadata.reasoning.estimatedTokens)} tok · ${formatCompactNumber(metadata.reasoning.characters)} ch`,
      title: `reasoning characters: ${metadata.reasoning.characters.toLocaleString()}`,
    })
  }

  if (metadata.tool?.input) {
    items.push({
      label: `tool in est ${formatCompactNumber(metadata.tool.input.estimatedTokens)} tok`,
      title: `tool input characters: ${metadata.tool.input.characters.toLocaleString()}`,
    })
  }

  if (metadata.tool?.output) {
    items.push({
      label: `tool out est ${formatCompactNumber(metadata.tool.output.estimatedTokens)} tok · ${formatCompactNumber(metadata.tool.output.characters)} ch`,
      title: `tool output characters: ${metadata.tool.output.characters.toLocaleString()}`,
    })
  }

  return items
}

const getMetadataActionLabel = (metadata?: AgentRunMessageMetadata) => {
  const durationLabel =
    metadata?.durationMs !== undefined
      ? formatDurationMs(metadata.durationMs)
      : null
  const tokenLabel = getEventTokenLabel(metadata)

  if (durationLabel && tokenLabel) {
    return `${durationLabel} · ${tokenLabel}`
  }

  if (durationLabel) {
    return durationLabel
  }

  if (tokenLabel) {
    return tokenLabel
  }

  if (metadata?.context) {
    const usage = Math.min(
      100,
      Math.round(
        (metadata.context.estimatedTokens / metadata.context.tokenBudget) * 100,
      ),
    )

    return `ctx ${usage}%`
  }

  return 'Meta'
}

const getEventTokenLabel = (metadata?: AgentRunMessageMetadata) => {
  if (!metadata) {
    return null
  }

  const usage = getRenderableUsage(metadata.usage)

  if (usage) {
    return getUsageActionLabel(usage)
  }

  const contentTokens = metadata.content?.estimatedTokens
  const reasoningTokens = metadata.reasoning?.estimatedTokens

  if (contentTokens !== undefined || reasoningTokens !== undefined) {
    return `est ${formatCompactNumber((contentTokens ?? 0) + (reasoningTokens ?? 0))} tok`
  }

  const toolInputTokens = metadata.tool?.input?.estimatedTokens
  const toolOutputTokens = metadata.tool?.output?.estimatedTokens

  if (toolInputTokens !== undefined && toolOutputTokens !== undefined) {
    return `est ${formatCompactNumber(toolInputTokens + toolOutputTokens)} tok`
  }

  if (toolOutputTokens !== undefined) {
    return `est ${formatCompactNumber(toolOutputTokens)} tok`
  }

  if (toolInputTokens !== undefined) {
    return `est ${formatCompactNumber(toolInputTokens)} tok`
  }

  return null
}

const getUsageItemLabel = (usage: TokenUsage) => {
  const input = usage.inputTokens
  const output = usage.outputTokens

  if (input !== undefined && output !== undefined) {
    return `usage in ${formatCompactNumber(input)} · out ${formatCompactNumber(output)} tok`
  }

  return `usage ${formatCompactNumber(getUsageTotal(usage) ?? 0)} tok`
}

const getUsageItemTitle = (usage: TokenUsage) => {
  return [
    usage.inputTokens !== undefined
      ? `input tokens: ${usage.inputTokens.toLocaleString()}`
      : null,
    usage.outputTokens !== undefined
      ? `output tokens: ${usage.outputTokens.toLocaleString()}`
      : null,
    usage.totalTokens !== undefined
      ? `total tokens: ${usage.totalTokens.toLocaleString()}`
      : null,
    usage.reasoningTokens !== undefined
      ? `reasoning tokens: ${usage.reasoningTokens.toLocaleString()}`
      : null,
    usage.cachedInputTokens !== undefined
      ? `cached input tokens: ${usage.cachedInputTokens.toLocaleString()}`
      : null,
  ]
    .filter(Boolean)
    .join('\n')
}

const getUsageActionLabel = (usage: TokenUsage) => {
  const input = usage.inputTokens
  const output = usage.outputTokens

  if (input !== undefined && output !== undefined) {
    return `in ${formatCompactNumber(input)} · out ${formatCompactNumber(output)} tok`
  }

  const total = getUsageTotal(usage)

  return total !== undefined ? `${formatCompactNumber(total)} tok` : null
}

const getUsageTotal = (usage: TokenUsage) => {
  if (usage.totalTokens !== undefined) {
    return usage.totalTokens
  }

  if (usage.inputTokens !== undefined || usage.outputTokens !== undefined) {
    return (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)
  }

  return usage.reasoningTokens
}

const getRenderableUsage = (usage?: TokenUsage) => {
  return usage && Object.values(usage).some((count) => count !== undefined)
    ? usage
    : undefined
}
