import { spawn } from 'node:child_process'
import type {
  AgentRun,
  AgentRunMessageMetadata,
  CreateIssueCommentInput,
  IssueComment,
  LlmEndpoint,
  LlmEndpointTestResult,
  SandboxWorkspace,
} from '@patchlane/shared'
import { estimateTextTokens } from './agentContext'
import {
  formatAgentIssueSummary,
  formatAgentResultSummary,
} from './agentSummary'
import { logger as rootLogger, type ApiLogger } from '../logging/logger'
import type { AgentRunStore } from './agentRunStore'
import type { AgentRuntimeStreamEmit } from './agentRuntime'
import {
  isAgentRunCancelledError,
  throwIfAgentRunCancelled,
} from './runtimeCancellation'

type CodexRuntimeOptions = {
  runStore: AgentRunStore
  getWorkspace: (id: string) => Promise<SandboxWorkspace>
  getConnector?: (id: string) => Promise<LlmEndpoint>
  addIssueComment?: (
    issueId: string,
    input: CreateIssueCommentInput,
  ) => Promise<{ comment: IssueComment }>
  onRunFinished?: (run: AgentRun) => Promise<void>
  command?: string
  commandArgs?: string[]
  timeoutMs?: number
  dangerouslyBypassSandbox?: boolean
  logger?: ApiLogger
}

type CodexCommandResult = {
  ok: boolean
  text: string
  stderr: string
  exitCode: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
  cancelled: boolean
  runtimeSessionId?: string
}

type RecordValue = Record<string, unknown>
type CodexWorkMessage = Omit<AgentRun['messages'][number], 'createdAt'> & {
  createdAt?: string
}
export type CodexWorkItemState = {
  input?: Record<string, unknown>
  startedAt: number
  toolName: string
}
export type CodexToolEvent = {
  id: string
  input?: Record<string, unknown>
  metadata?: AgentRunMessageMetadata
  output?: Record<string, unknown>
  toolName: string
}

const defaultTimeoutMs = 600_000
const maxCapturedOutputChars = 120_000
const maxPromptChars = 80_000

export class CodexRuntime {
  constructor(private readonly options: CodexRuntimeOptions) {}

  async continue(
    runId: string,
    _endpointId?: string,
    model?: string,
    signal?: AbortSignal,
  ) {
    return this.runCodex(runId, model, undefined, signal)
  }

  async continueStream(
    runId: string,
    _endpointId: string | undefined,
    model: string | undefined,
    emit: AgentRuntimeStreamEmit,
    signal?: AbortSignal,
  ) {
    return this.runCodex(runId, model, emit, signal)
  }

