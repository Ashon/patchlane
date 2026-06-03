import type { ReactNode } from 'react'
import { Message, MessageAvatar, MessageContent } from '@/components/ui/message'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ui/reasoning'
import { ThinkingBar } from '@/components/ui/thinking-bar'
import { Tool } from '@/components/ui/tool'
import { cn } from '@/lib/utils'
import type { ConversationMessage } from './chat-conversation-types'
import { AssistantGroupMeta, MessageStatusActions } from './chat-message-actions'
import {
  MessageBlockFrame,
  getAssistantBlockWidthClass,
  getInsetOverlayClass,
  getReasoningContentFrameClass,
  getReasoningFrameClass,
} from './chat-message-frame'
import { getMetadataAccessory } from './chat-message-metadata'
import { toToolPart } from './chat-tool-part'

export const AssistantMessageRow = ({
  message,
  metaMessage,
  onReasoningOpenChange,
  onRewind,
  preserveEmpty,
  reasoningOpen,
  rewindDisabled,
  showAvatar,
  showMeta,
  showStreamingPlaceholder,
  wide,
}: {
  message: ConversationMessage
  metaMessage?: ConversationMessage
  onReasoningOpenChange: (message: ConversationMessage, open: boolean) => void
  onRewind?: (message: ConversationMessage) => void
  preserveEmpty: boolean
  reasoningOpen?: boolean
  rewindDisabled?: boolean
  showAvatar: boolean
  showMeta: boolean
  showStreamingPlaceholder: boolean
  wide: boolean
}) => {
  return (
    <Message className={cn('group w-full min-w-0', wide ? 'gap-0' : 'gap-2')}>
      {showAvatar && metaMessage ? (
        <MessageAvatar
          alt="Assistant"
          className="h-7 w-7"
          fallback="AI"
          src=""
        />
      ) : showAvatar ? (
        <div aria-hidden className="h-7 w-7 shrink-0" />
      ) : null}
      <div className="w-full min-w-0 space-y-1 overflow-visible">
        {showMeta && metaMessage ? (
          <AssistantGroupMeta message={metaMessage} />
        ) : null}
        <AssistantMessagePart
          message={message}
          onReasoningOpenChange={onReasoningOpenChange}
          onRewind={onRewind}
          preserveEmpty={preserveEmpty}
          reasoningOpen={reasoningOpen}
          rewindDisabled={rewindDisabled}
          showStreamingPlaceholder={showStreamingPlaceholder}
          wide={wide}
        />
      </div>
    </Message>
  )
}

const AssistantMessagePart = ({
  message,
  onReasoningOpenChange,
  onRewind,
  preserveEmpty,
  reasoningOpen,
  rewindDisabled,
  showStreamingPlaceholder,
  wide,
}: {
  message: ConversationMessage
  onReasoningOpenChange: (message: ConversationMessage, open: boolean) => void
  onRewind?: (message: ConversationMessage) => void
  preserveEmpty: boolean
  reasoningOpen?: boolean
  rewindDisabled?: boolean
  showStreamingPlaceholder: boolean
  wide: boolean
}) => {
  const isTool = message.role === 'tool'
  const isSystem = message.role === 'system'
  const isAssistant = message.role === 'assistant' || isSystem
  const isStreaming = message.status === 'streaming'
  const content = message.content
  const reasoning = message.reasoning ?? ''
  const isReasoningOpen = reasoningOpen ?? false
  const showReasoning = isAssistant && Boolean(reasoning)
  const showThinkingPlaceholder =
    showStreamingPlaceholder &&
    isAssistant &&
    isStreaming &&
    !content &&
    !reasoning
  const showPreservedPlaceholder =
    preserveEmpty && isAssistant && isStreaming && !content && !reasoning
  const showContent = Boolean(content)
  const metadataAccessory = getMetadataAccessory(message.metadata)
  const useStableAssistantStreamBlock =
    preserveEmpty && isAssistant && message.id.startsWith('stream-')

  if (useStableAssistantStreamBlock) {
    return (
      <StableAssistantStreamBlock
        content={content}
        isReasoningOpen={isReasoningOpen}
        isStreaming={isStreaming}
        isSystem={isSystem}
        metadataAccessory={metadataAccessory}
        message={message}
        onReasoningOpenChange={onReasoningOpenChange}
        onRewind={onRewind}
        reasoning={reasoning}
        rewindDisabled={rewindDisabled}
        wide={wide}
      />
    )
  }

  if (
    !showReasoning &&
    !showThinkingPlaceholder &&
    !showPreservedPlaceholder &&
    !isTool &&
    !showContent
  ) {
    return null
  }

  return (
    <div className="group/message w-full min-w-0 space-y-0.5 overflow-visible">
      {showReasoning ? (
        <MessageBlockFrame
          accessory={metadataAccessory}
          className={getAssistantBlockWidthClass(wide)}
        >
          <Reasoning
            className={getReasoningFrameClass(wide)}
            onOpenChange={(open) => onReasoningOpenChange(message, open)}
            open={isReasoningOpen}
          >
            <ReasoningTrigger className="max-w-full" streaming={isStreaming}>
              Reasoning
            </ReasoningTrigger>
            <ReasoningContent
              className={cn(
                'min-w-0',
                getReasoningContentFrameClass(isReasoningOpen, wide),
              )}
              contentClassName={cn(
                'max-w-full overflow-hidden py-0.5 text-xs leading-5 break-words prose-p:my-0 prose-pre:my-1.5 prose-ol:my-1 prose-ul:my-1 prose-li:my-0 [&_*]:max-w-full [&_pre]:overflow-x-auto',
                !isReasoningOpen && 'w-0 p-0',
              )}
              markdown
              streaming={isStreaming}
            >
              {reasoning}
            </ReasoningContent>
          </Reasoning>
        </MessageBlockFrame>
      ) : null}

      {showThinkingPlaceholder ? (
        <MessageBlockFrame
          accessory={metadataAccessory}
          className={getAssistantBlockWidthClass(wide)}
        >
          <ThinkingBar className="h-7 w-fit max-w-full py-0 text-xs" />
        </MessageBlockFrame>
      ) : null}

      {showPreservedPlaceholder && !showThinkingPlaceholder ? (
        <MessageBlockFrame
          accessory={metadataAccessory}
          className={getAssistantBlockWidthClass(wide)}
        >
          <ThinkingBar
            className="h-7 w-fit max-w-full py-0 text-xs"
            text="Thinking"
          />
        </MessageBlockFrame>
      ) : null}

      {isTool ? (
        <MessageBlockFrame
          accessory={metadataAccessory}
          className={getAssistantBlockWidthClass(wide)}
        >
          <Tool
            className="border-muted-foreground/20 bg-muted/20 shadow-none"
            defaultOpen={false}
            size="compact"
            toolPart={toToolPart(message)}
          />
        </MessageBlockFrame>
      ) : showContent ? (
        <MessageBlockFrame
          accessory={metadataAccessory}
          className={getAssistantBlockWidthClass(wide)}
          overlayClassName={wide ? getInsetOverlayClass('right') : undefined}
          overlay={
            <MessageStatusActions
              message={message}
              onRewind={onRewind}
              rewindDisabled={rewindDisabled}
            />
          }
        >
          <MessageContent
            className={cn(
              'max-w-full overflow-hidden rounded-lg px-2.5 py-1.5 text-sm leading-5 prose-p:my-0 prose-pre:my-1.5 prose-ol:my-1 prose-ul:my-1 prose-li:my-0 prose-blockquote:my-1.5 prose-table:my-1.5 [&_*]:max-w-full [&_pre]:overflow-x-auto',
              isSystem &&
                'border-destructive/25 bg-destructive/10 text-destructive',
            )}
            id={message.id}
            markdown={isAssistant}
          >
            {content}
          </MessageContent>
        </MessageBlockFrame>
      ) : null}
    </div>
  )
}

