import type { LlmEndpoint } from '@patchlane/shared'
import { Cpu, MessageSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export const ChatPanelHeader = ({
  canChat,
  contextLabel,
  endpoint,
  endpoints,
  hasConversation,
  isSidebar,
  isStreaming,
  loading,
  onClear,
  onEndpointChange,
  title,
}: {
  canChat: boolean
  contextLabel?: string
  endpoint: LlmEndpoint | null
  endpoints: LlmEndpoint[]
  hasConversation: boolean
  isSidebar: boolean
  isStreaming: boolean
  loading: boolean
  onClear: () => void
  onEndpointChange: (id: string) => void
  title: string
}) => {
  if (isSidebar) {
    return (
      <header className="flex min-h-12 items-center border-b bg-[var(--surface-page-header)] px-2 py-1.5">
        <div className="grid min-h-7 w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5">
          <EndpointSelect
            endpoint={endpoint}
            endpoints={endpoints}
            isStreaming={isStreaming}
            loading={loading}
            onEndpointChange={onEndpointChange}
            sidebar
          />
          <EndpointStatusBadge canChat={canChat} sidebar />
          <ClearChatButton
            disabled={!hasConversation}
            onClear={onClear}
            sidebar
          />
        </div>
      </header>
    )
  }

  return (
    <header className="flex min-h-10 flex-col gap-2 border-b bg-[var(--surface-page-header)] px-2 py-2 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <MessageSquare className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {contextLabel ??
              (endpoint
                ? `${endpoint.name} / ${endpoint.defaultModel}`
                : 'No endpoint selected')}
          </p>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <EndpointSelect
          endpoint={endpoint}
          endpoints={endpoints}
          isStreaming={isStreaming}
          loading={loading}
          onEndpointChange={onEndpointChange}
        />
        <EndpointStatusBadge canChat={canChat} />
        <ClearChatButton disabled={!hasConversation} onClear={onClear} />
      </div>
    </header>
  )
}

const EndpointSelect = ({
  endpoint,
  endpoints,
  isStreaming,
  loading,
  onEndpointChange,
  sidebar = false,
}: {
  endpoint: LlmEndpoint | null
  endpoints: LlmEndpoint[]
  isStreaming: boolean
  loading: boolean
  onEndpointChange: (id: string) => void
  sidebar?: boolean
}) => {
  return (
    <Select
      disabled={!endpoints.length || loading || isStreaming}
      onValueChange={onEndpointChange}
      value={endpoint?.id ?? undefined}
    >
      <SelectTrigger
        className={cn(
          'h-7 min-w-0 px-2 text-xs',
          !sidebar && 'w-full sm:w-[320px] xl:w-[400px]',
        )}
      >
        <SelectValue placeholder={loading ? 'Loading endpoints...' : 'Select model'} />
      </SelectTrigger>
      <SelectContent>
        {endpoints.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            {item.name} / {item.defaultModel}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const EndpointStatusBadge = ({
  canChat,
  sidebar = false,
}: {
  canChat: boolean
  sidebar?: boolean
}) => {
  return (
    <Badge
      className={cn(
        'gap-1',
        sidebar && 'h-7 px-2 text-xs',
        canChat
          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300'
          : 'border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300',
      )}
      variant="outline"
    >
      <Cpu className="h-3 w-3" />
      {canChat ? 'Ready' : 'Unavailable'}
    </Badge>
  )
}

const ClearChatButton = ({
  disabled,
  onClear,
  sidebar = false,
}: {
  disabled: boolean
  onClear: () => void
  sidebar?: boolean
}) => {
  return (
    <Button
      className={sidebar ? 'h-7 px-2.5 text-xs' : undefined}
      disabled={disabled}
      onClick={onClear}
      size="sm"
      type="button"
      variant="outline"
    >
      Clear
    </Button>
  )
}