  private async runCodex(
    runId: string,
    model?: string,
    emit?: AgentRuntimeStreamEmit,
    signal?: AbortSignal,
  ) {
    let run = await this.options.runStore.get(runId)
    const workspace = await this.options.getWorkspace(run.workspaceId)
    const connector = await this.getConnector(run)
    const activeModel = model ?? run.model ?? getConnectorModel(connector)

    throwIfAgentRunCancelled(signal)
    run = await this.options.runStore.setStatus(run.id, 'running')
    emit?.({ type: 'run', run })
    const runLogger = this.getRunLogger(run, {
      cliRuntime: 'codex',
      endpointId: connector?.id,
      model: activeModel,
      streaming: Boolean(emit),
    })
    runLogger.info(
      {
        event: 'agent.run.started',
        status: run.status,
      },
      'Codex agent run started',
    )

    try {
      throwIfAgentRunCancelled(signal)
      const prompt = buildCodexPrompt({ run, workspace })
      const result = await this.executeCodex({
        emit,
        connector,
        model: activeModel,
        prompt,
        run,
        signal,
        workspace,
      })
      const previousRuntimeSessionId = run.runtimeSessionId
      run = await this.persistRuntimeSessionId(
        run,
        result.runtimeSessionId,
        emit,
      )
      if (
        run.runtimeSessionId &&
        run.runtimeSessionId !== previousRuntimeSessionId
      ) {
        runLogger.info(
          {
            event: 'agent.runtime_session.captured',
            runtimeSessionId: run.runtimeSessionId,
          },
          'Codex runtime session captured',
        )
      }

      if (result.cancelled) {
        return this.cancelRun(run, emit, runLogger)
      }

      if (!result.ok) {
        const message = getCodexFailureMessage(result)
        await this.options.runStore.appendMessage(run.id, {
          role: 'system',
          content: message,
        })
        const failedRun = await this.options.runStore.setStatus(
          run.id,
          'failed',
          message,
        )
        runLogger.error(
          {
            event: 'agent.run.failed',
            exitCode: result.exitCode,
            signal: result.signal,
            timedOut: result.timedOut,
            status: failedRun.status,
          },
          'Codex agent run failed',
        )
        await this.options.onRunFinished?.(failedRun)
        emit?.({ type: 'error', error: message, run: failedRun })
        return failedRun
      }

      const content = result.text.trim() || 'Codex run completed.'
      run = await this.options.runStore.appendMessage(run.id, {
        role: 'assistant',
        content,
        metadata: {
          request: {
            model: model ?? run.model,
          },
          content: getTextMetrics(content),
        },
      })
      run = await this.options.runStore.setResultSummary(
        run.id,
        formatAgentResultSummary(content),
      )
      run = await this.options.runStore.setStatus(run.id, 'completed')
      runLogger.info(
        {
          event: 'agent.run.finished',
          status: run.status,
          runtimeSessionId: run.runtimeSessionId,
        },
        'Codex agent run finished',
      )
      await this.addIssueSummaryComment(run, content)
      await this.options.onRunFinished?.(run)
      emit?.({ type: 'done', run })

      return run
    } catch (error) {
      if (isAgentRunCancelledError(error)) {
        return this.cancelRun(run, emit, runLogger)
      }

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
      runLogger.error(
        {
          event: 'agent.run.failed',
          err: error,
          status: failedRun.status,
        },
        'Codex agent run failed',
      )
      await this.options.onRunFinished?.(failedRun)
      emit?.({ type: 'error', error: message, run: failedRun })

      return failedRun
    }
  }

