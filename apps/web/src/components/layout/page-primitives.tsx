import type { ComponentProps, ReactNode } from 'react'
import { Slot } from 'radix-ui'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

export const Page = ({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) => {
  return (
    <section
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden bg-background',
        className,
      )}
    >
      {children}
    </section>
  )
}

export const PageSplit = ({
  children,
  className,
  variant = 'inspector',
}: {
  children: ReactNode
  className?: string
  variant?: 'inspector' | 'wide-list'
}) => {
  return (
    <section
      className={cn(
        'grid h-full min-h-0 overflow-y-auto bg-background',
        variant === 'inspector' &&
          'lg:grid-cols-[minmax(0,1fr)_360px] lg:overflow-hidden',
        variant === 'wide-list' &&
          'xl:grid-cols-[minmax(340px,360px)_minmax(0,1fr)] xl:overflow-hidden',
        className,
      )}
    >
      {children}
    </section>
  )
}

export const PagePane = ({
  children,
  className,
  minHeight = 'default',
}: {
  children: ReactNode
  className?: string
  minHeight?: 'default' | 'compact' | 'detail'
}) => {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col',
        minHeight === 'default' && 'min-h-[320px] lg:min-h-0',
        minHeight === 'compact' && 'min-h-[260px] xl:min-h-0',
        minHeight === 'detail' && 'min-h-[560px] xl:min-h-0',
        className,
      )}
    >
      {children}
    </div>
  )
}

export const PageHeader = ({
  actions,
  children,
  className,
  description,
  icon,
  leading,
  title,
}: {
  actions?: ReactNode
  children?: ReactNode
  className?: string
  description?: ReactNode
  icon?: ReactNode
  leading?: ReactNode
  title: ReactNode
}) => {
  return (
    <header
      className={cn(
        'flex min-h-12 flex-col gap-2 border-b bg-[var(--surface-page-header)] px-2 py-1.5 md:flex-row md:items-center md:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {leading}
        <div className="min-w-0">
          <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            {icon}
            <span className="min-w-0 truncate">{title}</span>
          </h2>
          {description ? (
            <p className="truncate text-[11px] leading-3 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
          {actions}
        </div>
      ) : null}
      {children}
    </header>
  )
}

export const PageToolbar = ({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) => {
  return (
    <div
      className={cn(
        'border-b bg-[var(--surface-page-toolbar)] px-2 py-1.5',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  )
}

export const PageActionBar = ({
  actions,
  children,
  className,
}: {
  actions?: ReactNode
  children: ReactNode
  className?: string
}) => {
  return (
    <div
      className={cn(
        'flex min-h-10 flex-col gap-2 border-b bg-[var(--surface-page-toolbar)] px-2 py-2 md:flex-row md:items-center md:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {children}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      ) : null}
    </div>
  )
}

export const PageScroll = ({
  children,
  className,
  viewportClassName,
}: {
  children: ReactNode
  className?: string
  viewportClassName?: string
}) => {
  return (
    <ScrollArea className={cn('min-h-0 flex-1', className)} viewportClassName={viewportClassName}>
      {children}
    </ScrollArea>
  )
}

export const PageAside = ({
  children,
  className,
  viewportClassName = 'p-3',
}: {
  children: ReactNode
  className?: string
  viewportClassName?: string
}) => {
  return (
    <ScrollArea
      className={cn(
        'min-h-0 border-t bg-muted/20 lg:border-l lg:border-t-0',
        className,
      )}
      viewportClassName={viewportClassName}
    >
      {children}
    </ScrollArea>
  )
}

export const PageSection = ({
  children,
  className,
  title,
}: {
  children: ReactNode
  className?: string
  title?: ReactNode
}) => {
  return (
    <section className={cn('border-b p-3 last:border-b-0', className)}>
      {title ? <h2 className="mb-2 text-sm font-semibold">{title}</h2> : null}
      {children}
    </section>
  )
}

export const PageList = ({
  children,
  className,
  ...props
}: ComponentProps<'div'>) => {
  return (
    <div className={cn('divide-y border-b bg-background', className)} {...props}>
      {children}
    </div>
  )
}

export const PageListItem = ({
  asChild = false,
  children,
  className,
  interactive = true,
  selected = false,
  ...props
}: ComponentProps<'div'> & {
  asChild?: boolean
  interactive?: boolean
  selected?: boolean
}) => {
  const Comp = asChild ? Slot.Root : 'div'

  return (
    <Comp
      className={cn(
        'grid w-full min-w-0 gap-2 border-l-2 border-l-transparent p-2',
        interactive && 'transition-colors hover:bg-muted/45',
        selected && 'border-l-primary bg-primary/5',
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  )
}

export const PageListSkeleton = ({
  count = 3,
  className,
  itemClassName,
}: {
  count?: number
  className?: string
  itemClassName?: string
}) => {
  return (
    <PageList className={className}>
      {Array.from({ length: count }).map((_, index) => (
        <PageListItem
          className={cn('h-20 animate-pulse bg-muted/30', itemClassName)}
          interactive={false}
          key={index}
        />
      ))}
    </PageList>
  )
}

export const ErrorBanner = ({
  children,
  className,
  message,
  variant = 'bar',
}: {
  children?: ReactNode
  className?: string
  message?: ReactNode | null
  variant?: 'bar' | 'card'
}) => {
  const content = children ?? message

  if (!content) {
    return null
  }

  return (
    <div
      className={cn(
        'border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive',
        variant === 'bar' && 'border-b',
        variant === 'card' && 'rounded-md border',
        className,
      )}
    >
      {content}
    </div>
  )
}

export const LoadingCardList = ({
  count = 3,
  className,
  itemClassName,
}: {
  count?: number
  className?: string
  itemClassName?: string
}) => {
  return (
    <div className={cn('grid gap-2', className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          className={cn(
            'h-24 animate-pulse rounded-md border bg-muted/40',
            itemClassName,
          )}
          key={index}
        />
      ))}
    </div>
  )
}
