import { randomUUID } from 'node:crypto'
import type {
  AgentRun,
  AgentRunContext,
  AgentRunMessage,
  AgentRunMessageMetadata,
  LlmEndpoint,
  SandboxFileContent,
  SandboxSettings,
  SandboxWorkspace,
} from '@patchlane/shared'
import { createOpenAIClient } from '../llm/openaiClient'
import { executeSandboxCommand } from '../sandbox/sandboxExecutor'
import { getGitAuthEnv } from '../sandbox/gitSandbox'
import {
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
} from '../sandbox/workspaceFiles'
import { estimateTextTokens, prepareAgentContext } from './agentContext'
import type { AgentRunStore } from './agentRunStore'
import { createPullRequest } from './githubPr'

type AgentRuntimeOptions = {
  runStore: AgentRunStore
  settings: SandboxSettings
  contextTokenBudget?: number
  durabilityMaxRetries?: number
  outputTokenBudget?: number
  getEndpoint: (id?: string) => Promise<LlmEndpoint>
  getWorkspace: (id: string) => Promise<SandboxWorkspace>
  getGitHubToken: () => Promise<string | undefined>
  onRunFinished?: (run: AgentRun) => Promise<void>
}

type ToolContext = {
  settings: SandboxSettings
  workspace: SandboxWorkspace
  githubToken?: string
}

type AgentToolResult = {
  content: string
  completed?: boolean
  awaitingUser?: boolean
  prUrl?: string
  resultSummary?: string
}

type AgentRuntimeStreamEvent =
  | {
      type: 'run'
      run: AgentRun
    }
  | {
      type: 'assistant_delta'
      content: string
      metadata?: AgentRunMessageMetadata
    }
  | {
      type: 'assistant_reset'
    }
  | {
      type: 'tool_start'
      toolName: string
      toolInput?: string
      metadata?: AgentRunMessageMetadata
    }
  | {
      type: 'tool_result'
      toolName: string
      content: string
      metadata?: AgentRunMessageMetadata
    }
  | {
      type: 'done'
      run: AgentRun
    }
  | {
      type: 'error'
      error: string
      run?: AgentRun
    }

type AgentRuntimeStreamEmit = (event: AgentRuntimeStreamEvent) => void

const maxToolIterations = 8
const retryToolIterations = 4
const totalToolIterations = maxToolIterations + retryToolIterations
const defaultDurabilityMaxRetries = 2
const toolPromptContentMaxChars = 6_000
const defaultReadFileMaxLines = 240
const maxReadFileMaxLines = 500
const maxReadFileContentChars = 20_000
const toolIterationRetryPrompt = [
  'The tool loop reached the normal per-pass limit.',
  'Continue from the current context instead of stopping.',
  'Use only the highest-value remaining tool calls.',
  'If the requested work is complete, call finish. If you are blocked, call request_user_input.',
].join('\n')
const toolIterationLimitMessage =
  'Tool iteration limit reached after an automatic retry. Review the current changes and continue the run.'
const thinkingOnlyContinuationPrompt = [
  'Your previous response contained only private reasoning and did not call a tool, ask a blocking question, or finish the task.',
  'Do not stop on private reasoning. Continue now with a concrete tool call, finish, or request_user_input.',
  'Avoid repeating broad exploration. Use the compacted context and choose the next highest-value coding action.',
].join('\n')
const replayRecoveryPrompt = [
  'Replay recovery mode:',
  '- The previous attempt stalled after repeated exploration or a tool iteration limit.',
  "- Do not repeat the same generic 'different approach' reasoning.",
  '- Use allowed tools directly, inspect only targeted file windows, and move toward editing, verification, finish, or request_user_input.',
].join('\n')

type AgentMessageMetadataInput = {
  context: AgentRunContext
  model?: string
  attempt: number
  iteration: number
  promptMessages: number
  maxOutputTokens?: number
  durationMs?: number
  content?: string
  toolInput?: string
  toolOutput?: string
}

