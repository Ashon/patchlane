import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
  type StickToBottomContext,
} from '@patchlane/ui/chat-container'
import {
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
} from '@patchlane/ui/prompt-input'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useResizableDefaultLayout,
} from '@patchlane/ui/resizable'
import { Loader } from '@patchlane/ui/loader'
import { ScrollButton } from '@patchlane/ui/scroll-button'
import { SystemMessage } from '@patchlane/ui/system-message'
import { cn } from '@/lib/utils'
import { AssistantActivityIndicator } from './chat-assistant-activity'
import {
  AgentWorkDetailsPanel,
  AgentWorkGroupRow,
} from './chat-agent-work-group'
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
import { AssistantGroupMeta } from './chat-message-actions'
import { UserMessageBubble } from './chat-user-message'

export type { ChatConversationProps, ConversationMessage }

const agentWorkPanelIds = ['conversation', 'agent-work-details']

export const ChatConversation = ({
  compactAgentWork = false,
  contentClassName,
  emptyState,
  error,
  header,
  inputActions,
  inputDisabled,
  inputFooter,
  inputLoading,
  inputPlaceholder,
  inputTextareaDisabled = inputDisabled,
  inputValue,
  messages,
  onInputChange,
  onInputSubmit,
  onRewindMessage,
  preserveEmptyMessages = false,
  showAssistantAvatar = true,
  showInputLoadingIndicator = true,
  showInlineActivity = true,
  showMessageMeta = false,
  showStreamingPlaceholder = true,
  wideMessages = false,
}: ChatConversationProps) => {
  const [reasoningOpen, setReasoningOpen] = useState<Record<string, boolean>>(
    {},
  )
  const [selectedWorkGroupId, setSelectedWorkGroupId] = useState<string | null>(
    null,
  )
  const [toolOpen, setToolOpen] = useState<Record<string, boolean>>({})
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)
  const agentWorkLayout = useResizableDefaultLayout({
    id: 'patchlane-agent-work-details-layout',
    panelIds: agentWorkPanelIds,
  })
  const groups = useMemo(() => groupMessages(messages), [messages])
  const renderItems = useMemo(
    () =>
      createConversationRenderItems(
        groups,
        showStreamingPlaceholder,
        preserveEmptyMessages,
        compactAgentWork,
      ),
    [compactAgentWork, groups, preserveEmptyMessages, showStreamingPlaceholder],
  )
  const selectedWorkGroup = useMemo(
    () =>
      renderItems.find(
        (item) => item.role === 'agent-work' && item.id === selectedWorkGroupId,
      ),
    [renderItems, selectedWorkGroupId],
  )
  const selectedWorkGroupMessages =
    selectedWorkGroup?.role === 'agent-work'
      ? selectedWorkGroup.messages
      : undefined
  const showAgentWorkDetailsPanel =
    compactAgentWork && Boolean(selectedWorkGroupMessages)
  const hasInlineActivity = useMemo(
    () => messages.some((message) => message.status === 'streaming'),
    [messages],
  )

  useEffect(() => {
    if (selectedWorkGroupId && !selectedWorkGroup) {
      setSelectedWorkGroupId(null)
    }
  }, [selectedWorkGroup, selectedWorkGroupId])

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

  const setToolVisibility = (message: ConversationMessage, open: boolean) => {
    setToolOpen((current) => ({
      ...current,
      [message.id]: open,
    }))
  }

  return (
    <section className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background">
      {header}

      {error ? (
        <SystemMessage className="mx-3 mt-3" fill variant="error">
          {error}
        </SystemMessage>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showAgentWorkDetailsPanel ? (
          <ResizablePanelGroup
            className="min-w-0 flex-1"
            defaultLayout={agentWorkLayout.defaultLayout}
            direction="horizontal"
            id="patchlane-agent-work-details-layout"
            onLayoutChanged={agentWorkLayout.onLayoutChanged}
          >
            <ResizablePanel
              className="min-w-0 overflow-hidden"
              defaultSize="70%"
              id="conversation"
              minSize="360px"
            >
              <ChatConversationViewport
                contentClassName={contentClassName}
                emptyState={emptyState}
                hasMessages={messages.length > 0}
                hasInlineActivity={hasInlineActivity}
                inputLoading={inputLoading}
                onRewindMessage={onRewindMessage}
                preserveEmptyMessages={preserveEmptyMessages}
                reasoningOpen={reasoningOpen}
                renderItems={renderItems}
                selectedWorkGroupId={selectedWorkGroupId}
                setSelectedWorkGroupId={setSelectedWorkGroupId}
                setStickToBottomContext={setStickToBottomContext}
                setToolVisibility={setToolVisibility}
                setReasoningVisibility={setReasoningVisibility}
                showAssistantAvatar={showAssistantAvatar}
                showInlineActivity={showInlineActivity}
                showMessageMeta={showMessageMeta}
                showStreamingPlaceholder={showStreamingPlaceholder}
                toolOpen={toolOpen}
                virtualizer={virtualizer}
                wideMessages={wideMessages}
              />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel
              className="min-w-0 overflow-hidden"
              defaultSize="30%"
              id="agent-work-details"
              maxSize="640px"
              minSize="280px"
            >
              <AgentWorkDetailsPanel
                messages={selectedWorkGroupMessages!}
                onClose={() => setSelectedWorkGroupId(null)}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <ChatConversationViewport
            contentClassName={contentClassName}
            emptyState={emptyState}
            hasMessages={messages.length > 0}
            hasInlineActivity={hasInlineActivity}
            inputLoading={inputLoading}
            onRewindMessage={onRewindMessage}
            preserveEmptyMessages={preserveEmptyMessages}
            reasoningOpen={reasoningOpen}
            renderItems={renderItems}
            selectedWorkGroupId={selectedWorkGroupId}
            setSelectedWorkGroupId={setSelectedWorkGroupId}
            setStickToBottomContext={setStickToBottomContext}
            setToolVisibility={setToolVisibility}
            setReasoningVisibility={setReasoningVisibility}
            showAssistantAvatar={showAssistantAvatar}
            showInlineActivity={showInlineActivity}
            showMessageMeta={showMessageMeta}
            showStreamingPlaceholder={showStreamingPlaceholder}
            toolOpen={toolOpen}
            virtualizer={virtualizer}
            wideMessages={wideMessages}
          />
        )}
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
          <PromptInputTextarea
            disabled={inputTextareaDisabled}
            placeholder={inputPlaceholder}
          />
          <div className="flex min-h-8 items-center justify-between gap-2 px-2 pb-1">
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              {showInputLoadingIndicator && inputLoading ? (
                <Loader
                  className="text-primary"
                  size="md"
                  variant="pulse-dot"
                />
              ) : null}
              {typeof inputFooter === 'string' ? (
                <span className="truncate">{inputFooter}</span>
              ) : (
                inputFooter
              )}
            </div>
            <PromptInputActions>{inputActions}</PromptInputActions>
          </div>
        </PromptInput>
      </div>
    </section>
  )
}

