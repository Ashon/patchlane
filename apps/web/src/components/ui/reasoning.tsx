'use client'

import { cn } from '@/lib/utils'
import { ChevronDownIcon } from 'lucide-react'
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Markdown } from './markdown'
import { TextShimmer } from './text-shimmer'

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
  streaming?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>

function ReasoningTrigger({
  children,
  className,
  onClick,
  streaming = false,
  type = 'button',
  ...props
}: ReasoningTriggerProps) {
  const { isOpen, onOpenChange } = useReasoningContext()
  const label =
    streaming && typeof children === 'string' ? (
      <TextShimmer duration={3} spread={24}>
        {children}
      </TextShimmer>
    ) : (
      children
    )

  return (
    <button
      aria-expanded={isOpen}
      className={cn(
        'inline-flex h-6 min-w-0 cursor-pointer items-center gap-1.5 rounded-sm text-xs leading-none text-muted-foreground transition-colors hover:text-foreground',
        className,
      )}
      onClick={(event) => {
        onClick?.(event)

        if (!event.defaultPrevented) {
          onOpenChange(!isOpen)
        }
      }}
      type={type}
      {...props}
    >
      <span className="inline-flex min-w-0 items-center truncate text-primary">
        {label}
      </span>
      <div
        className={cn(
          'grid size-4 shrink-0 place-items-center transition-transform',
          isOpen ? 'rotate-180' : '',
        )}
      >
        <ChevronDownIcon className="size-3.5" />
      </div>
    </button>
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
  const contentRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const { isOpen } = useReasoningContext()
  const useNaturalHeight = streaming && isOpen

  useEffect(() => {
    if (!contentRef.current || !innerRef.current) return

    if (useNaturalHeight) {
      contentRef.current.style.maxHeight = ''
      return
    }

    const observer = new ResizeObserver(() => {
      if (contentRef.current && innerRef.current && isOpen) {
        contentRef.current.style.maxHeight = `${innerRef.current.scrollHeight}px`
      }
    })

    observer.observe(innerRef.current)

    if (isOpen) {
      contentRef.current.style.maxHeight = `${innerRef.current.scrollHeight}px`
    }

    return () => observer.disconnect()
  }, [isOpen, useNaturalHeight])

  const content = markdown ? (
    <Markdown>{children as string}</Markdown>
  ) : (
    children
  )

  return (
    <div
      ref={contentRef}
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
              maxHeight: isOpen ? contentRef.current?.scrollHeight : '0px',
            }
      }
      {...props}
    >
      <div
        ref={innerRef}
        className={cn(
          'text-muted-foreground prose prose-sm dark:prose-invert',
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