const createAgentMessageMetadata = ({
  context,
  model,
  attempt,
  iteration,
  promptMessages,
  maxOutputTokens,
  durationMs,
  content,
  toolInput,
  toolOutput,
}: AgentMessageMetadataInput): AgentRunMessageMetadata => {
  return {
    durationMs,
    context: {
      strategy: context.strategy,
      tokenBudget: context.tokenBudget,
      estimatedTokens: context.estimatedTokens,
      retainedMessages: context.retainedMessages,
      summarizedMessages: context.summarizedMessages,
      promptMessages,
    },
    request: {
      model,
      attempt,
      iteration,
      maxOutputTokens,
    },
    content: content === undefined ? undefined : getTextMetrics(content),
    tool:
      toolInput === undefined && toolOutput === undefined
        ? undefined
        : {
            input:
              toolInput === undefined ? undefined : getTextMetrics(toolInput),
            output:
              toolOutput === undefined ? undefined : getTextMetrics(toolOutput),
          },
  }
}

const getTextMetrics = (value: string) => {
  return {
    characters: Array.from(value).length,
    estimatedTokens: estimateTextTokens(value),
  }
}

export class AgentRuntime {
  constructor(private readonly options: AgentRuntimeOptions) {}

  async continue(runId: string, endpointId?: string, model?: string) {
    let run = await this.options.runStore.get(runId)
    const endpoint = await this.options.getEndpoint(
      endpointId || run.endpointId,
    )
    const workspace = await this.options.getWorkspace(run.workspaceId)
    const githubToken = await this.options.getGitHubToken()

    run = await this.options.runStore.setStatus(run.id, 'running')

    try {
      const client = createOpenAIClient(endpoint)
      const durabilityMaxRetries = getDurabilityMaxRetries(
        this.options.durabilityMaxRetries,
      )
      let completed = false
      let awaitingUser = false

      for (
        let durabilityAttempt = 0;
        durabilityAttempt <= durabilityMaxRetries;
        durabilityAttempt += 1
      ) {
        const preparedContext = prepareAgentContext({
          messages: run.messages,
          systemPrompt: getSystemPrompt(workspace, this.options.settings),
          tokenBudget: this.options.contextTokenBudget,
        })
        run = await this.options.runStore.setContext(
          run.id,
          preparedContext.context,
        )
        const messages = [...preparedContext.messages]
        const recoveryPrompt =
          durabilityAttempt > 0
            ? getDurabilityRetryPrompt(durabilityAttempt, durabilityMaxRetries)
            : getReplayRecoveryPrompt(run)

        if (recoveryPrompt) {
          messages.push({
            role: 'system',
            content: recoveryPrompt,
          })
        }

        const pendingMessages: Array<
          Omit<AgentRunMessage, 'id' | 'createdAt'>
        > = []

        for (
          let iteration = 0;
          iteration < totalToolIterations;
          iteration += 1
        ) {
          if (iteration === maxToolIterations) {
            messages.push({
              role: 'system',
              content: toolIterationRetryPrompt,
            })
          }

          const activeModel = model || run.model || endpoint.defaultModel
          const promptMessageCount = messages.length
          const metadataBase = {
            context: preparedContext.context,
            model: activeModel,
            attempt: durabilityAttempt + 1,
            iteration: iteration + 1,
            promptMessages: promptMessageCount,
            maxOutputTokens: this.options.outputTokenBudget,
          }
          const completionStartedAt = Date.now()
          const completion = await client.chat.completions.create({
            model: activeModel,
            messages: messages as never,
            tools: agentTools as never,
            tool_choice: 'auto',
            temperature: 0.2,
            max_tokens: this.options.outputTokenBudget,
          })
          const completionDurationMs = Date.now() - completionStartedAt

          const message = completion.choices[0]?.message as {
            content?: string | null
            tool_calls?: Array<{
              id: string
              function: {
                name: string
                arguments: string
              }
            }>
          } | null

          if (!message) {
            throw new Error('LLM returned an empty response')
          }

          messages.push({
            role: 'assistant',
            content: message.content || '',
            tool_calls: message.tool_calls,
          })

          if (!message.tool_calls?.length) {
            if (isToolIterationLimitContent(message.content || '')) {
              break
            }

            if (isContinuationOnlyContent(message.content || '')) {
              messages.push({
                role: 'system',
                content: thinkingOnlyContinuationPrompt,
              })
              continue
            }

            pendingMessages.push({
              role: 'assistant',
              content: message.content || '',
              metadata: createAgentMessageMetadata({
                ...metadataBase,
                durationMs: completionDurationMs,
                content: message.content || '',
              }),
            })
            awaitingUser = true
            break
          }

          const toolAdjacentAssistantContent = getToolAdjacentAssistantContent(
            message.content || '',
          )

          if (toolAdjacentAssistantContent) {
            pendingMessages.push({
              role: 'assistant',
              content: toolAdjacentAssistantContent,
              metadata: createAgentMessageMetadata({
                ...metadataBase,
                durationMs: completionDurationMs,
                content: toolAdjacentAssistantContent,
              }),
            })
          }

          for (const toolCall of message.tool_calls) {
            const toolStartedAt = Date.now()
            const result = await executeAgentTool(
              toolCall.function.name,
              toolCall.function.arguments,
              {
                settings: this.options.settings,
                workspace,
                githubToken,
              },
            )

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: toToolPromptContent(result.content),
            })

            pendingMessages.push({
              role: 'tool',
              toolName: toolCall.function.name,
              content: result.content,
              metadata: createAgentMessageMetadata({
                ...metadataBase,
                durationMs: Date.now() - toolStartedAt,
                toolInput: toolCall.function.arguments,
                toolOutput: result.content,
              }),
            })

            if (result.prUrl) {
              run = await this.options.runStore.setPullRequest(
                run.id,
                result.prUrl,
              )
            }

            if (result.resultSummary) {
              run = await this.options.runStore.setResultSummary(
                run.id,
                result.resultSummary,
              )
            }

            if (result.completed) {
              completed = true
            }

            if (result.awaitingUser) {
              awaitingUser = true
            }
          }

          if (completed || awaitingUser) {
            break
          }
        }

        if (pendingMessages.length > 0) {
          run = await this.options.runStore.appendMessages(
            run.id,
            pendingMessages,
          )
        }

        if (completed || awaitingUser) {
          break
        }

        if (durabilityAttempt >= durabilityMaxRetries) {
          run = await this.options.runStore.appendMessage(run.id, {
            role: 'assistant',
            content: toolIterationLimitMessage,
            metadata: createAgentMessageMetadata({
              context: preparedContext.context,
              model: model || run.model || endpoint.defaultModel,
              attempt: durabilityAttempt + 1,
              iteration: totalToolIterations,
              promptMessages: messages.length,
              maxOutputTokens: this.options.outputTokenBudget,
              content: toolIterationLimitMessage,
            }),
          })
          awaitingUser = true
          break
        }
      }

