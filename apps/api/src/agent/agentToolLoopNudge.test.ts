import { describe, expect, it } from '@jest/globals'
import {
  getBlockedToolNames,
  getToolLoopNudgePrompt,
} from './agentToolLoopNudge'

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

  it('when tool loops are detected, then it blocks the repeated tool family for the next request', () => {
    expect(
      Array.from(
        getBlockedToolNames([
          'list_files',
          'read_file',
          'list_files',
          'read_file',
          'read_file',
          'list_files',
        ]),
      ).sort(),
    ).toEqual(['list_files', 'read_file'])

    expect(
      Array.from(
        getBlockedToolNames([
          'run_command',
          'run_command',
          'git_status',
          'run_command',
          'run_command',
          'run_command',
        ]),
      ),
    ).toEqual(['run_command'])
  })

  it('when broad exploration dominates the recent history, then it blocks all broad discovery tools', () => {
    expect(
      Array.from(
        getBlockedToolNames([
          'list_files',
          'read_file',
          'run_command',
          'git_status',
          'read_file',
          'run_command',
          'list_files',
          'read_file',
          'run_command',
          'read_file',
        ]),
      ).sort(),
    ).toEqual(['list_files', 'read_file', 'run_command'])

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
