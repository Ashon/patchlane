import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'

export const Field = ({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) => {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

export const EmptyState = ({ children }: { children: ReactNode }) => {
  return (
    <div className="rounded-md border border-dashed bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

export const ToolStatusRow = ({
  icon,
  label,
  value,
}: {
  icon?: ReactNode
  label: string
  value: string
}) => {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-1.5 text-xs last:border-b-0">
      <span className="flex shrink-0 items-center gap-2 font-medium">
        {icon}
        {label}
      </span>
      <span className="min-w-0 text-right text-muted-foreground [overflow-wrap:anywhere]">
        {value}
      </span>
    </div>
  )
}

