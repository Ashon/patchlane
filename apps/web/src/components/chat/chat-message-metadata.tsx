import type { AgentRunMessageMetadata } from '@agent-fleet/shared'
import { Button } from '@/components/ui/button'
import { MessageAction } from '@/components/ui/message'
import { overlayActionButtonClass } from './chat-message-action-button'
import { formatCompactNumber, formatDurationMs } from './chat-message-format'

type MetadataItem = {
  label: string
  title?: string
}

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

  if (metadata.content) {
    items.push({
      label: `out ${formatCompactNumber(metadata.content.estimatedTokens)} tok · ${formatCompactNumber(metadata.content.characters)} ch`,
      title: `content characters: ${metadata.content.characters.toLocaleString()}`,
    })
  }

  if (metadata.tool?.input) {
    items.push({
      label: `tool in ${formatCompactNumber(metadata.tool.input.estimatedTokens)} tok`,
      title: `tool input characters: ${metadata.tool.input.characters.toLocaleString()}`,
    })
  }

  if (metadata.tool?.output) {
    items.push({
      label: `tool out ${formatCompactNumber(metadata.tool.output.estimatedTokens)} tok · ${formatCompactNumber(metadata.tool.output.characters)} ch`,
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

  const contentTokens = metadata.content?.estimatedTokens

  if (contentTokens !== undefined) {
    return `${formatCompactNumber(contentTokens)} tok`
  }

  const toolInputTokens = metadata.tool?.input?.estimatedTokens
  const toolOutputTokens = metadata.tool?.output?.estimatedTokens

  if (toolInputTokens !== undefined && toolOutputTokens !== undefined) {
    return `${formatCompactNumber(toolInputTokens + toolOutputTokens)} tok`
  }

  if (toolOutputTokens !== undefined) {
    return `${formatCompactNumber(toolOutputTokens)} tok`
  }

  if (toolInputTokens !== undefined) {
    return `${formatCompactNumber(toolInputTokens)} tok`
  }

  return null
}

