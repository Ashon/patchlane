import { useState } from 'react'
import type { ReactNode } from 'react'
import { Bot, Check, Copy, MessageSquare, RotateCcw } from 'lucide-react'
import { Badge } from '@patchlane/ui/badge'
import { Button } from '@patchlane/ui/button'
import { MessageAction } from '@patchlane/ui/message'
import type { ConversationMessage } from './chat-conversation-types'
import { overlayActionButtonClass } from './chat-message-action-button'
import {
  formatDateTime,
  formatRelativeDateTime,
} from './chat-message-format'

export const AssistantGroupMeta = ({
  message,
}: {
  message: ConversationMessage
}) => {
  return (
    <MessageMetaDivider
      icon={<Bot className="h-3.5 w-3.5" />}
      label={message.role === 'system' ? 'system' : 'assistant'}
      timestamp={message.createdAt}
    />
  )
}

export const MessageMeta = ({ message }: { message: ConversationMessage }) => {
  return (
    <MessageMetaDivider
      icon={<MessageSquare className="h-3.5 w-3.5" />}
      label={message.role}
      timestamp={message.createdAt}
    />
  )
}

const MessageMetaDivider = ({
  icon,
  label,
  timestamp,
}: {
  icon: ReactNode
  label: string
  timestamp?: string
}) => {
  return (
    <div className="flex w-full min-w-0 items-center gap-2 text-xs text-muted-foreground">
      <div className="flex shrink-0 items-center gap-1.5">
        {icon}
        <span>{label}</span>
        {timestamp ? (
          <span title={formatDateTime(timestamp)}>
            {formatRelativeDateTime(timestamp)}
          </span>
        ) : null}
      </div>
      <div className="h-px min-w-0 flex-1 bg-border/70" />
    </div>
  )
}

export const MessageStatusActions = ({
  allowCopy = true,
  message,
  onRewind,
  rewindDisabled,
}: {
  allowCopy?: boolean
  message: ConversationMessage
  onRewind?: (message: ConversationMessage) => void
  rewindDisabled?: boolean
}) => {
  const content = message.content
  const hasContent = Boolean(content)
  const isTool = message.role === 'tool'
  const isAssistantLike =
    message.role === 'assistant' || message.role === 'system'
  const isReasoningOnly =
    isAssistantLike && Boolean(message.reasoning) && !hasContent

  if (isTool || isReasoningOnly || message.status === 'streaming') {
    return null
  }

  const hasStatus = message.status === 'error' || message.status === 'stopped'
  const canCopy = allowCopy && hasContent
  const canRewind = message.role === 'user' && Boolean(onRewind)

  if (!canCopy && !canRewind && !hasStatus) {
    return null
  }

  return (
    <>
      {message.status === 'error' ? (
        <Badge variant="destructive">error</Badge>
      ) : null}
      {message.status === 'stopped' ? (
        <Badge
          className="border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
          variant="outline"
        >
          stopped
        </Badge>
      ) : null}
      {canRewind ? (
        <RewindAction
          disabled={rewindDisabled}
          onClick={() => onRewind?.(message)}
        />
      ) : null}
      {canCopy ? <CopyAction value={content} /> : null}
    </>
  )
}

const RewindAction = ({
  disabled,
  onClick,
}: {
  disabled?: boolean
  onClick: () => void
}) => {
  return (
    <MessageAction tooltip="Rewind to here">
      <Button
        aria-label="Rewind to this message"
        className={overlayActionButtonClass}
        disabled={disabled}
        onClick={onClick}
        size="xs"
        type="button"
        variant="ghost"
      >
        <RotateCcw />
        <span>Rewind</span>
      </Button>
    </MessageAction>
  )
}

const CopyAction = ({ value }: { value: string }) => {
  const { copied, copy } = useCopyState()

  return (
    <MessageAction tooltip={copied ? 'Copied' : 'Copy message'}>
      <Button
        aria-label={copied ? 'Copied' : 'Copy message'}
        className={overlayActionButtonClass}
        onClick={() => void copy(value)}
        size="xs"
        type="button"
        variant="ghost"
      >
        {copied ? <Check /> : <Copy />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </Button>
    </MessageAction>
  )
}

const useCopyState = () => {
  const [copied, setCopied] = useState(false)

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return { copied, copy }
}
