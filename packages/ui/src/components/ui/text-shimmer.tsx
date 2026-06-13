'use client'

import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

export type TextShimmerProps = {
  as?: string
  baseColor?: string
  children: ReactNode
  duration?: number
  highlightColor?: string
  multiline?: boolean
  spread?: number
} & HTMLAttributes<HTMLElement>

export function TextShimmer({
  as = 'span',
  baseColor = 'var(--muted-foreground)',
  children,
  className,
  duration = 4,
  highlightColor = 'var(--foreground)',
  multiline = false,
  spread = 20,
  style,
  ...props
}: TextShimmerProps) {
  const dynamicSpread = Math.min(Math.max(spread, 5), 45)
  const Component = as as ElementType
  const textClassName = multiline
    ? 'block whitespace-pre-wrap break-words leading-[inherit]'
    : 'whitespace-nowrap leading-[inherit]'

  return (
    <Component
      className={cn(
        'relative inline-block whitespace-nowrap align-baseline leading-none',
        multiline && 'block whitespace-pre-wrap leading-[inherit]',
        className,
      )}
      style={style}
      {...props}
    >
      <span aria-hidden="true" className={cn('invisible', textClassName)}>
        {children}
      </span>
      <span
        className={cn(
          'pointer-events-none absolute inset-0 block animate-shimmer bg-[length:200%_auto] bg-clip-text text-transparent motion-reduce:animate-none',
          textClassName,
        )}
        style={{
          backgroundImage: `linear-gradient(to right, ${baseColor} ${50 - dynamicSpread}%, ${highlightColor} 50%, ${baseColor} ${50 + dynamicSpread}%)`,
          animationDuration: `${duration}s`,
        }}
      >
        {children}
      </span>
    </Component>
  )
}
