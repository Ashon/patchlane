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
    await store.setStatus(run.id, 'running')
    const completed = await store.setStatus(run.id, 'completed')

    const rewound = await store.rewind(run.id, run.messages[0].id)

    expect(withSession.runtimeSessionId).toBe('codex-session-1')
    expect(completed.finishedAt).toBeDefined()
    expect(rewound.status).toBe('idle')
    expect(rewound.startedAt).toBeUndefined()
    expect(rewound.heartbeatAt).toBeUndefined()
    expect(rewound.finishedAt).toBeUndefined()
    expect(rewound.runtimeSessionId).toBeUndefined()
  })

  it('upserts generated messages with stable ids', async () => {
    const store = new AgentRunStore(new AppDatabase(':memory:'))
    const run = await store.create({
      workspaceId: 'workspace-1',
      agentRuntime: 'codex',
      title: 'Running tool',
      task: 'Run a command.',
    })

    const started = await store.upsertMessage(run.id, {
      id: 'codex-item-1',
      role: 'tool',
      toolName: 'run_command',
      toolInput: { command: 'pnpm test' },
      content: 'Running run_command...',
    })
    const completed = await store.upsertMessage(run.id, {
      id: 'codex-item-1',
      role: 'tool',
      toolName: 'run_command',
      toolInput: { command: 'pnpm test' },
      content: '{"ok":true,"stdout":"PASS"}',
    })

    const toolMessages = completed.messages.filter(
      (message) => message.id === 'codex-item-1',
    )

    expect(started.messages.at(-1)).toMatchObject({
      id: 'codex-item-1',
      content: 'Running run_command...',
    })
    expect(toolMessages).toHaveLength(1)
    expect(toolMessages[0]).toMatchObject({
      id: 'codex-item-1',
      role: 'tool',
      toolName: 'run_command',
      toolInput: { command: 'pnpm test' },
      content: '{"ok":true,"stdout":"PASS"}',
    })
    expect(toolMessages[0]?.createdAt).toBe(started.messages.at(-1)?.createdAt)
  })

  it('scopes generated message ids when provider item ids repeat across runs', async () => {
    const store = new AgentRunStore(new AppDatabase(':memory:'))
    const firstRun = await store.create({
      workspaceId: 'workspace-1',
      agentRuntime: 'codex',
      title: 'First run',
      task: 'Run a command.',
    })
    const secondRun = await store.create({
      workspaceId: 'workspace-1',
      agentRuntime: 'codex',
      title: 'Second run',
      task: 'Run another command.',
    })

    const first = await store.upsertMessage(firstRun.id, {
      id: 'item_1',
      role: 'tool',
      toolName: 'run_command',
      toolInput: { command: 'pnpm test' },
      content: 'Running run_command...',
    })
    const secondStarted = await store.upsertMessage(secondRun.id, {
      id: 'item_1',
      role: 'tool',
      toolName: 'run_command',
      toolInput: { command: 'pnpm lint' },
      content: 'Running run_command...',
    })
    const secondCompleted = await store.upsertMessage(secondRun.id, {
      id: 'item_1',
      role: 'tool',
      toolName: 'run_command',
      toolInput: { command: 'pnpm lint' },
      content: '{"ok":true,"stdout":"clean"}',
    })

    const secondToolMessages = secondCompleted.messages.filter(
      (message) => message.role === 'tool',
    )

    expect(first.messages.at(-1)?.id).toBe('item_1')
    expect(secondStarted.messages.at(-1)?.id).toBe(`${secondRun.id}:item_1`)
    expect(secondToolMessages).toHaveLength(1)
    expect(secondToolMessages[0]).toMatchObject({
      id: `${secondRun.id}:item_1`,
      content: '{"ok":true,"stdout":"clean"}',
      toolInput: { command: 'pnpm lint' },
      toolName: 'run_command',
    })
  })

  it('stores agent run events in sequence order', async () => {
    const store = new AgentRunStore(new AppDatabase(':memory:'))
    const run = await store.create({
      workspaceId: 'workspace-1',
      agentRuntime: 'codex',
      title: 'JSONL events',
      task: 'Capture raw events.',
    })

    await store.appendEvent(run.id, {
      source: 'codex_jsonl',
      eventType: 'thread.started',
      payload: { type: 'thread.started', thread_id: 'thread-1' },
    })
    await store.appendEvent(run.id, {
      source: 'codex_jsonl',
      eventType: 'item.started',
      itemType: 'command_execution',
      itemId: 'item-1',
      payload: {
        type: 'item.started',
        item: { id: 'item-1', type: 'command_execution' },
      },
    })

    const events = await store.listEvents(run.id)

    expect(events).toMatchObject([
      {
        runId: run.id,
        source: 'codex_jsonl',
        eventType: 'thread.started',
        sequence: 0,
      },
      {
        runId: run.id,
        source: 'codex_jsonl',
        eventType: 'item.started',
        itemType: 'command_execution',
        itemId: 'item-1',
        sequence: 1,
      },
    ])
  })

  it('maintains execution lifecycle timestamps when status changes', async () => {
    const store = new AgentRunStore(new AppDatabase(':memory:'))
    const run = await store.create({
      workspaceId: 'workspace-1',
      agentRuntime: 'patchlane',
      title: 'Lifecycle',
      task: 'Track lifecycle.',
    })

    const running = await store.setStatus(run.id, 'running')
    const completed = await store.setStatus(run.id, 'completed')

    expect(running.startedAt).toBeDefined()
    expect(running.heartbeatAt).toBeDefined()
    expect(running.finishedAt).toBeUndefined()
    expect(completed.startedAt).toBe(running.startedAt)
    expect(completed.heartbeatAt).toBe(running.heartbeatAt)
    expect(completed.finishedAt).toBeDefined()
    expect(completed.leaseOwner).toBeUndefined()
    expect(completed.leaseExpiresAt).toBeUndefined()
  })

  it('resets execution lifecycle metadata when a user continuation is queued', async () => {
    const store = new AgentRunStore(new AppDatabase(':memory:'))
    const run = await store.create({
      workspaceId: 'workspace-1',
      agentRuntime: 'codex',
      title: 'Continue',
      task: 'Start the task.',
    })

    const claimed = await store.claimExecution(run.id, {
      leaseDurationMs: 1_000,
      leaseOwner: 'worker-1',
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const requested = await store.requestCancellation(run.id)
    const continued = await store.appendMessage(run.id, {
      role: 'user',
      content: 'Continue after cancellation.',
    })

    expect(claimed.startedAt).toBeDefined()
    expect(claimed.heartbeatAt).toBeDefined()
    expect(claimed.leaseOwner).toBe('worker-1')
    expect(requested.cancellationRequestedAt).toBeDefined()
    expect(continued.status).toBe('idle')
    expect(continued.queuedAt).toBeDefined()
    expect(continued.startedAt).toBeUndefined()
    expect(continued.heartbeatAt).toBeUndefined()
    expect(continued.leaseOwner).toBeUndefined()
    expect(continued.leaseExpiresAt).toBeUndefined()
    expect(continued.cancellationRequestedAt).toBeUndefined()
    expect(continued.error).toBeUndefined()
    expect(continued.messages.at(-1)).toMatchObject({
      role: 'user',
      content: 'Continue after cancellation.',
    })
  })

  it('claims, heartbeats, and lists expired execution leases', async () => {
    const store = new AgentRunStore(new AppDatabase(':memory:'))
    const run = await store.create({
      workspaceId: 'workspace-1',
      agentRuntime: 'codex',
      title: 'Lease',
      task: 'Track a lease.',
    })
    const now = new Date('2026-01-01T00:00:00.000Z')

    const claimed = await store.claimExecution(run.id, {
      leaseDurationMs: 1_000,
      leaseOwner: 'worker-1',
      now,
    })
    const activeBeforeExpiry = await store.listExpiredLeases(
      new Date('2026-01-01T00:00:00.500Z'),
    )
    const expired = await store.listExpiredLeases(
      new Date('2026-01-01T00:00:01.500Z'),
    )
    const heartbeat = await store.heartbeat(run.id, {
      leaseDurationMs: 2_000,
      leaseOwner: 'worker-2',
      now: new Date('2026-01-01T00:00:02.000Z'),
    })

    expect(claimed.status).toBe('running')
    expect(claimed.leaseOwner).toBe('worker-1')
    expect(claimed.leaseExpiresAt).toBe('2026-01-01T00:00:01.000Z')
    expect(activeBeforeExpiry).toHaveLength(0)
    expect(expired.map((item) => item.id)).toEqual([run.id])
    expect(heartbeat.leaseOwner).toBe('worker-2')
    expect(heartbeat.leaseExpiresAt).toBe('2026-01-01T00:00:04.000Z')
  })

  it('records cancellation requests before cancellation finishes', async () => {
    const store = new AgentRunStore(new AppDatabase(':memory:'))
    const run = await store.create({
      workspaceId: 'workspace-1',
      agentRuntime: 'opencode',
      title: 'Cancel',
      task: 'Cancel this task.',
    })

    const requested = await store.requestCancellation(run.id)
    const cancelled = await store.cancel(run.id)

    expect(requested.cancellationRequestedAt).toBeDefined()
    expect(cancelled.cancellationRequestedAt).toBe(
      requested.cancellationRequestedAt,
    )
    expect(cancelled.finishedAt).toBeDefined()
    expect(cancelled.status).toBe('cancelled')
  })
})