  private executeCodex({
    connector,
    emit,
    model,
    prompt,
    run,
    signal,
    workspace,
  }: {
    connector?: LlmEndpoint
    emit?: AgentRuntimeStreamEmit
    model?: string
    prompt: string
    run: AgentRun
    signal?: AbortSignal
    workspace: SandboxWorkspace
  }) {
    throwIfAgentRunCancelled(signal)
    const command =
      this.options.command ??
      connector?.opencodeCommand ??
      process.env.CODEX_COMMAND ??
      'codex'
    const args = buildCodexCommandArgs({
      commandArgs:
        this.options.commandArgs ??
        connector?.opencodeCommandArgs ??
        parseCommandArgs(process.env.CODEX_COMMAND_ARGS),
      dangerouslyBypassSandbox: shouldBypassSandbox(this.options, connector),
      model,
      prompt,
      run,
      workspace,
    })

    return new Promise<CodexCommandResult>((resolve) => {
      const child = spawn(command, args, {
        cwd: workspace.path,
        env: process.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdoutBuffer = ''
      let stderr = ''
      let assistantText = ''
      let latestCompletedAssistantText = ''
      let settled = false
      let timedOut = false
      let cancelled = false
      let runtimeSessionId = run.runtimeSessionId
      const activeWorkItems = new Map<string, CodexWorkItemState>()
      let persistChain = Promise.resolve()
      let persistError: unknown
      const timeoutMs = this.options.timeoutMs ?? defaultTimeoutMs
      const timeout = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
      }, timeoutMs)
      const abortChild = () => {
        cancelled = true
        child.kill('SIGTERM')
      }

      signal?.addEventListener('abort', abortChild, { once: true })

      const finish = (result: CodexCommandResult) => {
        if (settled) {
          return
        }

        settled = true
        clearTimeout(timeout)
        signal?.removeEventListener('abort', abortChild)
        void persistChain.then(() => {
          if (!persistError) {
            resolve(result)
            return
          }

          resolve({
            ...result,
            ok: false,
            stderr: [result.stderr, getErrorMessage(persistError)]
              .filter(Boolean)
              .join('\n'),
          })
        })
      }

      const enqueuePersistence = (operation: () => Promise<void>) => {
        persistChain = persistChain
          .then(async () => {
            if (persistError) {
              return
            }

            await operation()
          })
          .catch((error: unknown) => {
            persistError = persistError ?? error
          })
      }

      const persistRunEvent = (event: unknown, rawLine: string) => {
        enqueuePersistence(async () => {
          await this.options.runStore.appendEvent(
            run.id,
            getCodexRunEventInput(event, rawLine),
          )
        })
      }

      const persistWorkMessage = (message: CodexWorkMessage) => {
        enqueuePersistence(async () => {
          await this.options.runStore.upsertMessage(run.id, message)
        })
      }

      const consumeText = (text: string) => {
        const delta = getIncrementalDelta(assistantText, text)

        if (!delta) {
          assistantText = getLongerText(assistantText, text)
          return
        }

        assistantText += delta
        emit?.({
          type: 'assistant_delta',
          content: delta,
          metadata: {
            request: { model },
          },
        })
      }

      const consumeLine = (line: string) => {
        const trimmed = line.trim()

        if (!trimmed) {
          return
        }

        const event = parseCodexJsonLine(trimmed)
        persistRunEvent(event, trimmed)
        runtimeSessionId = runtimeSessionId ?? getCodexRuntimeSessionId(event)
        const completedAssistantText = event
          ? getCodexCompletedAssistantText(event)
          : undefined

        if (completedAssistantText) {
          latestCompletedAssistantText = completedAssistantText
        }

        const toolStart = getCodexToolStartEvent(event)

        if (toolStart) {
          const now = new Date().toISOString()
          activeWorkItems.set(toolStart.id, {
            input: toolStart.input,
            startedAt: Date.now(),
            toolName: toolStart.toolName,
          })
          persistWorkMessage({
            id: toolStart.id,
            role: 'tool',
            toolName: toolStart.toolName,
            toolInput: toolStart.input,
            content: `Running ${toolStart.toolName}...`,
            metadata: toolStart.metadata,
            createdAt: now,
          })
          emit?.({
            type: 'tool_start',
            toolCallId: toolStart.id,
            toolInput: toolStart.input
              ? JSON.stringify(toolStart.input)
              : undefined,
            toolName: toolStart.toolName,
            metadata: toolStart.metadata,
          })
        }

        const toolResult = getCodexToolResultEvent(event, activeWorkItems)

        if (toolResult) {
          const content = JSON.stringify(toolResult.output ?? {})
          persistWorkMessage({
            id: toolResult.id,
            role: 'tool',
            toolName: toolResult.toolName,
            toolInput: toolResult.input,
            content,
            metadata: toolResult.metadata,
          })
          emit?.({
            type: 'tool_result',
            toolCallId: toolResult.id,
            toolName: toolResult.toolName,
            content,
            metadata: toolResult.metadata,
          })
        }

        const text = event ? getCodexEventText(event) : trimmed

        if (text) {
          consumeText(text)
        }
      }

      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        stdoutBuffer += chunk
        const lines = stdoutBuffer.split(/\r?\n/u)
        stdoutBuffer = lines.pop() ?? ''

        for (const line of lines) {
          consumeLine(line)
        }
      })

      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => {
        stderr = truncateCapturedOutput(stderr + chunk)
      })

      child.on('error', (error) => {
        finish({
          ok: false,
          text: latestCompletedAssistantText || assistantText,
          stderr: getSpawnErrorMessage(command, error),
          exitCode: null,
          signal: null,
          timedOut,
          cancelled,
          runtimeSessionId,
        })
      })