      run = await this.options.runStore.setStatus(
        run.id,
        completed ? 'completed' : 'awaiting_user',
      )
      await this.options.onRunFinished?.(run)
      return run
    } catch (error) {
      const message = getErrorMessage(error)
      await this.options.runStore.appendMessage(run.id, {
        role: 'system',
        content: message,
      })
      return this.options.runStore.setStatus(run.id, 'failed', message)
    }
  }

  async continueStream(
    runId: string,
    endpointId: string | undefined,
    model: string | undefined,
    emit: AgentRuntimeStreamEmit,
  ) {
    let run = await this.options.runStore.get(runId)
    const endpoint = await this.options.getEndpoint(
      endpointId || run.endpointId,
    )
    const workspace = await this.options.getWorkspace(run.workspaceId)
    const githubToken = await this.options.getGitHubToken()

    run = await this.options.runStore.setStatus(run.id, 'running')
    emit({ type: 'run', run })

    try {
      const client = createOpenAIClient(endpoint)
      const durabilityMaxRetries = getDurabilityMaxRetries(
        this.options.durabilityMaxRetries,
      )
      let completed = false
      let awaitingUser = false

      for (
        let durabilityAttempt = 0;
        durabilityAttempt <= durabilityMaxRetries;
        durabilityAttempt += 1
      ) {
        const preparedContext = prepareAgentContext({
          messages: run.messages,
          systemPrompt: getSystemPrompt(workspace, this.options.settings),
          tokenBudget: this.options.contextTokenBudget,
        })
        run = await this.options.runStore.setContext(
          run.id,
          preparedContext.context,
        )
        emit({ type: 'run', run })
        const messages = [...preparedContext.messages]
        const recoveryPrompt =
          durabilityAttempt > 0
            ? getDurabilityRetryPrompt(durabilityAttempt, durabilityMaxRetries)
            : getReplayRecoveryPrompt(run)

        if (recoveryPrompt) {
          messages.push({
            role: 'system',
            content: recoveryPrompt,
          })
        }

        for (
          let iteration = 0;
          iteration < totalToolIterations;
          iteration += 1
        ) {
          if (iteration === maxToolIterations) {
            messages.push({
              role: 'system',
              content: toolIterationRetryPrompt,
            })
          }

          let assistantContent = ''
          let assistantMetadataEmitted = false
          const toolCallsByIndex = new Map<number, PendingToolCall>()
          const activeModel = model || run.model || endpoint.defaultModel
          const promptMessageCount = messages.length
          const metadataBase = {
            context: preparedContext.context,
            model: activeModel,
            attempt: durabilityAttempt + 1,
            iteration: iteration + 1,
            promptMessages: promptMessageCount,
            maxOutputTokens: this.options.outputTokenBudget,
          }
          const completionStartedAt = Date.now()
          const stream = await client.chat.completions.create({
            model: activeModel,
            messages: messages as never,
            tools: agentTools as never,
            tool_choice: 'auto',
            temperature: 0.2,
            max_tokens: this.options.outputTokenBudget,
            stream: true,
          })

          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta as StreamDelta | undefined
            const content =
              typeof delta?.content === 'string' ? delta.content : ''

            if (content) {
              assistantContent += content
              emit({
                type: 'assistant_delta',
                content,
                metadata: assistantMetadataEmitted
                  ? undefined
                  : createAgentMessageMetadata(metadataBase),
              })
              assistantMetadataEmitted = true
            }

            for (const toolCallDelta of delta?.tool_calls || []) {
              mergeToolCallDelta(toolCallsByIndex, toolCallDelta)
            }
          }
          const completionDurationMs = Date.now() - completionStartedAt

          const toolCalls = Array.from(toolCallsByIndex.entries())
            .sort(([left], [right]) => left - right)
            .map(([, toolCall]) => ({
              id: toolCall.id || `call_${randomUUID().replace(/-/gu, '')}`,
              type: 'function',
              function: {
                name: toolCall.function.name || '',
                arguments: toolCall.function.arguments,
              },
            }))

          messages.push({
            role: 'assistant',
            content: assistantContent,
            tool_calls: toolCalls.length ? toolCalls : undefined,
          })

          if (!toolCalls.length) {
            if (isToolIterationLimitContent(assistantContent)) {
              emit({ type: 'assistant_reset' })
              break
            }

            if (isContinuationOnlyContent(assistantContent)) {
              messages.push({
                role: 'system',
                content: thinkingOnlyContinuationPrompt,
              })
              continue
            }

            if (!assistantContent.trim()) {
              const fallbackContent =
                'I need more context before I can continue.'
              run = await this.options.runStore.appendMessage(run.id, {
                role: 'assistant',
                content: fallbackContent,
                metadata: createAgentMessageMetadata({
                  ...metadataBase,
                  durationMs: completionDurationMs,
                  content: fallbackContent,
                }),
              })
              emit({ type: 'run', run })
            } else {
              run = await this.options.runStore.appendMessage(run.id, {
                role: 'assistant',
                content: assistantContent,
                metadata: createAgentMessageMetadata({
                  ...metadataBase,
                  durationMs: completionDurationMs,
                  content: assistantContent,
                }),
              })
              emit({ type: 'run', run })
            }

            awaitingUser = true
            break
          }

          const userFacingAssistantContent =
            getToolAdjacentAssistantContent(assistantContent)

          if (userFacingAssistantContent) {
            run = await this.options.runStore.appendMessage(run.id, {
              role: 'assistant',
              content: userFacingAssistantContent,
              metadata: createAgentMessageMetadata({
                ...metadataBase,
                durationMs: completionDurationMs,
                content: userFacingAssistantContent,
              }),
            })
            emit({ type: 'run', run })
          }

          for (const toolCall of toolCalls) {
            const toolName = toolCall.function.name
            emit({
              type: 'tool_start',
              toolName,
              toolInput: toolCall.function.arguments,
              metadata: createAgentMessageMetadata({
                ...metadataBase,
                toolInput: toolCall.function.arguments,
              }),
            })

            const toolStartedAt = Date.now()
            const result = await executeAgentTool(
              toolName,
              toolCall.function.arguments,
              {
                settings: this.options.settings,
                workspace,
                githubToken,
              },
            )

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: toToolPromptContent(result.content),
            })

            run = await this.options.runStore.appendMessage(run.id, {
              role: 'tool',
              toolName,
              content: result.content,
              metadata: createAgentMessageMetadata({
                ...metadataBase,
                durationMs: Date.now() - toolStartedAt,
                toolInput: toolCall.function.arguments,
                toolOutput: result.content,
              }),
            })

            if (result.prUrl) {
              run = await this.options.runStore.setPullRequest(
                run.id,
                result.prUrl,
              )
            }

            if (result.resultSummary) {
              run = await this.options.runStore.setResultSummary(
                run.id,
                result.resultSummary,
              )
            }

            emit({
              type: 'tool_result',
              toolName,
              content: result.content,
              metadata: createAgentMessageMetadata({
                ...metadataBase,
                durationMs: Date.now() - toolStartedAt,
                toolInput: toolCall.function.arguments,
                toolOutput: result.content,
              }),
            })
            emit({ type: 'run', run })

            if (result.completed) {
              completed = true
            }

            if (result.awaitingUser) {
              awaitingUser = true
            }
          }

          if (completed || awaitingUser) {
            break
          }
        }

        if (completed || awaitingUser) {
          break
        }

        if (durabilityAttempt >= durabilityMaxRetries) {
          run = await this.options.runStore.appendMessage(run.id, {
            role: 'assistant',
            content: toolIterationLimitMessage,
            metadata: createAgentMessageMetadata({
              context: preparedContext.context,
              model: model || run.model || endpoint.defaultModel,
              attempt: durabilityAttempt + 1,
              iteration: totalToolIterations,
              promptMessages: messages.length,
              maxOutputTokens: this.options.outputTokenBudget,
              content: toolIterationLimitMessage,
            }),
          })
          emit({ type: 'run', run })
          awaitingUser = true
          break
        }
      }

      run = await this.options.runStore.setStatus(
        run.id,
        completed ? 'completed' : 'awaiting_user',
      )
      await this.options.onRunFinished?.(run)
      emit({ type: 'done', run })
      return run
    } catch (error) {
      const message = getErrorMessage(error)
      await this.options.runStore.appendMessage(run.id, {
        role: 'system',
        content: message,
      })
      const failedRun = await this.options.runStore.setStatus(
        run.id,
        'failed',
        message,
      )
      emit({ type: 'error', error: message, run: failedRun })
      return failedRun
    }
  }
}

