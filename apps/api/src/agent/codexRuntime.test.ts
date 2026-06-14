import {
  agentRunSchema,
  createLlmEndpointSchema,
  type SandboxWorkspace,
} from '@patchlane/shared'
import {
  buildCodexCommandArgs,
  buildCodexPrompt,
  getCodexEventText,
  getCodexRuntimeSessionId,
  getCodexSandboxMode,
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
