import { Loader } from '@patchlane/ui/loader'
import { Message, MessageAvatar } from '@patchlane/ui/message'
import { cn } from '@/lib/utils'

export const AssistantActivityIndicator = ({
  showAvatar,
  wide,
}: {
  showAvatar: boolean
  wide: boolean
}) => {
  return (
    <Message className={cn('group w-full min-w-0', wide ? 'gap-0' : 'gap-2')}>
      {showAvatar ? (
        <MessageAvatar
          alt="Assistant"
          className="h-7 w-7"
          fallback="AI"
          src=""
        />
      ) : null}
      <div className="flex h-7 min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <Loader className="text-primary" size="md" variant="pulse-dot" />
        <span>Working</span>
      </div>
    </Message>
  )
}

