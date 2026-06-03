import { cn } from '@/lib/utils'
import { ChevronDownIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { TextShimmer } from './text-shimmer'

export type AgentWorkDisclosureTriggerProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> & {
  compact?: boolean
  icon: ReactNode
  label: ReactNode
  labelClassName?: string
  open?: boolean
  preview?: ReactNode
  status?: ReactNode
  statusClassName?: string
  streaming?: boolean
  title?: ReactNode
  titleClassName?: string
}

export const AgentWorkDisclosureTrigger = ({
  className,
  compact = true,
  icon,
  label,
  labelClassName,
  open = false,
  preview,
  status,
  statusClassName,
  streaming = false,
  title,
  titleClassName,
  type = 'button',
  ...props
}: AgentWorkDisclosureTriggerProps) => {
  const hasPreview =
    typeof preview === 'string' ? Boolean(preview.trim()) : Boolean(preview)

  return (
    <button
      aria-expanded={open}
      className={cn(
        'flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-sm text-left leading-none text-muted-foreground transition-colors hover:text-foreground',
        compact ? 'h-6 text-xs' : 'h-8 text-sm',
        className,
      )}
      type={type}
      {...props}
    >
      {icon}
      <AgentWorkInlineText
        className={cn('shrink-0 text-foreground', labelClassName)}
        shimmer={!hasPreview && streaming}
      >
        {label}
      </AgentWorkInlineText>
      {title ? (
        <AgentWorkInlineText
          className={cn('shrink font-medium text-foreground', titleClassName)}
        >
          {title}
        </AgentWorkInlineText>
      ) : null}
      {status ? (
        <span
          className={cn(
            'shrink-0 rounded-full px-1.5 py-0 text-[11px] font-medium leading-4',
            statusClassName,
          )}
        >
          {status}
        </span>
      ) : null}
      {hasPreview ? (
        <AgentWorkInlineText
          className="flex-1 text-left text-muted-foreground"
          shimmer={streaming}
        >
          {preview}
        </AgentWorkInlineText>
      ) : (
        <span className="min-w-0 flex-1" />
      )}
      <span
        className={cn(
          'grid h-4 w-4 shrink-0 place-items-center transition-transform',
          open && 'rotate-180',
        )}
      >
        <ChevronDownIcon className="h-3.5 w-3.5" />
      </span>
    </button>
  )
}

const AgentWorkInlineText = ({
  children,
  className,
  shimmer = false,
}: {
  children: ReactNode
  className?: string
  shimmer?: boolean
}) => {
  const textClassName = cn(
    'block h-4 min-w-0 truncate align-middle leading-4',
    className,
  )

  if (shimmer && typeof children === 'string') {
    return (
      <TextShimmer className={textClassName} duration={3} spread={24}>
        {children}
      </TextShimmer>
    )
  }

  return <span className={textClassName}>{children}</span>
}

export const AgentWorkPulseIndicator = ({
  className,
  compact = true,
  label = 'Running',
}: {
  className?: string
  compact?: boolean
  label?: string
}) => {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center text-foreground',
        compact ? 'h-4 w-4' : 'h-5 w-5',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'animate-[pulse-dot_1.2s_ease-in-out_infinite] rounded-full bg-current',
          compact ? 'h-1.5 w-1.5' : 'h-2 w-2',
        )}
      />
      <span className="sr-only">{label}</span>
    </span>
  )
}

export const AgentWorkPendingIndicator = ({
  className,
  compact = true,
}: {
  className?: string
  compact?: boolean
}) => {
  return (
    <div
      className={cn(
        'flex min-w-0 cursor-default items-center gap-1.5 leading-none text-muted-foreground',
        compact ? 'h-6 text-xs' : 'h-8 text-sm',
        className,
      )}
    >
      <AgentWorkPulseIndicator compact={compact} label="Thinking" />
    </div>
  )
}

export const AgentWorkDisclosurePanel = ({
  children,
  className,
  compact = true,
}: {
  children: ReactNode
  className?: string
  compact?: boolean
}) => {
  return (
    <div
      className={cn(
        'mt-1.5 min-w-0 rounded-md border bg-muted/20',
        compact ? 'space-y-2 p-2 text-xs' : 'space-y-2.5 p-3 text-sm',
        className,
      )}
    >
      {children}
    </div>
  )
}

export const AgentWorkDisclosureSection = ({
  children,
  title,
  tone = 'default',
}: {
  children: ReactNode
  title: string
  tone?: 'default' | 'error'
}) => {
  return (
    <section className="min-w-0">
      <h4
        className={cn(
          'mb-1 text-xs font-medium',
          tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {title}
      </h4>
      {children}
    </section>
  )
}
