import { Button } from "@/components/ui/button"
import { Loader } from "@/components/ui/loader"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import {
  CheckCircle,
  ChevronDown,
  Settings,
  XCircle,
} from "lucide-react"
import { useState } from "react"

export type ToolPart = {
  type: string
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error"
  input?: Record<string, unknown>
  output?: unknown
  toolCallId?: string
  errorText?: string
}

export type ToolProps = {
  toolPart: ToolPart
  defaultOpen?: boolean
  className?: string
  size?: "default" | "compact"
}

const Tool = ({
  toolPart,
  defaultOpen = false,
  className,
  size = "default",
}: ToolProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const { state, input, output, toolCallId } = toolPart
  const isCompact = size === "compact"

  const getStateIcon = () => {
    const iconClassName = isCompact ? "h-3.5 w-3.5" : "h-4 w-4"

    switch (state) {
      case "input-streaming":
        return <Loader className="text-blue-500" size={isCompact ? "sm" : "md"} variant="pulse-dot" />
      case "input-available":
        return <Settings className={cn(iconClassName, "text-orange-500")} />
      case "output-available":
        return <CheckCircle className={cn(iconClassName, "text-green-500")} />
      case "output-error":
        return <XCircle className={cn(iconClassName, "text-red-500")} />
      default:
        return <Settings className={cn(iconClassName, "text-muted-foreground")} />
    }
  }

  const getStateBadge = () => {
    const baseClasses = cn(
      "rounded-full font-medium",
      isCompact ? "px-1.5 py-0.5 text-[11px] leading-4" : "px-2 py-1 text-xs"
    )
    switch (state) {
      case "input-streaming":
        return (
          <span
            className={cn(
              baseClasses,
              "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            )}
          >
            Processing
          </span>
        )
      case "input-available":
        return (
          <span
            className={cn(
              baseClasses,
              "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
            )}
          >
            Ready
          </span>
        )
      case "output-available":
        return (
          <span
            className={cn(
              baseClasses,
              "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            )}
          >
            Completed
          </span>
        )
      case "output-error":
        return (
          <span
            className={cn(
              baseClasses,
              "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            )}
          >
            Error
          </span>
        )
      default:
        return (
          <span
            className={cn(
              baseClasses,
              "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400"
            )}
          >
            Pending
          </span>
        )
    }
  }

  const formatValue = (value: unknown): string => {
    if (value === null) return "null"
    if (value === undefined) return "undefined"
    if (typeof value === "string") return value
    if (typeof value === "object") {
      return JSON.stringify(value, null, 2)
    }
    return String(value)
  }

  return (
    <div
      className={cn(
        "border-border min-w-0 overflow-hidden border",
        isCompact ? "mt-1 w-fit max-w-full rounded-md" : "mt-3 rounded-lg",
        className
      )}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              "bg-background h-auto w-full justify-between rounded-b-none font-normal",
              isCompact ? "min-h-7 gap-2 px-2 py-1 text-xs" : "px-3 py-2"
            )}
          >
            <div className={cn("flex min-w-0 items-center overflow-hidden", isCompact ? "gap-1.5" : "gap-2")}>
              {getStateIcon()}
              <span className={cn("truncate font-mono font-medium", isCompact ? "text-xs" : "text-sm")}>
                {toolPart.type}
              </span>
              {getStateBadge()}
            </div>
            <ChevronDown className={cn(isCompact ? "h-3.5 w-3.5" : "h-4 w-4", isOpen && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent
          className={cn(
            "border-border border-t",
            "data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden"
          )}
        >
          <div className={cn("bg-background min-w-0", isCompact ? "space-y-2 p-2" : "space-y-3 p-3")}>
            {input && Object.keys(input).length > 0 && (
              <div className="min-w-0">
                <h4 className={cn("text-muted-foreground font-medium", isCompact ? "mb-1 text-xs" : "mb-2 text-sm")}>
                  Input
                </h4>
                <div className={cn("bg-background min-w-0 overflow-x-auto rounded border font-mono", isCompact ? "p-1.5 text-xs" : "p-2 text-sm")}>
                  {Object.entries(input).map(([key, value]) => (
                    <div key={key} className={cn("min-w-0 break-words", isCompact ? "mb-0.5" : "mb-1")}>
                      <span className="text-muted-foreground">{key}:</span>{" "}
                      <span>{formatValue(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {output !== undefined && output !== null && (
              <div className="min-w-0">
                <h4 className={cn("text-muted-foreground font-medium", isCompact ? "mb-1 text-xs" : "mb-2 text-sm")}>
                  Output
                </h4>
                <div
                  className={cn(
                    "bg-background min-w-0 overflow-auto rounded border font-mono",
                    isCompact ? "max-h-44 p-1.5 text-xs" : "max-h-60 p-2 text-sm"
                  )}
                >
                  <pre className="min-w-0 whitespace-pre-wrap break-words">
                    {formatValue(output)}
                  </pre>
                </div>
              </div>
            )}

            {state === "output-error" && toolPart.errorText && (
              <div className="min-w-0">
                <h4 className={cn("font-medium text-red-500", isCompact ? "mb-1 text-xs" : "mb-2 text-sm")}>Error</h4>
                <div
                  className={cn(
                    "bg-background min-w-0 break-words rounded border border-red-200 dark:border-red-950 dark:bg-red-900/20",
                    isCompact ? "p-1.5 text-xs" : "p-2 text-sm"
                  )}
                >
                  {toolPart.errorText}
                </div>
              </div>
            )}

            {state === "input-streaming" && (
              <div className={cn("text-muted-foreground", isCompact ? "text-xs" : "text-sm")}>
                Processing tool call...
              </div>
            )}

            {toolCallId && (
              <div className={cn("text-muted-foreground border-t border-blue-200", isCompact ? "pt-1.5 text-[11px]" : "pt-2 text-xs")}>
                <span className="font-mono">Call ID: {toolCallId}</span>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

export { Tool }
