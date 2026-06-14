import { agentRunSchema, type SandboxWorkspace } from '@patchlane/shared'
import {
  buildOpenCodeCommandArgs,
  buildOpenCodePrompt,
  getOpenCodeEventText,
  getOpenCodeRuntimeSessionId,
  parseOpenCodeJsonLine,
} from './opencodeRuntime'

describe('Given OpenCode runtime helpers', () => {
  it('extracts assistant text from common JSON event shapes', () => {
    expect(getOpenCodeEventText({ delta: { content: 'hello' } })).toBe('hello')
    expect(
      getOpenCodeEventText({ message: { content: [{ text: 'world' }] } }),
    ).toBe('world')
    expect(getOpenCodeEventText({ choices: [{ delta: { text: '!' } }] })).toBe(
      '!',
    )
  })

  it('parses JSON lines without throwing on plain output', () => {
    expect(parseOpenCodeJsonLine('{"text":"ok"}')).toEqual({ text: 'ok' })
    expect(parseOpenCodeJsonLine('plain output')).toBeUndefined()
  })

  it('extracts runtime session ids from common event shapes', () => {
    expect(
      getOpenCodeRuntimeSessionId({
        session: { id: 'opencode-session-1' },
      }),
    ).toBe('opencode-session-1')
    expect(
      getOpenCodeRuntimeSessionId({
        data: { conversation_id: 'conversation-1' },
      }),
    ).toBe('conversation-1')
  })

  it('builds session args when an OpenCode runtime session id exists', () => {
    expect(
      buildOpenCodeCommandArgs({
        commandArgs: ['dlx', 'opencode-ai@1.16.2'],
        dangerouslySkipPermissions: true,
        model: 'openai/gpt-5',
        prompt: 'Continue the task.',
        run: { runtimeSessionId: 'opencode-session-1' },
        workspace: { path: '/tmp/patchlane' },
      }),
    ).toEqual([
      'dlx',
      'opencode-ai@1.16.2',
      'run',
      '--format',
      'json',
      '--dir',
      '/tmp/patchlane',
      '--session',
      'opencode-session-1',
      '--model',
      'openai/gpt-5',
      '--dangerously-skip-permissions',
      'Continue the task.',
    ])
  })

  it('builds a prompt with workspace and conversation context', () => {
    const run = agentRunSchema.parse({
      id: 'run-1',
      workspaceId: 'workspace-1',
      agentRuntime: 'opencode',
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

    expect(buildOpenCodePrompt({ run, workspace })).toContain(
      'Workspace path: /tmp/patchlane',
    )
    expect(buildOpenCodePrompt({ run, workspace })).toContain(
      'Update the backend connector.',
    )
  })

  it('builds a read-only prompt for research runs', () => {
    const run = agentRunSchema.parse({
      id: 'run-1',
      workspaceId: 'workspace-1',
      agentRuntime: 'opencode',
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
    const prompt = buildOpenCodePrompt({ run, workspace })

    expect(prompt).toContain('research-only run')
    expect(prompt).toContain('do not modify files')
    expect(prompt).toContain('evidence-backed findings')
    expect(prompt).toContain('confirmation that no files were changed')
  })
})