type StreamDelta = {
  content?: unknown
  tool_calls?: StreamToolCallDelta[]
}

type StreamToolCallDelta = {
  index?: number
  id?: string
  function?: {
    name?: string
    arguments?: string
  }
}

type PendingToolCall = {
  id?: string
  function: {
    name?: string
    arguments: string
  }
}

const mergeToolCallDelta = (
  toolCallsByIndex: Map<number, PendingToolCall>,
  delta: StreamToolCallDelta,
) => {
  const index = delta.index ?? 0
  const current = toolCallsByIndex.get(index) || {
    function: {
      arguments: '',
    },
  }

  if (delta.id) {
    current.id = delta.id
  }

  if (delta.function?.name) {
    current.function.name = delta.function.name
  }

  if (delta.function?.arguments) {
    current.function.arguments += delta.function.arguments
  }

  toolCallsByIndex.set(index, current)
}

const toToolPromptContent = (content: string) => {
  if (content.length <= toolPromptContentMaxChars) {
    return content
  }

  const omittedChars = content.length - toolPromptContentMaxChars
  return `${content.slice(0, toolPromptContentMaxChars)}\n\n[truncated ${omittedChars} characters for in-loop context budget]`
}

const agentTools = [
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
]

const executeAgentTool = async (
  name: string,
  rawArguments: string,
  context: ToolContext,
): Promise<AgentToolResult> => {
  const args = parseToolArguments(rawArguments)

  try {
    if (name === 'list_files') {
      const entries = await listWorkspaceFiles(
        context.workspace,
        getString(args.path) || '.',
      )
      return toolResult({ entries })
    }

    if (name === 'read_file') {
      const file = await readWorkspaceFile(
        context.workspace,
        requireString(args.path, 'path'),
      )
      return toolResult(formatReadFileResult(file, args))
    }

    if (name === 'write_file') {
      const file = await writeWorkspaceFile(
        context.workspace,
        requireString(args.path, 'path'),
        requireString(args.content, 'content'),
      )
      return toolResult({
        path: file.path,
        size: file.size,
        modifiedAt: file.modifiedAt,
        written: true,
      })
    }

    if (name === 'run_command') {
      const command = requireString(args.command, 'command')
      const extraEnv =
        command === 'git'
          ? getGitAuthEnv(
              context.workspace.repositoryUrl || '',
              context.githubToken,
            )
          : {}
      return toolResult(
        await executeSandboxCommand(
          context.settings,
          context.workspace,
          {
            command,
            args: Array.isArray(args.args) ? args.args.map(String) : [],
            cwd: getString(args.cwd),
            timeoutMs:
              typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
          },
          extraEnv,
        ),
      )
    }

    if (name === 'git_status') {
      return toolResult(
        await executeSandboxCommand(context.settings, context.workspace, {
          command: 'git',
          args: ['status', '--short', '--branch'],
        }),
      )
    }

    if (name === 'git_diff') {
      return toolResult(
        await executeSandboxCommand(context.settings, context.workspace, {
          command: 'git',
          args: ['diff', '--stat'],
        }),
      )
    }

    if (name === 'create_pull_request') {
      const token = context.githubToken

      if (!token) {
        throw new Error('GitHub PAT is not configured')
      }

      const url = await createPullRequest({
        workspace: context.workspace,
        token,
        title: requireString(args.title, 'title'),
        body: requireString(args.body, 'body'),
        head: requireString(args.head, 'head'),
        base: requireString(args.base, 'base'),
      })

      return { ...toolResult({ url }), prUrl: url }
    }

    if (name === 'request_user_input') {
      return {
        content: requireString(args.question, 'question'),
        awaitingUser: true,
      }
    }

    if (name === 'finish') {
      const summary = requireString(args.summary, 'summary')
      return {
        content: summary,
        resultSummary: summary,
        completed: true,
      }
    }

    throw new Error(`Unknown agent tool '${name}'`)
  } catch (error) {
    return toolResult({
      error: getErrorMessage(error),
    })
  }
}

