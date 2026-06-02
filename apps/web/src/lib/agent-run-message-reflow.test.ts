import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AgentRun } from '@agent-fleet/shared'
import { getAgentTaskConversationMessages } from './agent-task-messages'
import {
  mergeToolResultMessage,
  mergeToolStartMessage,
  mergeVisibleAgentRunMessages,
  parseToolInputArguments,
  type AgentRunMessage,
} from './agent-run-message-merge'

const timestamp = '2026-06-03T00:00:00.000Z'

describe('agent task tool reflow replay', () => {
  it('keeps the same tool row from empty assistant placeholder through completion and server run', () => {
    const user = message('user-1', 'user', 'Inspect the repo.')
    const streamPlaceholder = message('stream-empty', 'assistant', '')
    const resultContent = JSON.stringify({
      ok: true,
      stdout: 'done\n',
      stderr: '',
      exitCode: 0,
    })

    let messages: AgentRunMessage[] = [user, streamPlaceholder]
    assertFrame(messages, {
      id: 'stream-empty',
      role: 'assistant',
      status: 'streaming',
      index: 1,
      label: 'empty assistant placeholder',
    })

    messages = mergeToolStartMessage(
      messages,
      { id: 'stream-empty', content: '' },
      {
        id: 'stream-empty',
        role: 'tool',
        toolName: 'run_command',
        toolInput: parseToolInputArguments(
          JSON.stringify({ command: 'pnpm lint' }),
        ),
        content: 'Running run_command...',
        createdAt: timestamp,
      },
    )
    assertFrame(messages, {
      id: 'stream-empty',
      role: 'tool',
      status: 'streaming',
      index: 1,
      label: 'tool_start',
    })

    messages = mergeToolResultMessage(messages, {
      id: 'stream-empty',
      role: 'tool',
      toolName: 'run_command',
      content: resultContent,
      createdAt: timestamp,
    })
    assertFrame(messages, {
      id: 'stream-empty',
      role: 'tool',
      status: 'done',
      index: 1,
      label: 'tool_result',
    })

    messages = mergeVisibleAgentRunMessages(messages, [
      user,
      {
        id: 'server-tool-1',
        role: 'tool',
        toolName: 'run_command',
        content: resultContent,
        createdAt: '2026-06-03T00:00:01.000Z',
      },
    ])
    assertFrame(messages, {
      id: 'stream-empty',
      role: 'tool',
      status: 'done',
      index: 1,
      label: 'server run after tool_result',
    })
    assert.equal(
      messages.filter((item) => item.role === 'tool').length,
      1,
      'server run should merge into the visible tool row instead of appending',
    )
  })

  it('lets a server run complete the visible running tool without inserting a second row', () => {
    const user = message('user-1', 'user', 'Run checks.')
    const resultContent = JSON.stringify({ ok: true, stdout: 'clean\n' })

    const messages = mergeToolStartMessage(
      [user],
      null,
      {
        id: 'tool-local-1',
        role: 'tool',
        toolName: 'run_command',
        content: 'Running run_command...',
        createdAt: timestamp,
      },
    )
    const merged = mergeVisibleAgentRunMessages(messages, [
      {
        id: 'tool-server-1',
        role: 'tool',
        toolName: 'run_command',
        content: resultContent,
        createdAt: '2026-06-03T00:00:01.000Z',
      },
    ])

    assertFrame(merged, {
      id: 'tool-local-1',
      role: 'tool',
      status: 'done',
      index: 1,
      label: 'server run before tool_result fallback',
    })
    assert.equal(merged.filter((item) => item.role === 'tool').length, 1)
    assert.equal(merged[1]?.metadata?.durationMs, undefined)
  })

  it('keeps tool duration metadata when a running tool completes', () => {
    const resultContent = JSON.stringify({ ok: true, stdout: 'clean\n' })
    const messages = mergeToolStartMessage(
      [message('user-1', 'user', 'Run checks.')],
      null,
      {
        id: 'tool-local-1',
        role: 'tool',
        toolName: 'run_command',
        content: 'Running run_command...',
        createdAt: timestamp,
      },
    )
    const merged = mergeToolResultMessage(messages, {
      id: 'tool-local-1',
      role: 'tool',
      toolName: 'run_command',
      content: resultContent,
      metadata: {
        durationMs: 1234,
      },
      createdAt: timestamp,
    })

    assert.equal(merged[1]?.role, 'tool')
    assert.equal(merged[1]?.metadata?.durationMs, 1234)
  })

  it('matches repeated same-name tool calls to their own visible rows', () => {
    const firstResult = JSON.stringify({ ok: true, stdout: 'first\n' })
    const secondResult = JSON.stringify({ ok: true, stdout: 'second\n' })
    const visibleMessages: AgentRunMessage[] = [
      message('user-1', 'user', 'Run two commands.'),
      {
        id: 'tool-local-1',
        role: 'tool',
        toolName: 'run_command',
        content: firstResult,
        createdAt: timestamp,
      },
      {
        id: 'tool-local-2',
        role: 'tool',
        toolName: 'run_command',
        content: 'Running run_command...',
        createdAt: timestamp,
      },
    ]

    const merged = mergeVisibleAgentRunMessages(visibleMessages, [
      {
        id: 'tool-server-1',
        role: 'tool',
        toolName: 'run_command',
        content: firstResult,
        createdAt: '2026-06-03T00:00:01.000Z',
      },
      {
        id: 'tool-server-2',
        role: 'tool',
        toolName: 'run_command',
        content: secondResult,
        createdAt: '2026-06-03T00:00:02.000Z',
      },
    ])

    const tools = merged.filter((item) => item.role === 'tool')
    assert.equal(tools.length, 2)
    assert.equal(tools[0]?.id, 'tool-local-1')
    assert.equal(tools[0]?.content, firstResult)
    assert.equal(tools[1]?.id, 'tool-local-2')
    assert.equal(tools[1]?.content, secondResult)
  })

  it('marks the latest stream reasoning as streaming while it is the active message', () => {
    const displayMessages = getAgentTaskConversationMessages(
      run([
        message('user-1', 'user', 'Inspect the repo.'),
        message(
          'stream-reasoning',
          'assistant',
          "<think>I'm checking the current file layout before running a command.</think>",
        ),
      ]),
      true,
    )

    const reasoningMessage = displayMessages.find(
      (item) => item.id === 'stream-reasoning',
    )

    assert.equal(reasoningMessage?.role, 'assistant')
    assert.equal(
      reasoningMessage?.reasoning,
      "I'm checking the current file layout before running a command.",
    )
    assert.equal(reasoningMessage?.status, 'streaming')
  })

  it('clears stream reasoning status when a tool row follows it', () => {
    const displayMessages = getAgentTaskConversationMessages(
      run([
        message('user-1', 'user', 'Inspect the repo.'),
        message(
          'stream-reasoning',
          'assistant',
          "<think>I'm checking the current file layout before running a command.</think>",
        ),
        {
          id: 'tool-local-1',
          role: 'tool',
          toolName: 'run_command',
          content: 'Running run_command...',
          createdAt: timestamp,
        },
      ]),
      true,
    )

    const reasoningMessage = displayMessages.find(
      (item) => item.id === 'stream-reasoning',
    )

    assert.equal(reasoningMessage?.role, 'assistant')
    assert.equal(
      reasoningMessage?.reasoning,
      "I'm checking the current file layout before running a command.",
    )
    assert.equal(reasoningMessage?.status, undefined)
  })

  it('does not mark an older stream assistant as streaming after a newer user message', () => {
    const displayMessages = getAgentTaskConversationMessages(
      run([
        message('user-1', 'user', 'First turn.'),
        message(
          'stream-old',
          'assistant',
          '<think>Older reasoning.</think>Done.',
        ),
        message('user-2', 'user', 'Second turn.'),
        {
          id: 'tool-local-1',
          role: 'tool',
          toolName: 'run_command',
          content: 'Running run_command...',
          createdAt: timestamp,
        },
      ]),
      true,
    )

    const oldMessage = displayMessages.find((item) => item.id === 'stream-old')

    assert.equal(oldMessage?.role, 'assistant')
    assert.equal(oldMessage?.status, undefined)
  })
})

const assertFrame = (
  messages: AgentRunMessage[],
  expected: {
    id: string
    index: number
    label: string
    role: 'assistant' | 'tool'
    status: 'done' | 'streaming'
  },
) => {
  const displayMessages = getAgentTaskConversationMessages(run(messages), true)
  const index = displayMessages.findIndex((item) => item.id === expected.id)
  const item = displayMessages[index]

  assert.equal(
    index,
    expected.index,
    `${expected.label}: visible row index should not move`,
  )
  assert.equal(item?.role, expected.role, `${expected.label}: row role`)
  assert.equal(item?.status, expected.status, `${expected.label}: row status`)
}

const run = (messages: AgentRunMessage[]): AgentRun => ({
  id: 'run-1',
  workspaceId: 'workspace-1',
  title: 'Replay',
  kind: 'coding',
  status: 'running',
  messages,
  createdAt: timestamp,
  updatedAt: timestamp,
})

const message = (
  id: string,
  role: AgentRunMessage['role'],
  content: string,
): AgentRunMessage => ({
  id,
  role,
  content,
  createdAt: timestamp,
})
