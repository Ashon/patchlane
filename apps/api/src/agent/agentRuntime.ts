import { randomUUID } from 'node:crypto'
import type {
  AgentRun,
  AgentRunContext,
  AgentRunMessage,
  AgentRunMessageMetadata,
  CreateIssueCommentInput,
  IssueComment,
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
import { getFinishRejection } from './agentFinishGuard'
import {
  getToolLoopNudgePrompt,
  isToolCallBlocked,
  type RecentToolCall,
} from './agentToolLoopNudge'
import type { AgentRunStore } from './agentRunStore'
import { createPullRequest } from './githubPr'
import {
  buildCodingSystemPrompt,
  buildDurabilityRetryPrompt,
  plainTextContinuationPrompt,
  postDiffCompletionPrompt,
  postEditCompletionPrompt,
  replayRecoveryPrompt,
  thinkingOnlyContinuationPrompt,
  toolIterationLimitMessage,
  toolIterationRetryPrompt,
} from './prompts/codingPrompts'
import { toToolPromptContent } from './prompts/toolResultPrompts'
import { agentTools } from './tools/agentToolDefinitions'

type AgentRuntimeOptions = {
  runStore: AgentRunStore
  settings: SandboxSettings
  contextTokenBudget?: number
  durabilityMaxRetries?: number
  outputTokenBudget?: number
  getEndpoint: (id?: string) => Promise<LlmEndpoint>
  getWorkspace: (id: string) => Promise<SandboxWorkspace>
  getGitHubToken: () => Promise<string | undefined>
  addIssueComment?: (
    issueId: string,
    input: CreateIssueCommentInput,
  ) => Promise<{ comment: IssueComment }>
  onRunFinished?: (run: AgentRun) => Promise<void>
}

type ToolContext = {
  settings: SandboxSettings
  workspace: SandboxWorkspace
  run: Pick<AgentRun, 'id' | 'issueId'>
  githubToken?: string
  addIssueComment?: AgentRuntimeOptions['addIssueComment']
}

type AgentToolResult = {
  content: string
  completed?: boolean
  awaitingUser?: boolean
  prUrl?: string
  resultSummary?: string
}

export type AgentRuntimeStreamEvent =
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

export type AgentRuntimeStreamEmit = (event: AgentRuntimeStreamEvent) => void

const maxToolIterations = 16
const retryToolIterations = 8
const totalToolIterations = maxToolIterations + retryToolIterations
const defaultDurabilityMaxRetries = 2
const defaultReadFileMaxLines = 240
const maxReadFileMaxLines = 500
const maxReadFileContentChars = 20_000
const toolDispatchSleepMs = 0

type AgentMessageMetadataInput = {
  context: AgentRunContext
  model?: string
  attempt: number
  iteration: number
  promptMessages: number
  maxOutputTokens?: number
  durationMs?: number
  usage?: AgentRunTokenUsage
  content?: string
  reasoning?: string
  toolInput?: string
  toolOutput?: string
}

type AgentRunTokenUsage = NonNullable<AgentRunMessageMetadata['usage']>
type RecordValue = Record<string, unknown>

const createAgentMessageMetadata = ({
  context,
  model,
  attempt,
  iteration,
  promptMessages,
  maxOutputTokens,
  durationMs,
  usage,
  content,
  reasoning,
  toolInput,
  toolOutput,
}: AgentMessageMetadataInput): AgentRunMessageMetadata => {
  const text = content === undefined ? undefined : splitAgentThinking(content)
  const reasoningText = [reasoning, text?.reasoning].filter(Boolean).join('')
  const contentText = text?.content.trim()

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
    usage,
    content: contentText ? getTextMetrics(contentText) : undefined,
    reasoning: reasoningText.trim()
      ? getTextMetrics(reasoningText.trim())
      : undefined,
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

const getCompletionTokenUsage = (
  value: unknown,
): AgentRunTokenUsage | undefined => {
  const payload = isRecord(value) && isRecord(value.usage) ? value.usage : value

  if (!isRecord(payload)) {
    return undefined
  }

  const promptDetails = getUsageDetails(payload, [
    'prompt_tokens_details',
    'promptTokensDetails',
    'input_tokens_details',
    'inputTokensDetails',
  ])
  const completionDetails = getUsageDetails(payload, [
    'completion_tokens_details',
    'completionTokensDetails',
    'output_tokens_details',
    'outputTokensDetails',
  ])
  const usage: AgentRunTokenUsage = {
    inputTokens: getFirstTokenCount(payload, [
      'prompt_tokens',
      'promptTokens',
      'input_tokens',
      'inputTokens',
    ]),
    outputTokens: getFirstTokenCount(payload, [
      'completion_tokens',
      'completionTokens',
      'output_tokens',
      'outputTokens',
    ]),
    totalTokens: getFirstTokenCount(payload, ['total_tokens', 'totalTokens']),
    reasoningTokens:
      getFirstTokenCount(completionDetails, [
        'reasoning_tokens',
        'reasoningTokens',
      ]) ??
      getFirstTokenCount(payload, ['reasoning_tokens', 'reasoningTokens']),
    cachedInputTokens:
      getFirstTokenCount(promptDetails, ['cached_tokens', 'cachedTokens']) ??
      getFirstTokenCount(payload, ['cached_tokens', 'cachedTokens']),
  }

  return Object.values(usage).some((count) => count !== undefined)
    ? usage
    : undefined
}

const getUsageDetails = (value: RecordValue, keys: string[]) => {
  for (const key of keys) {
    const details = value[key]

    if (isRecord(details)) {
      return details
    }
  }

  return undefined
}

const getFirstTokenCount = (value: RecordValue | undefined, keys: string[]) => {
  if (!value) {
    return undefined
  }

  for (const key of keys) {
    const count = getTokenCount(value[key])

    if (count !== undefined) {
      return count
    }
  }

  return undefined
}

const getTokenCount = (value: unknown) => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : undefined
}

const isRecord = (value: unknown): value is RecordValue => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isUnsupportedStreamUsageError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : ''

  return message.includes('stream_options') || message.includes('include_usage')
}

