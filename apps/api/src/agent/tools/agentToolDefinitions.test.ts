import { describe, expect, it } from '@jest/globals'
import { agentTools } from './agentToolDefinitions'

describe('Given agent tool definitions', () => {
  const toolByName = (name: string) => {
    const tool = agentTools.find(
      (candidate) => candidate.function.name === name,
    )

    if (!tool) {
      throw new Error(`Missing tool ${name}`)
    }

    return tool.function
  }

  it('when listing tools, then the coding runtime exposes the expected tool set', () => {
    expect(agentTools.map((tool) => tool.function.name)).toEqual([
      'list_files',
      'read_file',
      'write_file',
      'run_command',
      'git_status',
      'git_diff',
      'create_pull_request',
      'add_issue_comment',
      'request_user_input',
      'finish',
    ])
  })

  it('when describing run_command, then it requires an executable without shell expansion', () => {
    const tool = toolByName('run_command')

    expect(tool.description).toContain('without shell expansion')
    expect(tool.description).toContain('executable in command')
    expect(tool.parameters).toMatchObject({
      required: ['command'],
    })
  })

  it('when describing finish, then it requires a final summary', () => {
    expect(toolByName('finish').parameters).toMatchObject({
      required: ['summary'],
    })
  })

  it('when describing add_issue_comment, then it requires a user-facing body', () => {
    const tool = toolByName('add_issue_comment')

    expect(tool.description).toContain('user-facing update')
    expect(tool.parameters).toMatchObject({
      required: ['body'],
      properties: {
        kind: {
          enum: ['progress', 'decision', 'blocked', 'summary'],
        },
      },
    })
  })
})
