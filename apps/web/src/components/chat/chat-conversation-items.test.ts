import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createConversationRenderItems,
  groupMessages,
} from './chat-conversation-items'
import type { ConversationMessage } from './chat-conversation-types'

describe('chat conversation render items', () => {
  it('groups consecutive reasoning and tool messages into one agent work item', () => {
    const items = createConversationRenderItems(
      groupMessages([
        message('user-1', 'user', 'Run the task.'),
        message('reasoning-1', 'assistant', '', 'Inspecting files.'),
        {
          ...message('tool-1', 'tool', '{"ok":true}'),
          toolName: 'run_command',
        },
        message('assistant-1', 'assistant', 'Done.'),
        message('reasoning-2', 'assistant', '', 'Verifying result.'),
      ]),
      true,
      false,
      true,
    )

    assert.deepEqual(
      items.map((item) => item.role),
      ['user', 'agent-work', 'assistant', 'agent-work'],
    )

    assert.equal(items[1]?.role, 'agent-work')
    assert.equal(items[1]?.role === 'agent-work' && items[1].messages.length, 2)
    assert.equal(items[3]?.role, 'agent-work')
    assert.equal(items[3]?.role === 'agent-work' && items[3].messages.length, 1)
  })

  it('keeps existing individual assistant parts when compact work is disabled', () => {
    const items = createConversationRenderItems(
      groupMessages([
        message('user-1', 'user', 'Run the task.'),
        message('reasoning-1', 'assistant', '', 'Inspecting files.'),
        {
          ...message('tool-1', 'tool', '{"ok":true}'),
          toolName: 'run_command',
        },
      ]),
      true,
      false,
      false,
    )

    assert.deepEqual(
      items.map((item) => item.role),
      ['user', 'assistant', 'assistant'],
    )
  })
})

const message = (
  id: string,
  role: ConversationMessage['role'],
  content: string,
  reasoning = '',
): ConversationMessage => ({
  id,
  role,
  content,
  reasoning,
})
