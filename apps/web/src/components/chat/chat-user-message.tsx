import { Message, MessageContent } from '@patchlane/ui/message'
import { cn } from '@/lib/utils'
import type { ConversationMessage } from './chat-conversation-types'
import { MessageMeta, MessageStatusActions } from './chat-message-actions'
import { MessageBlockFrame, getInsetOverlayClass } from './chat-message-frame'
import { getMetadataAccessory } from './chat-message-metadata'

export const UserMessageBubble = ({
  message,
  onRewind,
  rewindDisabled,
  showMeta,
  wide,
}: {
  message: ConversationMessage
  onRewind?: (message: ConversationMessage) => void
  rewindDisabled?: boolean
  showMeta: boolean
  wide: boolean
}) => {
  const content = message.content
  const metadataAccessory = getMetadataAccessory(message.metadata)

  return (
    <Message className="group w-full min-w-0 justify-end">
      <div
        className={cn(
          'group/message flex w-full min-w-0 flex-col space-y-1 mb-2',
          wide ? 'items-stretch' : 'items-end',
          !wide && 'max-w-[920px]',
        )}
      >
        {showMeta ? <MessageMeta message={message} /> : null}
        {content ? (
          <MessageBlockFrame
            accessory={metadataAccessory}
            className={
              wide ? 'w-full max-w-full' : 'w-fit max-w-[calc(100%_-_10rem)]'
            }
            overlayClassName={wide ? getInsetOverlayClass('right') : undefined}
            overlay={
              <MessageStatusActions
                message={message}
                onRewind={onRewind}
                rewindDisabled={rewindDisabled}
              />
            }
            overlaySide={wide ? 'right' : 'left'}
          >
            <MessageContent
              className={userMessageContentClass}
              id={message.id}
              markdown
            >
              {content}
            </MessageContent>
          </MessageBlockFrame>
        ) : null}
      </div>
    </Message>
  )
}

const userMessageContentClass =
  'max-w-full overflow-hidden rounded-lg bg-chat-user px-2.5 py-1.5 text-sm leading-5 text-chat-user-foreground prose-p:my-0 prose-pre:my-1.5 prose-ol:my-1 prose-ul:my-1 prose-li:my-0 prose-blockquote:my-1.5 prose-table:my-1.5 [&_*]:max-w-full [&_pre]:overflow-x-auto'
