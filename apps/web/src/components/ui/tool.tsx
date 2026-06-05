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
  AgentWorkDisclosureTrigger,
  AgentWorkPulseIndicator,
} from './agent-work-disclosure'
import {
  getToolPayloadPreview,
  ToolPayloadView,
  type ToolPayloadPart,
} from './tool-payload'

export type ToolPart = ToolPayloadPart

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
            <ToolPayloadView compact={isCompact} toolPart={toolPart} />
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
        'grid shrink-0 place-items-center text-foreground',
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
  return getToolPayloadPreview(toolPart)
}

export { Tool }
