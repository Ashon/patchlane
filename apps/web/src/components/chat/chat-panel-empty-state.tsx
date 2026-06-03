import { Sparkles } from 'lucide-react'
import { PromptSuggestion } from '@/components/ui/prompt-suggestion'
import { cn } from '@/lib/utils'

export const ChatPanelEmptyState = ({
  canChat,
  isSidebar,
  isStreaming,
  onSuggestionClick,
  suggestions,
}: {
  canChat: boolean
  isSidebar: boolean
  isStreaming: boolean
  onSuggestionClick: (suggestion: string) => void
  suggestions: string[]
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2.5 text-center',
        isSidebar ? 'min-h-[240px]' : 'min-h-[32vh]',
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-card text-primary shadow-sm">
        <Sparkles className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold">
          {isSidebar ? 'Ask the supervisor' : 'Start a conversation'}
        </h3>
        <p className="max-w-md text-sm text-muted-foreground">
          {isSidebar
            ? 'Use this panel while moving across projects, issues, settings, and agent tasks.'
            : 'Streaming responses, reasoning panels, Markdown, tables, and code blocks are enabled.'}
        </p>
      </div>
      <div
        className={cn(
          'flex flex-wrap justify-center gap-2',
          isSidebar ? 'max-w-sm' : 'max-w-2xl',
        )}
      >
        {suggestions.map((suggestion) => (
          <PromptSuggestion
            disabled={!canChat || isStreaming}
            key={suggestion}
            onClick={() => onSuggestionClick(suggestion)}
            type="button"
          >
            {suggestion}
          </PromptSuggestion>
        ))}
      </div>
    </div>
  )
}