      child.on('close', (exitCode, signal) => {
        if (stdoutBuffer.trim()) {
          consumeLine(stdoutBuffer)
        }

        finish({
          ok: exitCode === 0 && !timedOut,
          text: latestCompletedAssistantText || assistantText,
          stderr: stderr.trim(),
          exitCode,
          signal,
          timedOut,
          cancelled,
          runtimeSessionId,
        })
      })
    })
  }

  private async cancelRun(
    run: AgentRun,
    emit?: AgentRuntimeStreamEmit,
    runLogger = this.getRunLogger(run, { cliRuntime: 'codex' }),
  ) {
    const currentRun = await this.options.runStore.find(run.id)
    const alreadyCancelled = currentRun?.status === 'cancelled'
    const cancelledRun = alreadyCancelled
      ? currentRun
      : await this.options.runStore.cancel(run.id)

    if (!alreadyCancelled) {
      await this.options.onRunFinished?.(cancelledRun)
    }

    runLogger.warn(
      {
        event: 'agent.run.cancelled',
        status: cancelledRun.status,
      },
      'Codex agent run cancelled',
    )
    emit?.({ type: 'done', run: cancelledRun })

    return cancelledRun
  }

  private async persistRuntimeSessionId(
    run: AgentRun,
    runtimeSessionId: string | undefined,
    emit?: AgentRuntimeStreamEmit,
  ) {
    if (!runtimeSessionId || runtimeSessionId === run.runtimeSessionId) {
      return run
    }

    const updated = await this.options.runStore.setRuntimeSessionId(
      run.id,
      runtimeSessionId,
    )
    emit?.({ type: 'run', run: updated })

    return updated
  }

  private async addIssueSummaryComment(run: AgentRun, content: string) {
    if (!run.issueId || !this.options.addIssueComment) {
      return
    }

    await this.options.addIssueComment(run.issueId, {
      runId: run.id,
      author: 'agent',
      kind: 'summary',
      body: formatAgentIssueSummary(content),
    })
  }

  private async getConnector(run: AgentRun) {
    if (!run.endpointId || !this.options.getConnector) {
      return undefined
    }

    const connector = await this.options.getConnector(run.endpointId)

    if (connector.runtimeType !== 'codex_cli') {
      throw new Error(
        `Agent runtime '${connector.id}' is not a Codex CLI runtime`,
      )
    }

    if (!connector.enabled) {
      throw new Error(`Agent runtime '${connector.id}' is disabled`)
    }

    return connector
  }

  private getRunLogger(
    run: Pick<
      AgentRun,
      'agentRuntime' | 'id' | 'issueId' | 'kind' | 'subtaskId' | 'workspaceId'
    >,
    bindings: Record<string, unknown> = {},
  ) {
    return (this.options.logger ?? rootLogger).child({
      runId: run.id,
      agentRuntime: run.agentRuntime,
      runKind: run.kind,
      workspaceId: run.workspaceId,
      issueId: run.issueId,
      subtaskId: run.subtaskId,
      ...bindings,
    })
  }
}