const toolResult = (value: unknown): AgentToolResult => ({
  content: JSON.stringify(value, null, 2),
})

const parseToolArguments = (value: string) => {
  if (!value) {
    return {} as Record<string, unknown>
  }

  return JSON.parse(value) as Record<string, unknown>
}

const requireString = (value: unknown, name: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Tool argument '${name}' is required`)
  }

  return value
}

const getString = (value: unknown) => {
  return typeof value === 'string' && value.trim() ? value : undefined
}

const getNumber = (value: unknown) => {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

const getPositiveInteger = (value: unknown, fallback: number, max: number) => {
  const number = getNumber(value)

  if (number === undefined) {
    return fallback
  }

  return Math.min(Math.max(1, Math.floor(number)), max)
}

const getReplayRecoveryPrompt = (run: AgentRun) => {
  const recentMessages = run.messages.slice(-6)
  const recentText = recentMessages.map((message) => message.content).join('\n')
  const hasToolLimit = isToolIterationLimitContent(recentText)
  const assistantTail = recentMessages
    .filter((message) => message.role === 'assistant')
    .slice(-3)
  const thinkingOnlyTail =
    assistantTail.length > 0 &&
    assistantTail.every((message) => isContinuationOnlyContent(message.content))

  return hasToolLimit || thinkingOnlyTail ? replayRecoveryPrompt : undefined
}

const getDurabilityMaxRetries = (value: number | undefined) => {
  const parsed = value ?? defaultDurabilityMaxRetries

  if (!Number.isFinite(parsed)) {
    return defaultDurabilityMaxRetries
  }

  return Math.max(0, Math.floor(parsed))
}

const getDurabilityRetryPrompt = (attempt: number, maxRetries: number) => {
  return [
    'Durability auto-retry mode:',
    `- The previous tool pass exhausted its ${totalToolIterations} tool-call budget without finishing.`,
    `- This is automatic retry ${attempt} of ${maxRetries}.`,
    '- Continue from the persisted tool results and compacted context.',
    '- Do not repeat broad file listing or generic exploration.',
    '- Prefer targeted reads, concrete edits, focused verification, finish, or request_user_input if truly blocked.',
  ].join('\n')
}

const isContinuationOnlyContent = (content: string) => {
  return (
    isThinkingOnlyContent(content) ||
    isAgentProgressOnlyContent(stripThinking(content))
  )
}

const isToolIterationLimitContent = (content: string) => {
  return content.includes(toolIterationLimitMessage)
}

const isThinkingOnlyContent = (content: string) => {
  const trimmed = content.trim()

  if (!trimmed) {
    return false
  }

  return stripThinking(trimmed).length === 0
}

const stripThinking = (content: string) => {
  return content.replace(/<think>[\s\S]*?<\/think>/giu, '').trim()
}

const getToolAdjacentAssistantContent = (content: string) => {
  if (hasThinkingBlock(content)) {
    return content.trim()
  }

  const visibleContent = stripThinking(content)

  return isAgentProgressOnlyContent(visibleContent) ? '' : visibleContent
}

const hasThinkingBlock = (content: string) => /<think>/iu.test(content)

const isAgentProgressOnlyContent = (content: string) => {
  const normalized = content.replace(/\s+/gu, ' ').trim()

  if (!normalized || normalized.length > 320) {
    return false
  }

  return agentProgressPatterns.some((pattern) => pattern.test(normalized))
}

const agentProgressPatterns = [
  /^let me\b.+\b(?:check|try|use|inspect|look|read|run|find|list)\b/iu,
  /^i(?:'ll| will)\b.+\b(?:check|try|use|inspect|look|read|run|find|list)\b/iu,
  /^good,\s+i can see\b.+\blet me\b/iu,
  /^the (?:command|directory|file|path|issue)\b.+\blet me\b/iu,
  /^actually,\s+.+\blet me\b/iu,
]

const formatReadFileResult = (
  file: SandboxFileContent,
  args: Record<string, unknown>,
) => {
  const lines = file.content.split(/\r?\n/u)
  const totalLines = lines.length
  const startLine = getPositiveInteger(
    args.startLine,
    1,
    Math.max(1, totalLines),
  )
  const maxLines = getPositiveInteger(
    args.maxLines,
    defaultReadFileMaxLines,
    maxReadFileMaxLines,
  )
  const endLine = Math.min(totalLines, startLine + maxLines - 1)
  let content = lines.slice(startLine - 1, endLine).join('\n')
  let charTruncated = false

  if (content.length > maxReadFileContentChars) {
    content = `${content.slice(0, maxReadFileContentChars)}\n\n[truncated ${content.length - maxReadFileContentChars} characters from this line window]`
    charTruncated = true
  }

  return {
    path: file.path,
    size: file.size,
    modifiedAt: file.modifiedAt,
    startLine,
    endLine,
    totalLines,
    truncated: startLine > 1 || endLine < totalLines || charTruncated,
    content,
  }
}

const getSystemPrompt = (
  workspace: SandboxWorkspace,
  settings: SandboxSettings,
) => {
  const allowedCommands = settings.allowedCommands.join(', ')

  return [
    'You are a coding agent running inside an isolated sandbox workspace.',
    'Communicate with the user through the run thread. Ask for clarification only when blocked.',
    'Use tools to inspect files, edit files, run tests/builds, inspect git diff, commit, push, and create a pull request when requested.',
    'Do not claim that work is complete until you have inspected relevant files and run reasonable verification.',
    'Summarize tool findings in natural language. Never copy raw tool result JSON or [tool:name] transcript blocks into replies or reasoning.',
    "When a tool call is the next step, call the tool directly instead of emitting visible progress narration like 'Let me check...' or 'I will try...'.",
    'Use command tools with explicit command and args only. Never rely on shell metacharacters.',
    'Use read_file with startLine/maxLines for large files. Do not repeatedly read an entire large file when a smaller line window is enough.',
    `Allowed run_command commands: ${allowedCommands}. Prefer rg and sed for source search/slices; do not assume grep, head, awk, wc, or shell pipelines are available unless listed.`,
    `Workspace path: ${workspace.path}`,
    workspace.repositoryUrl
      ? `Repository: ${workspace.repositoryUrl}`
      : 'Repository: not configured',
  ].join('\n')
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown agent runtime error'
}
