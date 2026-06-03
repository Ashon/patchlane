import { useCallback } from 'react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  StickToBottom,
  type StickToBottomContext,
  useStickToBottomContext,
} from 'use-stick-to-bottom'

export type ChatContainerRootProps = {
  children: React.ReactNode
  className?: string
  contextRef?: React.Ref<StickToBottomContext>
} & Omit<
  React.ComponentPropsWithoutRef<typeof ScrollArea>,
  'children' | 'viewportRef'
>

export type ChatContainerContentProps = {
  children: React.ReactNode
  className?: string
} & React.HTMLAttributes<HTMLDivElement>

export type ChatContainerScrollAnchorProps = {
  className?: string
  ref?: React.RefObject<HTMLDivElement>
} & React.HTMLAttributes<HTMLDivElement>

function ChatContainerRoot({
  children,
  className,
  contextRef,
  role = 'log',
  viewportClassName,
  ...props
}: ChatContainerRootProps) {
  return (
    <StickToBottom
      contextRef={contextRef}
      resize="smooth"
      initial="instant"
      className="contents"
    >
      {(context) => (
        <ScrollArea
          className={cn('flex', className)}
          viewportClassName={viewportClassName}
          viewportRef={context.scrollRef}
          {...props}
          role={role}
        >
          {children}
        </ScrollArea>
      )}
    </StickToBottom>
  )
}

function ChatContainerContent({
  children,
  className,
  ...props
}: ChatContainerContentProps) {
  const context = useStickToBottomContext()
  const setContentRef = useCallback(
    (node: HTMLDivElement | null) => {
      context.contentRef(node)
    },
    [context],
  )

  return (
    <div
      ref={setContentRef}
      className={cn('flex w-full min-w-0 flex-col', className)}
      {...props}
    >
      {children}
    </div>
  )
}

function ChatContainerScrollAnchor({
  className,
  ...props
}: ChatContainerScrollAnchorProps) {
  return (
    <div
      className={cn('h-px w-full shrink-0 scroll-mt-4', className)}
      aria-hidden="true"
      {...props}
    />
  )
}

export { ChatContainerRoot, ChatContainerContent, ChatContainerScrollAnchor }
