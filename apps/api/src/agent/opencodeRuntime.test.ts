import { agentRunSchema, type SandboxWorkspace } from '@patchlane/shared'
import {
  buildOpenCodePrompt,
  getOpenCodeEventText,
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
})