export const buildCodexPrompt = ({
  run,
  workspace,
}: {
  run: AgentRun
  workspace: SandboxWorkspace
}) => {
  const messages = run.messages.map(formatRunMessage).join('\n\n')
  const isResearch = run.kind === 'research'
  const prompt = [
    'You are Codex running as the Patchlane coding backend.',
    '',
    isResearch
      ? 'This is a research-only run. Inspect the repository, but do not modify files, create commits, push, or continue into implementation.'
      : 'Work directly in the workspace below. Inspect the repository, make the requested changes, and run focused verification when possible.',
    isResearch
      ? 'Use targeted searches, file reads, and safe read-only commands to produce evidence-backed findings and an implementation plan.'
      : 'Do not wait for confirmation unless the task is blocked by missing credentials, destructive ambiguity, or unavailable external state.',
    isResearch
      ? 'When finished, respond in Markdown with short sections: Findings, Evidence, Recommendation, Verification, and Risks. Use bullets and avoid a progress log.'
      : 'When finished, respond in Markdown with short sections: Summary, Changes, Verification, and Risks. Use bullets and avoid a progress log.',
    '',
    `Workspace name: ${workspace.name}`,
    `Workspace path: ${workspace.path}`,
    workspace.branchName ? `Branch: ${workspace.branchName}` : undefined,
    run.kind ? `Run kind: ${run.kind}` : undefined,
    run.issueId ? `Issue id: ${run.issueId}` : undefined,
    run.subtaskId ? `Task id: ${run.subtaskId}` : undefined,
    '',
    'Patchlane conversation:',
    truncatePrompt(messages),
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n')

  return truncatePrompt(prompt)
}

export const parseCodexJsonLine = (line: string) => {
  try {
    const parsed = JSON.parse(line) as unknown
    return parsed
  } catch {
    return undefined
  }
}

export const getCodexEventText = (event: unknown): string | undefined => {
  if (typeof event === 'string') {
    return normalizeText(event)
  }

  if (Array.isArray(event)) {
    return joinText(event.map(getCodexEventText))
  }

  if (!isRecord(event)) {
    return undefined
  }

  const item = isRecord(event.item) ? event.item : undefined
  const itemType = item ? getString(item.type) : undefined

  if (item) {
    return isAssistantItemType(itemType)
      ? getCodexTextFromValue(item)
      : undefined
  }

  const eventType = getString(event.type)

  if (isAssistantItemType(eventType)) {
    return getCodexTextFromValue(event)
  }

  for (const key of [
    'delta',
    'text',
    'content',
    'message',
    'final_message',
    'last_message',
  ]) {
    const text = getString(event[key])

    if (text) {
      return text
    }

    const nestedText = getCodexEventText(event[key])

    if (nestedText) {
      return nestedText
    }
  }

  return undefined
}

export const getCodexCompletedAssistantText = (
  event: unknown,
): string | undefined => {
  if (!isCodexItemEvent(event, 'item.completed')) {
    return undefined
  }

  const itemType = getString(event.item.type)

  return isAssistantItemType(itemType)
    ? getCodexTextFromValue(event.item)
    : undefined
}

export const getCodexToolStartEvent = (
  event: unknown,
): CodexToolEvent | undefined => {
  if (!isCodexItemEvent(event, 'item.started')) {
    return undefined
  }

  const item = event.item
  const id = getCodexItemId(item)
  const toolName = getCodexToolName(item)

  if (!id || !toolName) {
    return undefined
  }

  const input = getCodexToolInput(item)

  return {
    id,
    input,
    toolName,
    metadata: input
      ? {
          tool: {
            input: getTextMetrics(JSON.stringify(input)),
          },
        }
      : undefined,
  }
}

export const getCodexRunEventInput = (event: unknown, rawLine: string) => {
  const item = isRecord(event) && isRecord(event.item) ? event.item : undefined

  return {
    source: 'codex_jsonl',
    eventType: isRecord(event) ? getString(event.type) : undefined,
    itemType: item ? getString(item.type) : undefined,
    itemId: item ? getCodexItemId(item) : undefined,
    payload: event ?? { raw: rawLine },
  }
}

export const getCodexToolResultEvent = (
  event: unknown,
  activeItems = new Map<string, CodexWorkItemState>(),
): CodexToolEvent | undefined => {
  if (!isCodexItemEvent(event, 'item.completed')) {
    return undefined
  }

  const item = event.item
  const id = getCodexItemId(item)
  const toolName = getCodexToolName(item)

  if (!id || !toolName) {
    return undefined
  }

  const activeItem = activeItems.get(id)
  const input = activeItem?.input ?? getCodexToolInput(item)
  const output = getCodexToolOutput(item, input)
  const durationMs = activeItem ? Date.now() - activeItem.startedAt : undefined
  const metadata: AgentRunMessageMetadata = {
    durationMs,
    tool: {
      input: input ? getTextMetrics(JSON.stringify(input)) : undefined,
      output: getTextMetrics(JSON.stringify(output)),
    },
  }

  activeItems.delete(id)

  return {
    id,
    input,
    metadata,
    output: durationMs === undefined ? output : { ...output, durationMs },
    toolName,
  }
}

export const getCodexSandboxMode = (run: Pick<AgentRun, 'kind'>) => {
  return run.kind === 'research' ? 'read-only' : 'workspace-write'
}

export const buildCodexCommandArgs = ({
  commandArgs,
  dangerouslyBypassSandbox,
  model,
  prompt,
  run,
  workspace,
}: {
  commandArgs: string[]
  dangerouslyBypassSandbox: boolean
  model?: string
  prompt: string
  run: Pick<AgentRun, 'kind' | 'runtimeSessionId'>
  workspace: Pick<SandboxWorkspace, 'path'>
}) => {
  const args = [...commandArgs, 'exec', '--json', '--cd', workspace.path]

  if (model) {
    args.push('--model', model)
  }

  if (dangerouslyBypassSandbox) {
    args.push('--dangerously-bypass-approvals-and-sandbox')
  } else {
    args.push('--sandbox', getCodexSandboxMode(run))
  }

  if (run.runtimeSessionId) {
    args.push('resume', run.runtimeSessionId, prompt)
  } else {
    args.push(prompt)
  }

  return args
}

export const getCodexRuntimeSessionId = (
  event: unknown,
): string | undefined => {
  return getCodexRuntimeSessionIdFromEvent(event, false)
}

const getCodexRuntimeSessionIdFromEvent = (
  event: unknown,
  allowNestedId: boolean,
): string | undefined => {
  if (!isRecord(event)) {
    return undefined
  }

  for (const key of [
    ...(allowNestedId ? ['id'] : []),
    'thread_id',
    'threadId',
    'session_id',
    'sessionId',
    'conversation_id',
    'conversationId',
  ]) {
    const value = getString(event[key])

    if (value) {
      return value
    }
  }

  for (const key of [
    'thread',
    'session',
    'conversation',
    'data',
    'payload',
    'properties',
  ]) {
    const value = getCodexRuntimeSessionIdFromEvent(event[key], true)

    if (value) {
      return value
    }
  }

  return undefined
}

export const testCodexRuntimeConnection = async (
  connector: LlmEndpoint,
): Promise<LlmEndpointTestResult> => {
  const startedAt = Date.now()
  const command =
    connector.opencodeCommand || process.env.CODEX_COMMAND || 'codex'
  const args = [
    ...(connector.opencodeCommandArgs.length
      ? connector.opencodeCommandArgs
      : parseCommandArgs(process.env.CODEX_COMMAND_ARGS)),
    '--version',
  ]

  try {
    const result = await runCommandForOutput(command, args, 60_000)

    return {
      ok: result.exitCode === 0,
      latencyMs: Date.now() - startedAt,
      models: result.stdout.trim() ? [`Codex ${result.stdout.trim()}`] : [],
      error:
        result.exitCode === 0
          ? undefined
          : result.stderr.trim() || `Codex exited with code ${result.exitCode}`,
    }
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      models: [],
      error: getErrorMessage(error),
    }
  }
}

