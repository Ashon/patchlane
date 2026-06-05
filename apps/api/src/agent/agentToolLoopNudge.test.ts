import { describe, expect, it } from '@jest/globals'
import { getToolLoopNudgePrompt, isToolCallBlocked } from './agentToolLoopNudge'

describe('Given agent tool loop nudge', () => {
  it('when file exploration repeats, then it asks the agent to choose a concrete next action', () => {
    const prompt = getToolLoopNudgePrompt([
      'list_files',
      'read_file',
      'list_files',
      'read_file',
    ])

    expect(prompt).toContain('exploratory file tools repeatedly')
    expect(prompt).toContain('Stop broad listing')
    expect(prompt).toContain('edit the relevant file')
  })

  it('when commands repeat, then it discourages another generic command', () => {
    const prompt = getToolLoopNudgePrompt([
      'run_command',
      'run_command',
      'git_status',
      'run_command',
      'run_command',
      'run_command',
    ])

    expect(prompt).toContain('many commands in a row')
    expect(prompt).toContain('Do not run another command')
    expect(prompt).toContain('call finish')
  })

  it('when the recent tool history is varied, then it does not nudge', () => {
    expect(
      getToolLoopNudgePrompt([
        'list_files',
        'read_file',
        'write_file',
        'git_status',
      ]),
    ).toBeUndefined()
  })

  it('when the same read_file input repeats, then it blocks only that exact call', () => {
    expect(
      isToolCallBlocked(
        [
          { name: 'read_file', input: { path: 'src/a.ts' } },
          { name: 'read_file', input: { path: 'src/b.ts' } },
          { name: 'read_file', input: { path: 'src/a.ts' } },
        ],
        { name: 'read_file', input: { path: 'src/a.ts' } },
      ),
    ).toBe(true)

    expect(
      isToolCallBlocked(
        [
          { name: 'read_file', input: { path: 'src/a.ts' } },
          { name: 'read_file', input: { path: 'src/b.ts' } },
          { name: 'read_file', input: { path: 'src/a.ts' } },
        ],
        { name: 'read_file', input: { path: 'src/a.ts', startLine: 241 } },
      ),
    ).toBe(false)
  })

  it('when commands repeat with different arguments, then it does not block the next command', () => {
    expect(
      isToolCallBlocked(
        [
          { name: 'run_command', input: { command: 'rg', args: ['Badge'] } },
          { name: 'run_command', input: { command: 'rg', args: ['Loader2'] } },
          { name: 'run_command', input: { command: 'pnpm', args: ['lint'] } },
        ],
        {
          name: 'run_command',
          input: { command: 'pnpm', args: ['typecheck'] },
        },
      ),
    ).toBe(false)

    expect(
      isToolCallBlocked(
        [
          { name: 'run_command', input: { command: 'pnpm', args: ['lint'] } },
          { name: 'run_command', input: { command: 'pnpm', args: ['lint'] } },
          { name: 'run_command', input: { command: 'pnpm', args: ['lint'] } },
        ],
        { name: 'run_command', input: { command: 'pnpm', args: ['lint'] } },
      ),
    ).toBe(true)
  })

  it('when broad exploration dominates the recent history, then it nudges toward a concrete next action', () => {
    const prompt = getToolLoopNudgePrompt([
      'write_file',
      'list_files',
      'read_file',
      'run_command',
      'git_status',
      'read_file',
      'run_command',
      'list_files',
      'read_file',
      'run_command',
      'git_diff',
      'read_file',
    ])

    expect(prompt).toContain('too many calls on broad exploration')
    expect(prompt).toContain('Do not list, grep, cat, or read more files')
    expect(prompt).toContain('call finish')
  })
})