const StableAssistantStreamBlock = ({
  content,
  isReasoningOpen,
  isStreaming,
  isSystem,
  metadataAccessory,
  message,
  onReasoningOpenChange,
  onRewind,
  reasoning,
  rewindDisabled,
  wide,
}: {
  content: string
  isReasoningOpen: boolean
  isStreaming: boolean
  isSystem: boolean
  metadataAccessory: ReactNode
  message: ConversationMessage
  onReasoningOpenChange: (message: ConversationMessage, open: boolean) => void
  onRewind?: (message: ConversationMessage) => void
  reasoning: string
  rewindDisabled?: boolean
  wide: boolean
}) => {
  const showReasoning = Boolean(reasoning)
  const showContent = Boolean(content)
  const showThinkingPlaceholder = isStreaming && !showReasoning && !showContent

  if (!showReasoning && !showThinkingPlaceholder && !showContent) {
    return null
  }

  return (
    <div className="group/message w-full min-w-0 overflow-visible">
      <MessageBlockFrame
        accessory={metadataAccessory}
        className={getAssistantBlockWidthClass(wide)}
        overlayClassName={wide ? getInsetOverlayClass('right') : undefined}
        overlay={
          showContent ? (
            <MessageStatusActions
              message={message}
              onRewind={onRewind}
              rewindDisabled={rewindDisabled}
            />
          ) : null
        }
      >
        <div
          className={cn(
            'max-w-full min-w-0 space-y-0.5 overflow-visible',
            wide ? 'w-full' : 'w-fit',
          )}
        >
          {showReasoning ? (
            <Reasoning
              className={cn(getReasoningFrameClass(wide), 'overflow-visible')}
              onOpenChange={(open) => onReasoningOpenChange(message, open)}
              open={isReasoningOpen}
            >
              <ReasoningTrigger className="max-w-full" streaming={isStreaming}>
                Reasoning
              </ReasoningTrigger>
              <ReasoningContent
                className={cn(
                  'min-w-0',
                  getReasoningContentFrameClass(isReasoningOpen, wide),
                )}
                contentClassName={cn(
                  'max-w-full overflow-hidden py-0.5 text-xs leading-5 break-words prose-p:my-0 prose-pre:my-1.5 prose-ol:my-1 prose-ul:my-1 prose-li:my-0 [&_*]:max-w-full [&_pre]:overflow-x-auto',
                  !isReasoningOpen && 'w-0 p-0',
                )}
                markdown
                streaming={isStreaming}
              >
                {reasoning}
              </ReasoningContent>
            </Reasoning>
          ) : null}

          {showThinkingPlaceholder ? (
            <ThinkingBar className="h-7 w-fit max-w-full py-0 text-xs" />
          ) : null}

          {showContent ? (
            <MessageContent
              className={cn(
                'max-w-full overflow-hidden rounded-lg px-2.5 py-1.5 text-sm leading-5 prose-p:my-0 prose-pre:my-1.5 prose-ol:my-1 prose-ul:my-1 prose-li:my-0 prose-blockquote:my-1.5 prose-table:my-1.5 [&_*]:max-w-full [&_pre]:overflow-x-auto',
                isSystem &&
                  'border-destructive/25 bg-destructive/10 text-destructive',
              )}
              id={message.id}
              markdown
            >
              {content}
            </MessageContent>
          ) : null}
        </div>
      </MessageBlockFrame>
    </div>
  )
}

