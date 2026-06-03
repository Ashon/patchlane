import { useCallback, useMemo, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
} from '@/components/ui/chat-container'
import {
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
} from '@/components/ui/prompt-input'
import { Loader } from '@/components/ui/loader'
import { ScrollButton } from '@/components/ui/scroll-button'
import { SystemMessage } from '@/components/ui/system-message'
import { cn } from '@/lib/utils'
import type { StickToBottomContext } from 'use-stick-to-bottom'
import { AssistantActivityIndicator } from './chat-assistant-activity'
import { AssistantMessageRow } from './chat-assistant-message'
import {
  createConversationRenderItems,
  getEstimatedRenderItemSize,
  groupMessages,
} from './chat-conversation-items'
import type {
  ChatConversationProps,
  ConversationMessage,
} from './chat-conversation-types'
import { UserMessageBubble } from './chat-user-message'

export type { ChatConversationProps, ConversationMessage }

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

