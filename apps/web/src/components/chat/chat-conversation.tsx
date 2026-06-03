import { type ReactNode, useCallback, useMemo, useState } from 'react'
import type { AgentRunMessageMetadata } from '@agent-fleet/shared'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Bot, Check, Copy, MessageSquare, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
} from '@/components/ui/chat-container'
import {
  Message,
  MessageAction,
  MessageActions,
  MessageAvatar,
  MessageContent,
} from '@/components/ui/message'
import {
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
} from '@/components/ui/prompt-input'
import { Loader } from '@/components/ui/loader'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ui/reasoning'
import { ScrollButton } from '@/components/ui/scroll-button'
import { SystemMessage } from '@/components/ui/system-message'
import { ThinkingBar } from '@/components/ui/thinking-bar'
import { Tool, type ToolPart } from '@/components/ui/tool'
import { cn } from '@/lib/utils'
import type { StickToBottomContext } from 'use-stick-to-bottom'

export type ConversationMessage = {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  reasoning?: string
  status?: 'streaming' | 'done' | 'error' | 'stopped'
  finishReason?: string
  createdAt?: string
  toolName?: string
  toolCallId?: string
  toolInput?: Record<string, unknown>
  toolOutput?: unknown
  toolError?: string
  metadata?: AgentRunMessageMetadata
}

type ConversationMessageGroup = {
  id: string
  role: 'user' | 'assistant'
  messages: ConversationMessage[]
}

type ConversationRenderItem =
  | {
      id: string
      role: 'user'
      message: ConversationMessage
    }
  | {
      id: string
      role: 'assistant'
      message: ConversationMessage
      metaMessage?: ConversationMessage
    }

type ChatConversationProps = {
  contentClassName?: string
  emptyState: ReactNode
  error?: string | null
  header?: ReactNode
  inputActions: ReactNode
  inputDisabled?: boolean
  inputFooter: ReactNode
  inputLoading: boolean
  inputPlaceholder: string
  inputValue: string
  messages: ConversationMessage[]
  onInputChange: (value: string) => void
  onInputSubmit: () => void
  onRewindMessage?: (message: ConversationMessage) => void
  preserveEmptyMessages?: boolean
  showAssistantAvatar?: boolean
  showInlineActivity?: boolean
  showMessageMeta?: boolean
  showStreamingPlaceholder?: boolean
  wideMessages?: boolean
}