const formatRunMessage = (message: AgentRun['messages'][number]) => {
  const label =
    message.role === 'tool' && message.toolName
      ? `tool:${message.toolName}`
      : message.role

  return `<${label}>\n${message.content}\n</${label}>`
}

const truncatePrompt = (value: string) => {
  if (value.length <= maxPromptChars) {
    return value
  }

  return [
    '[Earlier Patchlane conversation truncated.]',
    value.slice(value.length - maxPromptChars),
  ].join('\n')
}

const getIncrementalDelta = (current: string, next: string) => {
  if (!next) {
    return ''
  }

  if (next.startsWith(current)) {
    return next.slice(current.length)
  }

  if (current.endsWith(next)) {
    return ''
  }

  return next
}

const getLongerText = (current: string, next: string) =>
  next.length > current.length ? next : current

const getConnectorModel = (connector: LlmEndpoint | undefined) => {
  return connector?.defaultModel || undefined
}

const runCommandForOutput = (
  command: string,
  args: string[],
  timeoutMs: number,
) => {
  return new Promise<{
    exitCode: number | null
    stderr: string
    stdout: string
  }>((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('Codex version check timed out'))
    }, timeoutMs)

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout = truncateCapturedOutput(stdout + chunk)
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr = truncateCapturedOutput(stderr + chunk)
    })
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(new Error(getSpawnErrorMessage(command, error)))
    })
    child.on('close', (exitCode) => {
      clearTimeout(timeout)
      resolve({ exitCode, stderr, stdout })
    })
  })
}

const getCodexFailureMessage = (result: CodexCommandResult) => {
  if (result.timedOut) {
    return 'Codex run timed out.'
  }

  const details = result.stderr.trim()
  const status =
    result.exitCode === null
      ? 'Codex process failed to start'
      : `Codex exited with code ${result.exitCode}`
  const signal = result.signal ? ` and signal ${result.signal}` : ''

  return details ? `${status}${signal}:\n${details}` : `${status}${signal}.`
}

const getSpawnErrorMessage = (command: string, error: Error) => {
  if ('code' in error && error.code === 'ENOENT') {
    return `Codex command '${command}' was not found. Install Codex CLI or set CODEX_COMMAND.`
  }

  return error.message
}

const shouldBypassSandbox = (
  options: Pick<CodexRuntimeOptions, 'dangerouslyBypassSandbox'>,
  connector: LlmEndpoint | undefined,
) => {
  return (
    options.dangerouslyBypassSandbox ??
    connector?.opencodeDangerouslySkipPermissions ??
    isTruthy(process.env.CODEX_DANGEROUSLY_BYPASS_APPROVALS_AND_SANDBOX)
  )
}

const getTextMetrics = (value: string) => ({
  characters: Array.from(value).length,
  estimatedTokens: estimateTextTokens(value),
})

const truncateCapturedOutput = (value: string) =>
  value.length <= maxCapturedOutputChars
    ? value
    : value.slice(value.length - maxCapturedOutputChars)

const getCodexTextFromValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return normalizeText(value)
  }

  if (Array.isArray(value)) {
    return joinText(value.map(getCodexTextFromValue))
  }

  if (!isRecord(value)) {
    return undefined
  }

  for (const key of ['text', 'content', 'message', 'delta']) {
    const text = getString(value[key])

    if (text) {
      return text
    }

    const nestedText = getCodexTextFromValue(value[key])

    if (nestedText) {
      return nestedText
    }
  }

  return undefined
}

const isCodexItemEvent = (
  event: unknown,
  eventType: 'item.completed' | 'item.started',
): event is { item: RecordValue; type: string } => {
  return (
    isRecord(event) &&
    getString(event.type) === eventType &&
    isRecord(event.item)
  )
}

const getCodexItemId = (item: RecordValue) => {
  return getString(item.id)
}

const getCodexItemType = (item: RecordValue) => {
  return getString(item.type)
}

const getCodexToolName = (item: RecordValue): string | undefined => {
  const itemType = getCodexItemType(item)

  if (!itemType || isAssistantItemType(itemType)) {
    return undefined
  }

  if (itemType === 'command_execution') {
    return 'run_command'
  }

  if (itemType === 'file_change' || itemType === 'file_changes') {
    return 'codex_file_change'
  }

  if (itemType === 'web_search') {
    return 'codex_web_search'
  }

  if (itemType === 'plan_update') {
    return 'codex_plan_update'
  }

  if (itemType === 'mcp_tool_call') {
    return 'codex_mcp_tool_call'
  }

  if (itemType === 'reasoning') {
    return 'codex_reasoning'
  }

  return `codex_${itemType}`
}

const getCodexToolInput = (
  item: RecordValue,
): Record<string, unknown> | undefined => {
  if (getCodexItemType(item) === 'command_execution') {
    return {
      command: getString(item.command) ?? getString(item.cmd),
      status: getString(item.status),
    }
  }

  const input = pickDefined({
    arguments: item.arguments,
    command: item.command,
    files: item.files,
    name: item.name,
    path: item.path,
    query: item.query,
    status: item.status,
    title: item.title,
    tool: item.tool,
  })

  return Object.keys(input).length ? input : undefined
}

const getCodexToolOutput = (
  item: RecordValue,
  input?: Record<string, unknown>,
): Record<string, unknown> => {
  const itemType = getCodexItemType(item)
  const status = getString(item.status)

  if (itemType === 'command_execution') {
    const command =
      getString(item.command) ??
      getString(item.cmd) ??
      getString(input?.command)
    const stdout =
      getString(item.output) ??
      getString(item.stdout) ??
      getString(item.text) ??
      ''
    const stderr = getString(item.stderr) ?? getString(item.error) ?? ''
    const exitCode = getNumber(item.exit_code) ?? getNumber(item.exitCode)

    return pickDefined({
      ok: !isCodexFailedStatus(status),
      command,
      stdout,
      stderr,
      exitCode,
      status,
    })
  }

  return pickDefined({
    ok: !isCodexFailedStatus(status),
    type: itemType,
    status,
    output: item.output,
    text: item.text,
    message: item.message,
    files: item.files,
    changes: item.changes,
    result: item.result,
    error: item.error,
  })
}

const isCodexFailedStatus = (status: string | undefined) => {
  return status === 'failed' || status === 'error' || status === 'cancelled'
}

const pickDefined = (value: Record<string, unknown>) => {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  )
}

const joinText = (values: Array<string | undefined>) => {
  const text = values.filter(Boolean).join('')

  return text.length > 0 ? text : undefined
}

const normalizeText = (value: string) => {
  return value.length > 0 ? value : undefined
}

const getString = (value: unknown) =>
  typeof value === 'string' ? normalizeText(value) : undefined

const getNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const isRecord = (value: unknown): value is RecordValue => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isAssistantItemType = (value: string | undefined) => {
  return (
    value === 'agent_message' ||
    value === 'assistant_message' ||
    value === 'assistant' ||
    value === 'message'
  )
}

const isTruthy = (value: string | undefined) => {
  return value === '1' || value?.toLowerCase() === 'true'
}

const parseCommandArgs = (value: string | undefined) => {
  if (!value) {
    return []
  }

  const parsed = JSON.parse(value) as unknown

  if (
    Array.isArray(parsed) &&
    parsed.every((item) => typeof item === 'string')
  ) {
    return parsed
  }

  throw new Error('CODEX_COMMAND_ARGS must be a JSON string array')
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown Codex runtime error'
}
