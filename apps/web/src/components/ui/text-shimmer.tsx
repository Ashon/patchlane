'use client'

import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type TextShimmerProps = {
  as?: string
  children: ReactNode
  duration?: number
  spread?: number
} & HTMLAttributes<HTMLElement>

export function TextShimmer({
  as = 'span',
  children,
  className,
  duration = 4,
  spread = 20,
  style,
  ...props
}: TextShimmerProps) {
  const dynamicSpread = Math.min(Math.max(spread, 5), 45)
  const Component = as as ElementType

  return (
    <Component
      className={cn(
        'relative inline-block whitespace-nowrap align-baseline leading-none',
        className,
      )}
      style={style}
      {...props}
    >
      <span aria-hidden="true" className="invisible">
        {children}
      </span>
      <span
        className="pointer-events-none absolute inset-0 block animate-shimmer whitespace-nowrap bg-[length:200%_auto] bg-clip-text text-transparent motion-reduce:animate-none"
        style={{
          backgroundImage: `linear-gradient(to right, var(--muted-foreground) ${50 - dynamicSpread}%, var(--foreground) 50%, var(--muted-foreground) ${50 + dynamicSpread}%)`,
          animationDuration: `${duration}s`,
        }}
      >
        {children}
      </span>
    </Component>
  )
}
