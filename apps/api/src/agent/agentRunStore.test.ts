import { AppDatabase } from '../db/database'
import { AgentRunStore } from './agentRunStore'

describe('Given AgentRunStore cancellation', () => {
  it('marks a run cancelled and appends one system message', async () => {
    const store = new AgentRunStore(new AppDatabase(':memory:'))
    const run = await store.create({
      workspaceId: 'workspace-1',
      agentRuntime: 'patchlane',
      title: 'Long task',
      task: 'Run a long task.',
    })

    const cancelled = await store.cancel(run.id)
    const cancelledAgain = await store.cancel(run.id)
    const stopMessages = cancelledAgain.messages.filter(
      (message) =>
        message.role === 'system' &&
        message.content === 'Agent run stopped by user.',
    )

    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.error).toBe('Agent run stopped by user.')
    expect(cancelledAgain.status).toBe('cancelled')
    expect(stopMessages).toHaveLength(1)
  })

  it('updates the stored runtime for the next run continuation', async () => {
    const store = new AgentRunStore(new AppDatabase(':memory:'))
    const run = await store.create({
      workspaceId: 'workspace-1',
      agentRuntime: 'patchlane',
      endpointId: 'openai-endpoint',
      title: 'Runtime change',
      task: 'Use a different runtime.',
    })

    const updated = await store.updateRuntime(run.id, {
      agentRuntime: 'codex',
      endpointId: 'codex-endpoint',
    })

    expect(updated.agentRuntime).toBe('codex')
    expect(updated.endpointId).toBe('codex-endpoint')
  })

  it('stores runtime session ids and clears them when the runtime changes', async () => {
    const store = new AgentRunStore(new AppDatabase(':memory:'))
    const run = await store.create({
      workspaceId: 'workspace-1',
      agentRuntime: 'codex',
      endpointId: 'codex-endpoint',
      title: 'Runtime session',
      task: 'Track CLI session metadata.',
    })

    const withSession = await store.setRuntimeSessionId(
      run.id,
      'codex-session-1',
    )
    const updated = await store.updateRuntime(run.id, {
      agentRuntime: 'opencode',
      endpointId: 'opencode-endpoint',
    })

    expect(withSession.runtimeSessionId).toBe('codex-session-1')
    expect(updated.runtimeSessionId).toBeUndefined()
  })

  it('clears runtime session ids when rewinding messages', async () => {
    const store = new AgentRunStore(new AppDatabase(':memory:'))
    const run = await store.create({
      workspaceId: 'workspace-1',
      agentRuntime: 'codex',
      title: 'Runtime session rewind',
      task: 'Track CLI session metadata.',
    })
    await store.appendMessage(run.id, {
      role: 'assistant',
      content: 'Previous answer.',
    })
    const withSession = await store.setRuntimeSessionId(
      run.id,
      'codex-session-1',
    )

    const rewound = await store.rewind(run.id, run.messages[0].id)

    expect(withSession.runtimeSessionId).toBe('codex-session-1')
    expect(rewound.runtimeSessionId).toBeUndefined()
  })
})