const getTextMetrics = (value: string) => {
  return {
    characters: Array.from(value).length,
    estimatedTokens: estimateTextTokens(value),
  }
}

const splitAgentThinking = (value: string) => {
  let content = value
  let reasoning = ''

  while (content.includes('<think>')) {
    const openIndex = content.indexOf('<think>')
    const before = content.slice(0, openIndex)
    const afterOpen = content.slice(openIndex + '<think>'.length)
    const closeIndex = afterOpen.indexOf('</think>')

    if (closeIndex < 0) {
      reasoning += afterOpen
      content = before
      break
    }

    reasoning += afterOpen.slice(0, closeIndex)
    content = `${before}${afterOpen.slice(closeIndex + '</think>'.length)}`
  }

  return {
    content: content.trimStart(),
    reasoning: reasoning.trim(),
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
          systemPrompt: buildCodingSystemPrompt({
            settings: this.options.settings,
            workspace,
          }),
          tokenBudget: this.options.contextTokenBudget,
        })
        run = await this.options.runStore.setContext(
          run.id,
          preparedContext.context,
        )
        const messages = [...preparedContext.messages]
        const recoveryPrompt =
          durabilityAttempt > 0
            ? buildDurabilityRetryPrompt({
                attempt: durabilityAttempt,
                maxRetries: durabilityMaxRetries,
                totalToolIterations,
              })
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
        const recentToolNames = getRecentToolNames(run.messages)

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
            tools: getAvailableAgentTools(recentToolNames) as never,
            tool_choice: 'auto',
            temperature: 0.2,
            max_tokens: this.options.outputTokenBudget,
          })
          const completionDurationMs = Date.now() - completionStartedAt
          const completionUsage = getCompletionTokenUsage(completion)

          const message = completion.choices[0]?.message as {
            content?: string | null
            reasoning?: unknown
            reasoning_content?: unknown
            reasoningContent?: unknown
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

          const assistantContent = mergeThinkingContent(
            message.content || '',
            getReasoningText(message),
          )

          messages.push({
            role: 'assistant',
            content: assistantContent,
            tool_calls: message.tool_calls,
          })

          if (!message.tool_calls?.length) {
            if (isToolIterationLimitContent(assistantContent)) {
              break
            }

            if (isContinuationOnlyContent(assistantContent)) {
              messages.push({
                role: 'system',
                content: thinkingOnlyContinuationPrompt,
              })
              continue
            }

            pendingMessages.push({
              role: 'assistant',
              content: assistantContent,
              metadata: createAgentMessageMetadata({
                ...metadataBase,
                durationMs: completionDurationMs,
                usage: completionUsage,
                content: assistantContent,
              }),
            })
            if (shouldAwaitUserAfterPlainTextAssistant(run)) {
              awaitingUser = true
              break
            }
            messages.push({
              role: 'system',
              content: plainTextContinuationPrompt,
            })
            continue
          }

          const toolAdjacentAssistantContent =
            getToolAdjacentAssistantContent(assistantContent)

          if (toolAdjacentAssistantContent) {
            pendingMessages.push({
              role: 'assistant',
              content: toolAdjacentAssistantContent,
              metadata: createAgentMessageMetadata({
                ...metadataBase,
                durationMs: completionDurationMs,
                usage: completionUsage,
                content: toolAdjacentAssistantContent,
              }),
            })
          }

          for (const toolCall of message.tool_calls) {
            const toolName = toolCall.function.name
            const toolInput = parseToolInputArguments(
              toolCall.function.arguments,
            )
            const toolStartedAt = Date.now()
            const result = isToolCallBlocked(recentToolNames, {
              name: toolName,
              input: toolInput,
            })
              ? getBlockedToolResult(toolName, toolInput)
              : await executeAgentTool(toolName, toolCall.function.arguments, {
                  settings: this.options.settings,
                  workspace,
                  run,
                  githubToken,
                  addIssueComment: this.options.addIssueComment,
                })

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: toToolPromptContent(result.content),
            })
            recentToolNames.push({
              name: toolName,
              input: toolInput,
            })
            const toolLoopNudge = getToolLoopNudgePrompt(recentToolNames)
            if (toolLoopNudge) {
              messages.push({
                role: 'system',
                content: toolLoopNudge,
              })
            }
            if (toolName === 'write_file') {
              messages.push({
                role: 'system',
                content: postEditCompletionPrompt,
              })
            }
            if (toolName === 'git_status' || toolName === 'git_diff') {
              messages.push({
                role: 'system',
                content: postDiffCompletionPrompt,
              })
            }

            pendingMessages.push({
              role: 'tool',
              toolName,
              toolInput,
              content: result.content,
              metadata: createAgentMessageMetadata({
                ...metadataBase,
                durationMs: Date.now() - toolStartedAt,
                usage: completionUsage,
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
      const failedRun = await this.options.runStore.setStatus(
        run.id,
        'failed',
        message,
      )
      await this.options.onRunFinished?.(failedRun)
      return failedRun
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
          systemPrompt: buildCodingSystemPrompt({
            settings: this.options.settings,
            workspace,
          }),
          tokenBudget: this.options.contextTokenBudget,
        })
        run = await this.options.runStore.setContext(
          run.id,
          preparedContext.context,
        )
        emit({ type: 'run', run })
        const messages = [...preparedContext.messages]
        const recentToolNames = getRecentToolNames(run.messages)
        const recoveryPrompt =
          durabilityAttempt > 0
            ? buildDurabilityRetryPrompt({
                attempt: durabilityAttempt,
                maxRetries: durabilityMaxRetries,
                totalToolIterations,
              })
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
          let reasoningBlockStarted = false
          let reasoningBlockClosed = false
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
          let completionUsage: AgentRunTokenUsage | undefined
          const streamRequest = {
            model: activeModel,
            messages: messages as never,
            tools: getAvailableAgentTools(recentToolNames) as never,
            tool_choice: 'auto',
            temperature: 0.2,
            max_tokens: this.options.outputTokenBudget,
            stream: true,
          } as const
          const stream = await client.chat.completions
            .create({
              ...streamRequest,
              stream_options: {
                include_usage: true,
              },
            })
            .catch((error: unknown) => {
              if (!isUnsupportedStreamUsageError(error)) {
                throw error
              }

              return client.chat.completions.create(streamRequest)
            })

          for await (const chunk of stream) {
            completionUsage = getCompletionTokenUsage(chunk) ?? completionUsage
            const delta = chunk.choices[0]?.delta as StreamDelta | undefined
            const content =
              typeof delta?.content === 'string' ? delta.content : ''
            const reasoning = getReasoningText(delta)

            if (reasoning) {
              const reasoningDelta = reasoningBlockStarted
                ? reasoning
                : `<think>${reasoning}`
              reasoningBlockStarted = true
              assistantContent += reasoningDelta
              emit({
                type: 'assistant_delta',
                content: reasoningDelta,
                metadata: assistantMetadataEmitted
                  ? undefined
                  : createAgentMessageMetadata(metadataBase),
              })
              assistantMetadataEmitted = true
            }

            if (content) {
              const contentDelta =
                reasoningBlockStarted && !reasoningBlockClosed
                  ? `</think>${content}`
                  : content
              reasoningBlockClosed = reasoningBlockStarted
              assistantContent += contentDelta
              emit({
                type: 'assistant_delta',
                content: contentDelta,
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
                  usage: completionUsage,
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
                  usage: completionUsage,
                  content: assistantContent,
                }),
              })
              emit({ type: 'run', run })
            }

            if (shouldAwaitUserAfterPlainTextAssistant(run)) {
              awaitingUser = true
              break
            }

            messages.push({
              role: 'system',
              content: plainTextContinuationPrompt,
            })
            continue
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
                usage: completionUsage,
                content: userFacingAssistantContent,
              }),
            })
            emit({ type: 'run', run })
          }

          for (const toolCall of toolCalls) {
            const toolName = toolCall.function.name
            const toolInput = parseToolInputArguments(
              toolCall.function.arguments,
            )
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
            const result = isToolCallBlocked(recentToolNames, {
              name: toolName,
              input: toolInput,
            })
              ? getBlockedToolResult(toolName, toolInput)
              : await executeAgentTool(toolName, toolCall.function.arguments, {
                  settings: this.options.settings,
                  workspace,
                  run,
                  githubToken,
                  addIssueComment: this.options.addIssueComment,
                })

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: toToolPromptContent(result.content),
            })
            recentToolNames.push({
              name: toolName,
              input: toolInput,
            })
            const toolLoopNudge = getToolLoopNudgePrompt(recentToolNames)
            if (toolLoopNudge) {
              messages.push({
                role: 'system',
                content: toolLoopNudge,
              })
            }
            if (toolName === 'write_file') {
              messages.push({
                role: 'system',
                content: postEditCompletionPrompt,
              })
            }
            if (toolName === 'git_status' || toolName === 'git_diff') {
              messages.push({
                role: 'system',
                content: postDiffCompletionPrompt,
              })
            }

            run = await this.options.runStore.appendMessage(run.id, {
              role: 'tool',
              toolName,
              toolInput,
              content: result.content,
              metadata: createAgentMessageMetadata({
                ...metadataBase,
                durationMs: Date.now() - toolStartedAt,
                usage: completionUsage,
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
                usage: completionUsage,
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
      await this.options.onRunFinished?.(failedRun)
      emit({ type: 'error', error: message, run: failedRun })
      return failedRun
    }
  }
}

type StreamDelta = {
  content?: unknown
  reasoning?: unknown
  reasoning_content?: unknown
  reasoningContent?: unknown
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

const getReasoningText = (value?: {
  reasoning?: unknown
  reasoning_content?: unknown
  reasoningContent?: unknown
}) => {
  if (typeof value?.reasoning === 'string') {
    return value.reasoning
  }

  if (typeof value?.reasoning_content === 'string') {
    return value.reasoning_content
  }

  if (typeof value?.reasoningContent === 'string') {
    return value.reasoningContent
  }

  return ''
}

const mergeThinkingContent = (content: string, reasoning: string) => {
  const trimmedReasoning = reasoning.trim()

  if (!trimmedReasoning || hasThinkingBlock(content)) {
    return content
  }

  return `<think>${trimmedReasoning}</think>${content}`
}

const parseToolInputArguments = (
  value: string,
): Record<string, unknown> | undefined => {
  if (!value) {
    return undefined
  }

  try {
    const parsed = JSON.parse(value) as unknown

    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { value: parsed }
  } catch {
    return { value }
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

const executeAgentTool = async (
  name: string,
  rawArguments: string,
  context: ToolContext,
): Promise<AgentToolResult> => {
  await sleep(toolDispatchSleepMs)
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

    if (name === 'add_issue_comment') {
      if (!context.run.issueId) {
        throw new Error('Issue comments are only available during issue runs')
      }

      if (!context.addIssueComment) {
        throw new Error('Issue comment storage is not configured')
      }

      const { comment } = await context.addIssueComment(context.run.issueId, {
        runId: context.run.id,
        author: 'agent',
        kind: getString(args.kind) as CreateIssueCommentInput['kind'],
        body: requireString(args.body, 'body'),
      })

      return toolResult({
        recorded: true,
        comment: {
          id: comment.id,
          issueId: comment.issueId,
          runId: comment.runId,
          author: comment.author,
          kind: comment.kind,
          body: comment.body,
          createdAt: comment.createdAt,
        },
      })
    }

    if (name === 'request_user_input') {
      return {
        content: requireString(args.question, 'question'),
        awaitingUser: true,
      }
    }

    if (name === 'finish') {
      const summary = requireString(args.summary, 'summary')
      const rejection = getFinishRejection({
        gitStatusShort: await getGitStatusShort(context),
        issueRun: Boolean(context.run.issueId),
        summary,
      })

      if (rejection) {
        return toolResult({
          error: rejection,
          completed: false,
          requiredNextStep:
            'Continue the run with implementation, verification, or a precise blocker question.',
        })
      }

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

const getBlockedToolResult = (
  toolName: string,
  input?: Record<string, unknown>,
): AgentToolResult => {
  return toolResult({
    error: `Tool '${toolName}' with the same input is temporarily disabled because it was repeated too many times in this run.`,
    blocked: true,
    input,
    requiredNextStep:
      'Use the existing context, call the same tool with a different focused input, edit, verify with a narrower command, call finish if complete, or ask one precise blocker question.',
  })
}

const getGitStatusShort = async (context: ToolContext) => {
  if (!context.run.issueId) {
    return undefined
  }

  const result = await executeSandboxCommand(
    context.settings,
    context.workspace,
    {
      command: 'git',
      args: ['status', '--short'],
    },
  )

  if (!result.ok) {
    return undefined
  }

  return result.stdout
}

const getAvailableAgentTools = (_recentToolCalls: RecentToolCall[]) => {
  return agentTools
}

const getRecentToolNames = (messages: AgentRunMessage[]): RecentToolCall[] => {
  return messages
    .filter((message) => message.role === 'tool' && message.toolName)
    .map((message) => ({
      name: message.toolName as string,
      input: message.toolInput,
    }))
    .slice(-12)
}

const sleep = (durationMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs)
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

export const shouldAwaitUserAfterPlainTextAssistant = (
  run: Pick<AgentRun, 'issueId'>,
) => !run.issueId

const getDurabilityMaxRetries = (value: number | undefined) => {
  const parsed = value ?? defaultDurabilityMaxRetries

  if (!Number.isFinite(parsed)) {
    return defaultDurabilityMaxRetries
  }

  return Math.max(0, Math.floor(parsed))
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
  return splitAgentThinking(content).content.trim()
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

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown agent runtime error'
}
