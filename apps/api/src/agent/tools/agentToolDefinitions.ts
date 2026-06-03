export const agentTools = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files and directories in the sandbox workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative directory path. Defaults to workspace root.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read a UTF-8 source file from the sandbox workspace. For large files, request a line window with startLine and maxLines instead of rereading the whole file.',
      parameters: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string' },
          startLine: {
            type: 'number',
            description: '1-based starting line. Defaults to 1.',
          },
          maxLines: {
            type: 'number',
            description:
              'Maximum lines to return. Defaults to 240 and caps at 500.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write a UTF-8 source file in the sandbox workspace.',
      parameters: {
        type: 'object',
        required: ['path', 'content'],
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description:
        'Run an allowlisted command in the sandbox workspace without shell expansion. Put the executable in command and only its arguments in args; never repeat the command name inside args.',
      parameters: {
        type: 'object',
        required: ['command'],
        properties: {
          command: {
            type: 'string',
            description:
              "Executable name only, for example 'ls', 'pnpm', 'node', or 'git'.",
          },
          args: {
            type: 'array',
            items: { type: 'string' },
            description:
              "Arguments only. For 'ls -la', use command='ls' and args=['-la'], not args=['ls','-la'].",
          },
          cwd: { type: 'string' },
          timeoutMs: { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Return git status for the sandbox workspace.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Return git diff for the sandbox workspace.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_pull_request',
      description:
        'Create a GitHub pull request after changes are committed and pushed.',
      parameters: {
        type: 'object',
        required: ['title', 'body', 'head', 'base'],
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          head: {
            type: 'string',
            description: 'Pushed branch name, for example agent/my-change',
          },
          base: {
            type: 'string',
            description: 'Base branch, for example main',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_user_input',
      description: 'Ask the user a blocking clarification question.',
      parameters: {
        type: 'object',
        required: ['question'],
        properties: {
          question: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: 'Mark the agent run completed with a concise final summary.',
      parameters: {
        type: 'object',
        required: ['summary'],
        properties: {
          summary: { type: 'string' },
        },
      },
    },
  },
] as const
