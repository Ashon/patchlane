import {
  agentRunSchema,
  createLlmEndpointSchema,
  type SandboxWorkspace,
} from '@patchlane/shared'
import {
  buildCodexCommandArgs,
  buildCodexPrompt,
  getCodexEventText,
  getCodexRunEventInput,
  getCodexRuntimeSessionId,
  getCodexSandboxMode,
  getCodexToolResultEvent,
  getCodexToolStartEvent,
  parseCodexJsonLine,
} from './codexRuntime'

describe('Given Codex runtime helpers', () => {
  it('extracts assistant text from Codex JSON events', () => {
    expect(
      getCodexEventText({
        type: 'item.completed',
        item: { type: 'agent_message', text: 'hello' },
      }),
    ).toBe('hello')
    expect(
      getCodexEventText({
        type: 'item.updated',
        item: { type: 'assistant_message', content: [{ text: 'world' }] },
      }),
    ).toBe('world')
    expect(
      getCodexEventText({
        type: 'item.completed',
        item: { type: 'command_execution', output: 'tool output' },
      }),
    ).toBeUndefined()
  })

  it('parses JSON lines without throwing on plain output', () => {
    expect(parseCodexJsonLine('{"type":"turn.started"}')).toEqual({
      type: 'turn.started',
    })
    expect(parseCodexJsonLine('plain output')).toBeUndefined()
  })

  it('extracts runtime session ids from Codex thread events', () => {
    expect(
      getCodexRuntimeSessionId({
        type: 'thread.started',
        thread_id: '0199a213-81c0-7800-8aa1-bbab2a035a53',
      }),
    ).toBe('0199a213-81c0-7800-8aa1-bbab2a035a53')
    expect(
      getCodexRuntimeSessionId({
        type: 'event',
        data: { sessionId: 'nested-session' },
      }),
    ).toBe('nested-session')
  })

  it('extracts raw Codex JSONL event metadata for persistence', () => {
    expect(
      getCodexRunEventInput(
        {
          type: 'item.started',
          item: {
            id: 'item_1',
            type: 'command_execution',
            command: 'pnpm test',
          },
        },
        '',
      ),
    ).toMatchObject({
      source: 'codex_jsonl',
      eventType: 'item.started',
      itemType: 'command_execution',
      itemId: 'item_1',
      payload: {
        type: 'item.started',
        item: {
          id: 'item_1',
          type: 'command_execution',
          command: 'pnpm test',
        },
      },
    })
  })

  it('maps Codex command execution items to tool stream events', () => {
    const start = getCodexToolStartEvent({
      type: 'item.started',
      item: {
        id: 'item_1',
        type: 'command_execution',
        command: 'bash -lc pnpm test',
        status: 'in_progress',
      },
    })
    const activeItems = new Map([
      [
        'item_1',
        {
          input: start?.input,
          startedAt: Date.now() - 10,
          toolName: start?.toolName ?? 'run_command',
        },
      ],
    ])
    const result = getCodexToolResultEvent(
      {
        type: 'item.completed',
        item: {
          id: 'item_1',
          type: 'command_execution',
          command: 'bash -lc pnpm test',
          output: 'PASS\n',
          status: 'completed',
        },
      },
      activeItems,
    )

    expect(start).toMatchObject({
      id: 'item_1',
      toolName: 'run_command',
      input: {
        command: 'bash -lc pnpm test',
        status: 'in_progress',
      },
    })
    expect(result).toMatchObject({
      id: 'item_1',
      toolName: 'run_command',
      input: {
        command: 'bash -lc pnpm test',
        status: 'in_progress',
      },
      output: {
        ok: true,
        command: 'bash -lc pnpm test',
        stdout: 'PASS\n',
        stderr: '',
        status: 'completed',
      },
    })
    expect(result?.metadata?.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('maps other Codex work item types to generic Codex tools', () => {
    expect(
      getCodexToolStartEvent({
        type: 'item.started',
        item: {
          id: 'item_2',
          type: 'web_search',
          query: 'Patchlane logging',
          status: 'in_progress',
        },
      }),
    ).toMatchObject({
      id: 'item_2',
      toolName: 'codex_web_search',
      input: {
        query: 'Patchlane logging',
        status: 'in_progress',
      },
    })
  })

  it('builds resume args when a Codex runtime session id exists', () => {
    expect(
      buildCodexCommandArgs({
        commandArgs: [],
        dangerouslyBypassSandbox: false,
        model: 'gpt-5',
        prompt: 'Continue the task.',
        run: {
          kind: 'coding',
          runtimeSessionId: 'codex-session-1',
        },
        workspace: { path: '/tmp/patchlane' },
      }),
    ).toEqual([
      'exec',
      '--json',
      '--cd',
      '/tmp/patchlane',
      '--model',
      'gpt-5',
      '--sandbox',
      'workspace-write',
      'resume',
      'codex-session-1',
      'Continue the task.',
    ])
  })

  it('builds a prompt with workspace and conversation context', () => {
    const run = agentRunSchema.parse({
      id: 'run-1',
      workspaceId: 'workspace-1',
      agentRuntime: 'codex',
      title: 'Implement feature',
      kind: 'coding',
      status: 'idle',
      messages: [
        {
          id: 'message-1',
          role: 'user',
          content: 'Update the backend connector.',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const workspace: SandboxWorkspace = {
      id: 'workspace-1',
      name: 'Patchlane',
      path: '/tmp/patchlane',
      status: 'ready',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    expect(buildCodexPrompt({ run, workspace })).toContain(
      'Workspace path: /tmp/patchlane',
    )
    expect(buildCodexPrompt({ run, workspace })).toContain(
      'Update the backend connector.',
    )
  })

  it('uses read-only sandbox mode and prompt language for research runs', () => {
    const run = agentRunSchema.parse({
      id: 'run-1',
      workspaceId: 'workspace-1',
      agentRuntime: 'codex',
      title: 'Research prompt mode',
      kind: 'research',
      status: 'idle',
      messages: [
        {
          id: 'message-1',
          role: 'user',
          content: 'Research task execution prompts.',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const workspace: SandboxWorkspace = {
      id: 'workspace-1',
      name: 'Patchlane',
      path: '/tmp/patchlane',
      status: 'ready',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const prompt = buildCodexPrompt({ run, workspace })

    expect(getCodexSandboxMode(run)).toBe('read-only')
    expect(prompt).toContain('research-only run')
    expect(prompt).toContain('do not modify files')
    expect(prompt).toContain('evidence-backed findings')
    expect(prompt).toContain('confirmation that no files were changed')
  })

  it('defaults Codex CLI endpoints to the codex command', () => {
    expect(
      createLlmEndpointSchema.parse({
        runtimeType: 'codex_cli',
        name: 'Codex Local',
      }),
    ).toMatchObject({
      runtimeType: 'codex_cli',
      baseUrl: 'codex://cli',
      defaultModel: '',
      opencodeCommand: 'codex',
    })
  })
})
