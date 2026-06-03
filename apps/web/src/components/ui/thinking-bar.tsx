'use client'

import { ChevronRight } from 'lucide-react'
import { AgentWorkPulseIndicator } from '@/components/ui/agent-work-disclosure'
import { TextShimmer } from '@/components/ui/text-shimmer'
import { cn } from '@/lib/utils'

type ThinkingBarProps = {
  className?: string
  onClick?: () => void
  onStop?: () => void
  showText?: boolean
  stopLabel?: string
  text?: string
}

export function ThinkingBar({
  className,
  onClick,
  onStop,
  showText = true,
  stopLabel = 'Answer now',
  text = 'Thinking',
}: ThinkingBarProps) {
  const content = (
    <>
      <AgentWorkPulseIndicator className="text-muted-foreground" />
      {showText ? (
        <TextShimmer className="min-w-[4.5rem] font-medium leading-5">
          {text}
        </TextShimmer>
      ) : null}
    </>
  )

  return (
    <div
      className={cn(
        'flex min-h-5 w-full items-center justify-between',
        className,
      )}
    >
      {onClick ? (
        <button
          className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-80"
          onClick={onClick}
          type="button"
        >
          {content}
          <ChevronRight className="size-4 text-muted-foreground" />
        </button>
      ) : (
        <div className="flex cursor-default items-center gap-1.5 text-sm">
          {content}
        </div>
      )}
      {onStop ? (
        <button
          className="border-b border-dotted border-muted-foreground/50 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          onClick={onStop}
          type="button"
        >
          {stopLabel}
        </button>
      ) : null}
    </div>
  )
}