const ChatConversationViewport = ({
  contentClassName,
  emptyState,
  hasMessages,
  hasInlineActivity,
  inputLoading,
  onRewindMessage,
  preserveEmptyMessages,
  reasoningOpen,
  renderItems,
  selectedWorkGroupId,
  setSelectedWorkGroupId,
  setStickToBottomContext,
  setToolVisibility,
  setReasoningVisibility,
  showAssistantAvatar,
  showInlineActivity,
  showMessageMeta,
  showStreamingPlaceholder,
  toolOpen,
  virtualizer,
  wideMessages,
}: {
  contentClassName?: string
  emptyState: ReactNode
  hasMessages: boolean
  hasInlineActivity: boolean
  inputLoading: boolean
  onRewindMessage?: (message: ConversationMessage) => void
  preserveEmptyMessages: boolean
  reasoningOpen: Record<string, boolean>
  renderItems: ReturnType<typeof createConversationRenderItems>
  selectedWorkGroupId: string | null
  setSelectedWorkGroupId: Dispatch<SetStateAction<string | null>>
  setStickToBottomContext: (context: StickToBottomContext | null) => void
  setToolVisibility: (message: ConversationMessage, open: boolean) => void
  setReasoningVisibility: (message: ConversationMessage, open: boolean) => void
  showAssistantAvatar: boolean
  showInlineActivity: boolean
  showMessageMeta: boolean
  showStreamingPlaceholder: boolean
  toolOpen: Record<string, boolean>
  virtualizer: ReturnType<typeof useVirtualizer<HTMLElement, HTMLDivElement>>
  wideMessages: boolean
}) => {
  return (
    <ChatContainerRoot
      className="relative h-full min-w-0 flex-1"
      contextRef={setStickToBottomContext}
      viewportClassName="px-3 py-2"
    >
      <ChatContainerContent className={cn('w-full', contentClassName)}>
        {hasMessages ? (
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
                  className="absolute left-0 top-0 w-full"
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
                  ) : item.role === 'agent-work' ? (
                    <div className="w-full min-w-0 space-y-1">
                      {showMessageMeta && item.metaMessage ? (
                        <AssistantGroupMeta message={item.metaMessage} />
                      ) : null}
                      <AgentWorkGroupRow
                        messages={item.messages}
                        onSelect={() =>
                          setSelectedWorkGroupId((current) =>
                            current === item.id ? null : item.id,
                          )
                        }
                        selected={selectedWorkGroupId === item.id}
                      />
                    </div>
                  ) : (
                    <AssistantMessageRow
                      message={item.message}
                      metaMessage={item.metaMessage}
                      onReasoningOpenChange={setReasoningVisibility}
                      onRewind={onRewindMessage}
                      onToolOpenChange={setToolVisibility}
                      preserveEmpty={preserveEmptyMessages}
                      reasoningOpen={reasoningOpen[item.message.id]}
                      rewindDisabled={inputLoading}
                      showAvatar={showAssistantAvatar}
                      showMeta={showMessageMeta}
                      showStreamingPlaceholder={showStreamingPlaceholder}
                      toolOpen={toolOpen[item.message.id]}
                      wide={wideMessages}
                    />
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          emptyState
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
  )
}
