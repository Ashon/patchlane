import type { ReactNode } from 'react'
import { MessageActions } from '@/components/ui/message'
import { cn } from '@/lib/utils'

export const getAssistantBlockWidthClass = (wide: boolean) =>
  wide ? 'w-full max-w-full' : 'w-fit max-w-[min(920px,calc(100%_-_10rem))]'

export const getReasoningFrameClass = (wide: boolean) =>
  wide
    ? 'w-full max-w-full min-w-0 overflow-hidden'
    : 'w-fit max-w-full min-w-0 overflow-hidden'

export const getReasoningContentFrameClass = (
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

export const getInsetOverlayClass = (side: 'left' | 'right') =>
  side === 'right'
    ? 'bottom-1 left-auto right-1 pl-0'
    : 'bottom-1 right-auto left-1 flex-row pr-0'

export const MessageBlockFrame = ({
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

