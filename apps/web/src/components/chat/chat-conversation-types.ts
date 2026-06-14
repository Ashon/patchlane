import type { AgentRunMessageMetadata } from '@patchlane/shared'
import type { ReactNode } from 'react'

export type ConversationMessage = {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  reasoning?: string
  status?: 'streaming' | 'done' | 'error' | 'stopped'
  finishReason?: string
  createdAt?: string
  toolName?: string
  toolCallId?: string
  toolInput?: Record<string, unknown>
  toolOutput?: unknown
  toolError?: string
  metadata?: AgentRunMessageMetadata
}

export type ConversationMessageGroup = {
  id: string
  role: 'user' | 'assistant'
  messages: ConversationMessage[]
}

export type ConversationRenderItem =
  | {
      id: string
      role: 'user'
      message: ConversationMessage
    }
  | {
      id: string
      role: 'assistant'
      message: ConversationMessage
      metaMessage?: ConversationMessage
    }
  | {
      id: string
      role: 'agent-work'
      messages: ConversationMessage[]
      metaMessage?: ConversationMessage
    }

export type ChatConversationProps = {
  compactAgentWork?: boolean
  contentClassName?: string
  emptyState: ReactNode
  error?: string | null
  header?: ReactNode
  inputActions: ReactNode
  inputDisabled?: boolean
  inputFooter: ReactNode
  inputLoading: boolean
  inputPlaceholder: string
  inputTextareaDisabled?: boolean
  inputValue: string
  messages: ConversationMessage[]
  onInputChange: (value: string) => void
  onInputSubmit: () => void
  onRewindMessage?: (message: ConversationMessage) => void
  preserveEmptyMessages?: boolean
  showAssistantAvatar?: boolean
  showInputLoadingIndicator?: boolean
  showInlineActivity?: boolean
  showMessageMeta?: boolean
  showStreamingPlaceholder?: boolean
  wideMessages?: boolean
}