export const ChatConversation = ({
  contentClassName,
  emptyState,
  error,
  header,
  inputActions,
  inputDisabled,
  inputFooter,
  inputLoading,
  inputPlaceholder,
  inputValue,
  messages,
  onInputChange,
  onInputSubmit,
  onRewindMessage,
  preserveEmptyMessages = false,
  showAssistantAvatar = true,
  showInlineActivity = true,
  showMessageMeta = false,
  showStreamingPlaceholder = true,
  wideMessages = false,
}: ChatConversationProps) => {
  const [reasoningOpen, setReasoningOpen] = useState<Record<string, boolean>>(
    {},
  )
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)
  const groups = useMemo(() => groupMessages(messages), [messages])
  const renderItems = useMemo(
    () =>
      createConversationRenderItems(
        groups,
        showStreamingPlaceholder,
        preserveEmptyMessages,
      ),
    [groups, preserveEmptyMessages, showStreamingPlaceholder],
  )
  const hasInlineActivity = useMemo(
    () => messages.some((message) => message.status === 'streaming'),
    [messages],
  )

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual owns scroll measurement state internally.
  const virtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
    count: renderItems.length,
    estimateSize: (index) => getEstimatedRenderItemSize(renderItems[index]),
    getItemKey: (index) => renderItems[index]?.id ?? index,
    getScrollElement: () => scrollElement,
    overscan: 8,
  })

  const setStickToBottomContext = useCallback(
    (context: StickToBottomContext | null) => {
      const element = context?.scrollRef.current ?? null
      setScrollElement((current) => (current === element ? current : element))
    },
    [],
  )

  const setReasoningVisibility = (
    message: ConversationMessage,
    open: boolean,
  ) => {
    setReasoningOpen((current) => ({
      ...current,
      [message.id]: open,
    }))
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {header}

      {error ? (
        <SystemMessage className="mx-3 mt-3" fill variant="error">
          {error}
        </SystemMessage>
      ) : null}

      <div className="min-h-0 flex-1">
        <ChatContainerRoot
          className="relative h-full"
          contextRef={setStickToBottomContext}
          viewportClassName="px-3 py-2"
        >
          <ChatContainerContent className={cn('w-full', contentClassName)}>
            {messages.length === 0 ? (
              emptyState
            ) : (
              <div
                className="relative w-full shrink-0"
                style={{ height: virtualizer.getTotalSize() }}
              >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const item = renderItems[virtualItem.index]

                  if (!item) {
                    return null
                  }

                  return (
                    <div
                      className="absolute left-0 top-0 w-full pb-2"
                      data-index={virtualItem.index}
                      key={virtualItem.key}
                      ref={virtualizer.measureElement}
                      style={{
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      {item.role === 'user' ? (
                        <UserMessageBubble
                          message={item.message}
                          onRewind={onRewindMessage}
                          rewindDisabled={inputLoading}
                          showMeta={showMessageMeta}
                          wide={wideMessages}
                        />
                      ) : (
                        <AssistantMessageRow
                          message={item.message}
                          metaMessage={item.metaMessage}
                          onReasoningOpenChange={setReasoningVisibility}
                          onRewind={onRewindMessage}
                          preserveEmpty={preserveEmptyMessages}
                          reasoningOpen={reasoningOpen[item.message.id]}
                          rewindDisabled={inputLoading}
                          showAvatar={showAssistantAvatar}
                          showMeta={showMessageMeta}
                          showStreamingPlaceholder={showStreamingPlaceholder}
                          wide={wideMessages}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {showInlineActivity && inputLoading && !hasInlineActivity ? (
              <AssistantActivityIndicator
                showAvatar={showAssistantAvatar}
                wide={wideMessages}
              />
            ) : null}
            <ChatContainerScrollAnchor />
          </ChatContainerContent>
          <div className="absolute bottom-4 right-4">
            <ScrollButton className="shadow-md" />
          </div>
        </ChatContainerRoot>
      </div>

      <div className="border-t bg-card p-2">
        <PromptInput
          className="rounded-md"
          disabled={inputDisabled}
          isLoading={inputLoading}
          onSubmit={onInputSubmit}
          onValueChange={onInputChange}
          value={inputValue}
        >
          <PromptInputTextarea placeholder={inputPlaceholder} />
          <div className="flex min-h-8 items-center justify-between gap-2 px-2 pb-1">
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              {inputLoading ? (
                <Loader
                  className="text-primary"
                  size="md"
                  variant="pulse-dot"
                />
              ) : null}
              <span className="truncate">{inputFooter}</span>
            </div>
            <PromptInputActions>{inputActions}</PromptInputActions>
          </div>
        </PromptInput>
      </div>
    </section>
  )
}

const AssistantActivityIndicator = ({
  showAvatar,
  wide,
}: {
  showAvatar: boolean
  wide: boolean
}) => {
  return (
    <Message className={cn('group w-full min-w-0', wide ? 'gap-0' : 'gap-2')}>
      {showAvatar ? (
        <MessageAvatar
          alt="Assistant"
          className="h-7 w-7"
          fallback="AI"
          src=""
        />
      ) : null}
      <div className="flex h-7 min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <Loader className="text-primary" size="md" variant="pulse-dot" />
        <span>Working</span>
      </div>
    </Message>
  )
}

const groupMessages = (messages: ConversationMessage[]) => {
  return messages.reduce<ConversationMessageGroup[]>((groups, message) => {
    if (message.role === 'user') {
      groups.push({ id: message.id, role: 'user', messages: [message] })
      return groups
    }

    const previous = groups[groups.length - 1]

    if (previous?.role === 'assistant') {
      previous.messages.push(message)
      return groups
    }

    groups.push({ id: message.id, role: 'assistant', messages: [message] })
    return groups
  }, [])
}

const createConversationRenderItems = (
  groups: ConversationMessageGroup[],
  showStreamingPlaceholder: boolean,
  preserveEmptyMessages: boolean,
) => {
  return groups.flatMap<ConversationRenderItem>((group) => {
    if (group.role === 'user') {
      const message = group.messages[0]
      return message ? [{ id: group.id, role: 'user', message }] : []
    }

    const visibleMessages = preserveEmptyMessages
      ? group.messages
      : group.messages.filter((message) =>
          shouldRenderAssistantPart(message, showStreamingPlaceholder),
        )
    const metaMessage =
      group.messages.find(
        (message) => message.role === 'assistant' || message.role === 'system',
      ) ?? visibleMessages[0]

    return visibleMessages.map((message, index) => ({
      id: message.id,
      role: 'assistant',
      message,
      metaMessage: index === 0 ? metaMessage : undefined,
    }))
  })
}

const shouldRenderAssistantPart = (
  message: ConversationMessage,
  showStreamingPlaceholder: boolean,
) => {
  const isTool = message.role === 'tool'
  const isSystem = message.role === 'system'
  const isAssistant = message.role === 'assistant' || isSystem
  const content = message.content
  const reasoning = message.reasoning ?? ''
  const showThinkingPlaceholder =
    showStreamingPlaceholder &&
    isAssistant &&
    message.status === 'streaming' &&
    !content &&
    !reasoning

  return (
    (isAssistant && Boolean(reasoning)) ||
    showThinkingPlaceholder ||
    isTool ||
    Boolean(content)
  )
}

const getEstimatedRenderItemSize = (item?: ConversationRenderItem) => {
  if (!item) {
    return 80
  }

  if (item.role === 'user') {
    return item.message.content.length > 320 ? 120 : 72
  }

  if (item.message.role === 'tool') {
    return 48
  }

  if (item.message.reasoning && item.message.content) {
    return 120
  }

  if (item.message.reasoning) {
    return 72
  }

  return item.message.content.length > 480 ? 140 : 80
}

const getAssistantBlockWidthClass = (wide: boolean) =>
  wide ? 'w-full max-w-full' : 'w-fit max-w-[min(920px,calc(100%_-_10rem))]'

const getReasoningFrameClass = (wide: boolean) =>
  wide
    ? 'w-full max-w-full min-w-0 overflow-hidden'
    : 'w-fit max-w-full min-w-0 overflow-hidden'

const getReasoningContentFrameClass = (
  isReasoningOpen: boolean,
  wide: boolean,
) => {
  if (!isReasoningOpen) {
    return 'm-0 h-0 w-0 border-0 p-0'
  }

  return wide
    ? 'mt-0.5 max-w-full'
    : 'ml-1 mt-0.5 max-w-full border-l pl-2'
}

const getInsetOverlayClass = (side: 'left' | 'right') =>
  side === 'right'
    ? 'bottom-1 left-auto right-1 pl-0'
    : 'bottom-1 right-auto left-1 flex-row pr-0'

const MessageBlockFrame = ({
  accessory,
  children,
  className,
  overlay,
  overlayClassName,
  overlaySide = 'right',
}: {
  accessory?: ReactNode
  children: ReactNode
  className?: string
  overlay?: ReactNode
  overlayClassName?: string
  overlaySide?: 'left' | 'right'
}) => {
  return (
    <div className={cn('group/block relative min-w-0 max-w-full', className)}>
      {children}
      {accessory || overlay ? (
        <MessageBlockSideRail className={overlayClassName} side={overlaySide}>
          {accessory ? (
            <div className="pointer-events-auto shrink-0">{accessory}</div>
          ) : null}
          {overlay ? (
            <MessageActions className="pointer-events-none gap-1 opacity-0 transition-opacity group-hover/block:pointer-events-auto group-hover/block:opacity-100">
              {overlay}
            </MessageActions>
          ) : null}
        </MessageBlockSideRail>
      ) : null}
    </div>
  )
}

const MessageBlockSideRail = ({
  children,
  className,
  side,
}: {
  children: ReactNode
  className?: string
  side: 'left' | 'right'
}) => {
  return (
    <MessageActions
      className={cn(
        'pointer-events-none absolute bottom-0 z-20 gap-1 whitespace-nowrap text-foreground',
        side === 'right'
          ? 'left-full pl-1'
          : 'right-full flex-row-reverse pr-1',
        className,
      )}
    >
      {children}
    </MessageActions>
  )
}

const UserMessageBubble = ({
  message,
  onRewind,
  rewindDisabled,
  showMeta,
  wide,
}: {
  message: ConversationMessage
  onRewind?: (message: ConversationMessage) => void
  rewindDisabled?: boolean
  showMeta: boolean
  wide: boolean
}) => {
  const content = message.content
  const metadataAccessory = getMetadataAccessory(message.metadata)

  return (
    <Message className="group w-full min-w-0 justify-end">
      <div
        className={cn(
          'group/message flex w-full min-w-0 flex-col items-end space-y-1',
          !wide && 'max-w-[920px]',
        )}
      >
        {showMeta ? <MessageMeta message={message} /> : null}
        {content ? (
          <MessageBlockFrame
            accessory={metadataAccessory}
            className={
              wide ? 'w-fit max-w-full' : 'w-fit max-w-[calc(100%_-_10rem)]'
            }
            overlayClassName={wide ? getInsetOverlayClass('left') : undefined}
            overlay={
              <MessageStatusActions
                message={message}
                onRewind={onRewind}
                rewindDisabled={rewindDisabled}
              />
            }
            overlaySide="left"
          >
            <MessageContent
              className="max-w-full overflow-hidden rounded-lg bg-primary px-2.5 py-1.5 text-sm leading-5 text-primary-foreground prose-p:my-0 prose-pre:my-1.5 prose-ol:my-1 prose-ul:my-1 prose-li:my-0 prose-blockquote:my-1.5 prose-table:my-1.5 [&_*]:max-w-full [&_pre]:overflow-x-auto"
              id={message.id}
              markdown
            >
              {content}
            </MessageContent>
          </MessageBlockFrame>
        ) : null}
      </div>
    </Message>
  )
}

const AssistantMessageRow = ({
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

const getMessageMetadataItems = (metadata?: AgentRunMessageMetadata) => {
  if (!metadata) {
    return []
  }

  const items: Array<{ label: string; title?: string }> = []

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

const formatCompactNumber = (value: number) => {
  if (value >= 1_000_000) {
    return `${trimTrailingZero((value / 1_000_000).toFixed(1))}m`
  }

  if (value >= 1_000) {
    return `${trimTrailingZero((value / 1_000).toFixed(1))}k`
  }

  return value.toLocaleString()
}

const trimTrailingZero = (value: string) => value.replace(/\.0$/u, '')

const toToolPart = (message: ConversationMessage): ToolPart => {
  const isStreaming = message.status === 'streaming'
  const isError = message.status === 'error'
  const contentOutput =
    message.content && !isStreaming && !isError ? message.content : undefined
  const output = message.toolOutput ?? contentOutput

  return {
    type: message.toolName || 'tool',
    state: isError
      ? 'output-error'
      : isStreaming
        ? 'input-streaming'
        : output
          ? 'output-available'
          : 'input-available',
    input: message.toolInput,
    output,
    toolCallId: message.toolCallId ?? message.id,
    errorText: message.toolError ?? (isError ? message.content : undefined),
  }
}

const AssistantGroupMeta = ({ message }: { message: ConversationMessage }) => {
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

const MessageMeta = ({ message }: { message: ConversationMessage }) => {
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

const MessageStatusActions = ({
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

const overlayActionButtonClass =
  'h-6 gap-1 rounded-md bg-background/80 px-2 text-[11px] text-muted-foreground shadow-none backdrop-blur hover:bg-accent hover:text-foreground [&_svg]:size-3'

const getMetadataAccessory = (metadata?: AgentRunMessageMetadata) => {
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
  items: Array<{ label: string; title?: string }>
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

const MetadataTooltip = ({
  items,
}: {
  items: Array<{ label: string; title?: string }>
}) => {
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

const formatDurationMs = (durationMs: number) => {
  if (durationMs < 1_000) {
    return `${durationMs}ms`
  }

  if (durationMs < 60_000) {
    return `${trimTrailingZero((durationMs / 1_000).toFixed(1))}s`
  }

  const minutes = Math.floor(durationMs / 60_000)
  const seconds = Math.round((durationMs % 60_000) / 1_000)

  return `${minutes}m ${seconds}s`
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

const formatDateTime = (value: string) => {
  return new Date(value).toLocaleString()
}
