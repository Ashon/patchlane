'use client'

import { cn } from '../../lib/utils'
import { Brain } from 'lucide-react'
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  AgentWorkDisclosureTrigger,
  AgentWorkPulseIndicator,
} from './agent-work-disclosure'
import { Markdown } from './markdown'

type ReasoningContextType = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

const ReasoningContext = createContext<ReasoningContextType | undefined>(
  undefined,
)

function useReasoningContext() {
  const context = useContext(ReasoningContext)
  if (!context) {
    throw new Error(
      'useReasoningContext must be used within a Reasoning provider',
    )
  }
  return context
}

export type ReasoningProps = {
  children: React.ReactNode
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}
function Reasoning({
  children,
  className,
  open,
  onOpenChange,
}: ReasoningProps) {
  const [internalOpen, setInternalOpen] = useState(false)

  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen

  const handleOpenChange = (newOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(newOpen)
    }
    onOpenChange?.(newOpen)
  }

  return (
    <ReasoningContext.Provider
      value={{
        isOpen,
        onOpenChange: handleOpenChange,
      }}
    >
      <div className={cn('min-w-0', className)}>{children}</div>
    </ReasoningContext.Provider>
  )
}

export type ReasoningTriggerProps = {
  children: React.ReactNode
  className?: string
  preview?: React.ReactNode
  streaming?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>

function ReasoningTrigger({
  children,
  className,
  onClick,
  preview,
  streaming = false,
  type = 'button',
  ...props
}: ReasoningTriggerProps) {
  const { isOpen, onOpenChange } = useReasoningContext()

  return (
    <AgentWorkDisclosureTrigger
      className={className}
      icon={<ReasoningStateIcon streaming={streaming} />}
      label={children}
      onClick={(event) => {
        onClick?.(event)

        if (!event.defaultPrevented) {
          onOpenChange(!isOpen)
        }
      }}
      open={isOpen}
      preview={preview}
      streaming={streaming}
      type={type}
      {...props}
    />
  )
}

const ReasoningStateIcon = ({ streaming }: { streaming: boolean }) => {
  if (streaming) {
    return <AgentWorkPulseIndicator label="Thinking" />
  }

  return (
    <span className="grid h-4 w-4 shrink-0 place-items-center text-foreground/75">
      <Brain className="h-3.5 w-3.5" />
    </span>
  )
}

export type ReasoningContentProps = {
  children: React.ReactNode
  className?: string
  markdown?: boolean
  contentClassName?: string
  streaming?: boolean
} & React.HTMLAttributes<HTMLDivElement>

function ReasoningContent({
  children,
  className,
  contentClassName,
  markdown = false,
  streaming = false,
  ...props
}: ReasoningContentProps) {
  const innerRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)
  const { isOpen } = useReasoningContext()
  const useNaturalHeight = streaming && isOpen

  useEffect(() => {
    if (!innerRef.current || useNaturalHeight) return

    const content = innerRef.current
    let frame = 0

    const updateHeight = () => {
      frame = 0
      setContentHeight(content.scrollHeight)
    }

    const scheduleHeightUpdate = () => {
      if (frame) {
        cancelAnimationFrame(frame)
      }

      frame = requestAnimationFrame(updateHeight)
    }

    const observer = new ResizeObserver(scheduleHeightUpdate)
    observer.observe(content)
    scheduleHeightUpdate()

    return () => {
      if (frame) {
        cancelAnimationFrame(frame)
      }

      observer.disconnect()
    }
  }, [useNaturalHeight])

  const content = markdown ? (
    <Markdown>{children as string}</Markdown>
  ) : (
    children
  )

  return (
    <div
      className={cn(
        useNaturalHeight
          ? 'overflow-visible'
          : 'overflow-hidden transition-[max-height] duration-150 ease-out',
        className,
      )}
      style={
        useNaturalHeight
          ? undefined
          : {
              maxHeight: isOpen ? `${contentHeight}px` : '0px',
            }
      }
      {...props}
    >
      <div
        ref={innerRef}
        className={cn(
          'text-muted-foreground/80 prose prose-sm dark:prose-invert',
          'min-w-0 max-w-full break-words',
          'prose-headings:text-current prose-p:text-current prose-strong:text-current prose-a:text-current prose-blockquote:text-current',
          'prose-ol:text-current prose-ul:text-current prose-li:text-current prose-code:text-current prose-th:text-current prose-td:text-current',
          contentClassName,
        )}
      >
        {content}
      </div>
    </div>
  )
}

export { Reasoning, ReasoningTrigger, ReasoningContent }
