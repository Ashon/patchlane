import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { CheckCircle, Settings, XCircle } from 'lucide-react'
import { useState } from 'react'
import {
  AgentWorkDisclosurePanel,
  AgentWorkDisclosureSection,
  AgentWorkDisclosureTrigger,
  AgentWorkPulseIndicator,
} from './agent-work-disclosure'

export type ToolPart = {
  type: string
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available'
    | 'output-error'
  input?: Record<string, unknown>
  output?: unknown
  toolCallId?: string
  errorText?: string
}

export type ToolProps = {
  toolPart: ToolPart
  defaultOpen?: boolean
  className?: string
  onOpenChange?: (open: boolean) => void
  open?: boolean
  size?: 'default' | 'compact'
}

const Tool = ({
  toolPart,
  defaultOpen = false,
  className,
  onOpenChange,
  open,
  size = 'default',
}: ToolProps) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  const isCompact = size === 'compact'
  const preview = getToolPreview(toolPart)
  const handleOpenChange = (nextOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(nextOpen)
    }

    onOpenChange?.(nextOpen)
  }

  return (
    <div
      className={cn(
        'min-w-0',
        isCompact ? 'mt-0.5 w-full max-w-full' : 'mt-2 w-full',
        className,
      )}
    >
      <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
        <CollapsibleTrigger asChild>
          <AgentWorkDisclosureTrigger
            aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${getToolStateLabel(toolPart.state)} tool call ${toolPart.type}`}
            compact={isCompact}
            icon={<ToolStateIcon state={toolPart.state} compact={isCompact} />}
            label={`${toolPart.type}:`}
            open={isOpen}
            preview={preview}
            type="button"
          />
        </CollapsibleTrigger>

        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <AgentWorkDisclosurePanel compact={isCompact}>
            {toolPart.input && Object.keys(toolPart.input).length > 0 ? (
              <AgentWorkDisclosureSection title="Input">
                <div className="grid gap-1">
                  {Object.entries(toolPart.input).map(([key, value]) => (
                    <div className="min-w-0 break-words" key={key}>
                      <span className="text-muted-foreground">{key}:</span>{' '}
                      <span className="font-mono">{formatValue(value)}</span>
                    </div>
                  ))}
                </div>
              </AgentWorkDisclosureSection>
            ) : null}

            {toolPart.output !== undefined && toolPart.output !== null ? (
              <AgentWorkDisclosureSection title="Output">
                <pre
                  className={cn(
                    'max-h-56 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-background p-2 font-mono leading-5',
                    isCompact && 'max-h-44 p-1.5 text-xs leading-4',
                  )}
                >
                  {formatValue(toolPart.output)}
                </pre>
              </AgentWorkDisclosureSection>
            ) : null}

            {toolPart.state === 'output-error' && toolPart.errorText ? (
              <AgentWorkDisclosureSection title="Error" tone="error">
                <div
                  className={cn(
                    'min-w-0 break-words rounded-md border border-destructive/25 bg-destructive/10 p-2 text-destructive',
                    isCompact && 'p-1.5 text-xs',
                  )}
                >
                  {toolPart.errorText}
                </div>
              </AgentWorkDisclosureSection>
            ) : null}

            {toolPart.state === 'input-streaming' ? (
              <div className="text-muted-foreground">Processing tool call...</div>
            ) : null}

            {toolPart.toolCallId ? (
              <div className="text-[11px] text-muted-foreground">
                <span className="font-mono">Call ID: {toolPart.toolCallId}</span>
              </div>
            ) : null}
          </AgentWorkDisclosurePanel>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

const ToolStateIcon = ({
  compact,
  state,
}: {
  compact: boolean
  state: ToolPart['state']
}) => {
  const slotClassName = compact ? 'h-4 w-4' : 'h-5 w-5'
  const iconClassName = compact ? 'h-3.5 w-3.5' : 'h-4 w-4'

  if (state === 'input-streaming') {
    return <AgentWorkPulseIndicator compact={compact} label="Running" />
  }

  if (state === 'output-available') {
    return (
      <span
        className={cn(
          'grid shrink-0 place-items-center text-emerald-500',
          slotClassName,
        )}
      >
        <CheckCircle className={iconClassName} />
        <span className="sr-only">Completed</span>
      </span>
    )
  }

  if (state === 'output-error') {
    return (
      <span
        className={cn(
          'grid shrink-0 place-items-center text-destructive',
          slotClassName,
        )}
      >
        <XCircle className={iconClassName} />
        <span className="sr-only">Error</span>
      </span>
    )
  }

  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center text-muted-foreground',
        slotClassName,
      )}
    >
      <Settings className={iconClassName} />
      <span className="sr-only">Ready</span>
    </span>
  )
}

const getToolStateLabel = (state: ToolPart['state']) => {
  if (state === 'input-streaming') {
    return 'running'
  }

  if (state === 'output-available') {
    return 'completed'
  }

  if (state === 'output-error') {
    return 'failed'
  }

  return 'ready'
}

const getToolPreview = (toolPart: ToolPart) => {
  if (toolPart.errorText) {
    return normalizePreview(toolPart.errorText)
  }

  if (toolPart.output !== undefined && toolPart.output !== null) {
    return normalizePreview(formatValue(toolPart.output))
  }

  if (toolPart.input && Object.keys(toolPart.input).length > 0) {
    return normalizePreview(formatInputPreview(toolPart.input))
  }

  if (toolPart.state === 'input-streaming') {
    return 'Processing tool call...'
  }

  return ''
}

const formatInputPreview = (input: Record<string, unknown>) => {
  return Object.entries(input)
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join(' · ')
}

const normalizePreview = (value: string) => value.replace(/\s+/g, ' ').trim()

const formatValue = (value: unknown): string => {
  if (value === null) {
    return 'null'
  }

  if (value === undefined) {
    return 'undefined'
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }

  return String(value)
}

export { Tool }
