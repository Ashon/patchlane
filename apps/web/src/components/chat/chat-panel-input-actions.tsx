import { Send, Square } from 'lucide-react'
import { Button } from '@patchlane/ui/button'
import { PromptInputAction } from '@patchlane/ui/prompt-input'

export const ChatPanelInputActions = ({
  canChat,
  input,
  isStreaming,
  onSend,
  onStop,
}: {
  canChat: boolean
  input: string
  isStreaming: boolean
  onSend: () => void
  onStop: () => void
}) => {
  if (isStreaming) {
    return (
      <PromptInputAction tooltip="Stop response">
        <Button
          onClick={onStop}
          size="icon"
          type="button"
          variant="outline"
        >
          <Square />
        </Button>
      </PromptInputAction>
    )
  }

  return (
    <PromptInputAction tooltip="Send message">
      <Button
        disabled={!canChat || !input.trim()}
        onClick={onSend}
        size="icon"
        type="button"
      >
        <Send />
      </Button>
    </PromptInputAction>
  )
}

