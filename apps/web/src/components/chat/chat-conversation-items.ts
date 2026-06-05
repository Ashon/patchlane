import type {
  ConversationMessage,
  ConversationMessageGroup,
  ConversationRenderItem,
} from './chat-conversation-types'

export const groupMessages = (messages: ConversationMessage[]) => {
  return messages.reduce<ConversationMessageGroup[]>((groups, message) => {
    if (message.role === 'user') {
      groups.push({ id: message.id, role: 'user', messages: [message] })
      return groups
    }

    const previous = groups[groups.length - 1]

    if (previous?.role === 'assistant') {
      previous.messages.push(message)
      return groups
    }

    groups.push({ id: message.id, role: 'assistant', messages: [message] })
    return groups
  }, [])
}

export const createConversationRenderItems = (
  groups: ConversationMessageGroup[],
  showStreamingPlaceholder: boolean,
  preserveEmptyMessages: boolean,
  compactAgentWork = false,
) => {
  return groups.flatMap<ConversationRenderItem>((group) => {
    if (group.role === 'user') {
      const message = group.messages[0]
      return message ? [{ id: group.id, role: 'user', message }] : []
    }

    const visibleMessages = preserveEmptyMessages
      ? group.messages
      : group.messages.filter((message) =>
          shouldRenderAssistantPart(message, showStreamingPlaceholder),
        )
    const metaMessage =
      group.messages.find(
        (message) => message.role === 'assistant' || message.role === 'system',
      ) ?? visibleMessages[0]

    if (!compactAgentWork) {
      return visibleMessages.map((message, index) => ({
        id: message.id,
        role: 'assistant',
        message,
        metaMessage: index === 0 ? metaMessage : undefined,
      }))
    }

    const items: ConversationRenderItem[] = []
    let workMessages: ConversationMessage[] = []
    let hasAssignedMetaMessage = false

    const flushWorkMessages = () => {
      if (!workMessages.length) {
        return
      }

      items.push({
        id: `work-${workMessages[0]!.id}`,
        role: 'agent-work',
        messages: workMessages,
        metaMessage: hasAssignedMetaMessage ? undefined : metaMessage,
      })
      hasAssignedMetaMessage = true
      workMessages = []
    }

    for (const message of visibleMessages) {
      if (isAgentWorkMessage(message, showStreamingPlaceholder)) {
        workMessages.push(message)
        continue
      }

      flushWorkMessages()
      items.push({
        id: message.id,
        role: 'assistant',
        message,
        metaMessage: hasAssignedMetaMessage ? undefined : metaMessage,
      })
      hasAssignedMetaMessage = true
    }

    flushWorkMessages()

    return items
  })
}

export const getEstimatedRenderItemSize = (item?: ConversationRenderItem) => {
  if (!item) {
    return 80
  }

  if (item.role === 'user') {
    return item.message.content.length > 320 ? 120 : 72
  }

  if (item.role === 'agent-work') {
    return 44
  }

  if (item.message.role === 'tool') {
    return 48
  }

  if (item.message.reasoning && item.message.content) {
    return 120
  }

  if (item.message.reasoning) {
    return 72
  }

  return item.message.content.length > 480 ? 140 : 80
}

const isAgentWorkMessage = (
  message: ConversationMessage,
  showStreamingPlaceholder: boolean,
) => {
  if (message.role === 'tool') {
    return true
  }

  const isAssistant = message.role === 'assistant' || message.role === 'system'
  const content = message.content.trim()
  const reasoning = (message.reasoning ?? '').trim()
  const showThinkingPlaceholder =
    showStreamingPlaceholder &&
    isAssistant &&
    message.status === 'streaming' &&
    !content &&
    !reasoning

  return (
    (isAssistant && Boolean(reasoning) && !content) || showThinkingPlaceholder
  )
}

const shouldRenderAssistantPart = (
  message: ConversationMessage,
  showStreamingPlaceholder: boolean,
) => {
  const isTool = message.role === 'tool'
  const isSystem = message.role === 'system'
  const isAssistant = message.role === 'assistant' || isSystem
  const content = message.content
  const reasoning = message.reasoning ?? ''
  const showThinkingPlaceholder =
    showStreamingPlaceholder &&
    isAssistant &&
    message.status === 'streaming' &&
    !content &&
    !reasoning

  return (
    (isAssistant && Boolean(reasoning)) ||
    showThinkingPlaceholder ||
    isTool ||
    Boolean(content)
  )
}
