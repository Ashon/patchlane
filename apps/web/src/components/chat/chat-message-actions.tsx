import { useState } from 'react'
import { Bot, Check, Copy, MessageSquare, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MessageAction } from '@/components/ui/message'
import type { ConversationMessage } from './chat-conversation-types'
import { overlayActionButtonClass } from './chat-message-action-button'
import { formatDateTime } from './chat-message-format'

export const AssistantGroupMeta = ({
  message,
}: {
  message: ConversationMessage
}) => {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Bot className="h-3.5 w-3.5" />
      <span>{message.role === 'system' ? 'system' : 'assistant'}</span>
      {message.createdAt ? (
        <span>{formatDateTime(message.createdAt)}</span>
      ) : null}
    </div>
  )
}

export const MessageMeta = ({ message }: { message: ConversationMessage }) => {
  return (
    <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
      <MessageSquare className="h-3.5 w-3.5" />
      <span>{message.role}</span>
      {message.createdAt ? (
        <span>{formatDateTime(message.createdAt)}</span>
      ) : null}
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

