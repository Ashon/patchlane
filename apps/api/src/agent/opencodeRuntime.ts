import { spawn } from 'node:child_process'
import type {
  AgentRun,
  CreateIssueCommentInput,
  IssueComment,
  LlmEndpoint,
  LlmEndpointTestResult,
  SandboxWorkspace,
} from '@patchlane/shared'
import { estimateTextTokens } from './agentContext'
import type { AgentRunStore } from './agentRunStore'
import type { AgentRuntimeStreamEmit } from './agentRuntime'

type OpenCodeRuntimeOptions = {
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
  dangerouslySkipPermissions?: boolean
}

type OpenCodeCommandResult = {
  ok: boolean
  text: string
  stderr: string
  exitCode: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
}

type RecordValue = Record<string, unknown>

const defaultTimeoutMs = 600_000
const maxCapturedOutputChars = 120_000
const maxPromptChars = 80_000

export class OpenCodeRuntime {
  constructor(private readonly options: OpenCodeRuntimeOptions) {}

  async continue(runId: string, _endpointId?: string, model?: string) {
    return this.runOpenCode(runId, model)
  }

  async continueStream(
    runId: string,
    _endpointId: string | undefined,
    model: string | undefined,
    emit: AgentRuntimeStreamEmit,
  ) {
    return this.runOpenCode(runId, model, emit)
  }

  private async runOpenCode(
    runId: string,
    model?: string,
    emit?: AgentRuntimeStreamEmit,
  ) {
    let run = await this.options.runStore.get(runId)
    const workspace = await this.options.getWorkspace(run.workspaceId)
    const connector = await this.getConnector(run)

    run = await this.options.runStore.setStatus(run.id, 'running')
    emit?.({ type: 'run', run })

    try {
      const prompt = buildOpenCodePrompt({ run, workspace })
      const result = await this.executeOpenCode({
        emit,
        connector,
        model: model ?? run.model ?? getConnectorModel(connector),
        prompt,
        workspace,
      })

      if (!result.ok) {
        const message = getOpenCodeFailureMessage(result)
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
        emit?.({ type: 'error', error: message, run: failedRun })
        return failedRun
      }

      const content = result.text.trim() || 'OpenCode run completed.'
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
        summarize(content),
      )
      run = await this.options.runStore.setStatus(run.id, 'completed')
      await this.addIssueSummaryComment(run, content)
      await this.options.onRunFinished?.(run)
      emit?.({ type: 'done', run })

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
      emit?.({ type: 'error', error: message, run: failedRun })

      return failedRun
    }
  }

  private executeOpenCode({
    connector,
    emit,
    model,
    prompt,
    workspace,
  }: {
    connector?: LlmEndpoint
    emit?: AgentRuntimeStreamEmit
    model?: string
    prompt: string
    workspace: SandboxWorkspace
  }) {
    const command =
      this.options.command ??
      connector?.opencodeCommand ??
      process.env.OPENCODE_COMMAND ??
      'opencode'
    const args = [
      ...(this.options.commandArgs ??
        connector?.opencodeCommandArgs ??
        parseCommandArgs(process.env.OPENCODE_COMMAND_ARGS)),
      'run',
      '--format',
      'json',
      '--dir',
      workspace.path,
    ]

    if (model) {
      args.push('--model', model)
    }

    if (
      this.options.dangerouslySkipPermissions ??
      connector?.opencodeDangerouslySkipPermissions ??
      isTruthy(process.env.OPENCODE_DANGEROUSLY_SKIP_PERMISSIONS)
    ) {
      args.push('--dangerously-skip-permissions')
    }

    args.push(prompt)

    return new Promise<OpenCodeCommandResult>((resolve) => {
      const child = spawn(command, args, {
        cwd: workspace.path,
        env: process.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdoutBuffer = ''
      let stderr = ''
      let assistantText = ''
      let settled = false
      let timedOut = false
      const timeoutMs = this.options.timeoutMs ?? defaultTimeoutMs
      const timeout = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
      }, timeoutMs)

      const finish = (result: OpenCodeCommandResult) => {
        if (settled) {
          return
        }

        settled = true
        clearTimeout(timeout)
        resolve(result)
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

        const event = parseOpenCodeJsonLine(trimmed)
        const text = event ? getOpenCodeEventText(event) : trimmed

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
          text: assistantText,
          stderr: getSpawnErrorMessage(command, error),
          exitCode: null,
          signal: null,
          timedOut,
        })
      })

      child.on('close', (exitCode, signal) => {
        if (stdoutBuffer.trim()) {
          consumeLine(stdoutBuffer)
        }

        finish({
          ok: exitCode === 0 && !timedOut,
          text: assistantText,
          stderr: stderr.trim(),
          exitCode,
          signal,
          timedOut,
        })
      })
    })
  }

  private async addIssueSummaryComment(run: AgentRun, content: string) {
    if (!run.issueId || !this.options.addIssueComment) {
      return
    }

    await this.options.addIssueComment(run.issueId, {
      runId: run.id,
      author: 'agent',
      kind: 'summary',
      body: summarize(content, 3_800),
    })
  }

  private async getConnector(run: AgentRun) {
    if (!run.endpointId || !this.options.getConnector) {
      return undefined
    }

    const connector = await this.options.getConnector(run.endpointId)

    if (connector.runtimeType !== 'opencode_cli') {
      throw new Error(
        `Agent runtime '${connector.id}' is not an OpenCode CLI runtime`,
      )
    }

    if (!connector.enabled) {
      throw new Error(`Agent runtime '${connector.id}' is disabled`)
    }

    return connector
  }
}

export const buildOpenCodePrompt = ({
  run,
  workspace,
}: {
  run: AgentRun
  workspace: SandboxWorkspace
}) => {
  const messages = run.messages.map(formatRunMessage).join('\n\n')
  const prompt = [
    'You are OpenCode running as the Patchlane coding backend.',
    '',
    'Work directly in the workspace below. Inspect the repository, make the requested changes, and run focused verification when possible.',
    'Do not wait for confirmation unless the task is blocked by missing credentials, destructive ambiguity, or unavailable external state.',
    'When finished, respond with a concise summary of changes, verification, and any remaining risks.',
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

export const parseOpenCodeJsonLine = (line: string) => {
  try {
    const parsed = JSON.parse(line) as unknown
    return parsed
  } catch {
    return undefined
  }
}

export const getOpenCodeEventText = (event: unknown): string | undefined => {
  if (typeof event === 'string') {
    return normalizeText(event)
  }

  if (Array.isArray(event)) {
    return joinText(event.map(getOpenCodeEventText))
  }

  if (!isRecord(event)) {
    return undefined
  }

  for (const key of [
    'delta',
    'text',
    'content',
    'summary',
    'output',
    'result',
    'data',
  ]) {
    const text = getString(event[key])

    if (text) {
      return text
    }

    const nestedText = getOpenCodeEventText(event[key])

    if (nestedText) {
      return nestedText
    }
  }

  const messageText = getOpenCodeEventText(event.message)

  if (messageText) {
    return messageText
  }

  const partText = getOpenCodeEventText(event.part)

  if (partText) {
    return partText
  }

  const choicesText = getOpenCodeEventText(event.choices)

  if (choicesText) {
    return choicesText
  }

  const partsText = getOpenCodeEventText(event.parts)

  if (partsText) {
    return partsText
  }

  return undefined
}

export const testOpenCodeRuntimeConnection = async (
  connector: LlmEndpoint,
): Promise<LlmEndpointTestResult> => {
  const startedAt = Date.now()
  const command =
    connector.opencodeCommand || process.env.OPENCODE_COMMAND || 'opencode'
  const args = [
    ...(connector.opencodeCommandArgs.length
      ? connector.opencodeCommandArgs
      : parseCommandArgs(process.env.OPENCODE_COMMAND_ARGS)),
    '--version',
  ]

  try {
    const result = await runCommandForOutput(command, args, 60_000)

    return {
      ok: result.exitCode === 0,
      latencyMs: Date.now() - startedAt,
      models: result.stdout.trim() ? [`OpenCode ${result.stdout.trim()}`] : [],
      error:
        result.exitCode === 0
          ? undefined
          : result.stderr.trim() ||
            `OpenCode exited with code ${result.exitCode}`,
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
      reject(new Error('OpenCode version check timed out'))
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

const getOpenCodeFailureMessage = (result: OpenCodeCommandResult) => {
  if (result.timedOut) {
    return 'OpenCode run timed out.'
  }

  const details = result.stderr.trim()
  const status =
    result.exitCode === null
      ? 'OpenCode process failed to start'
      : `OpenCode exited with code ${result.exitCode}`
  const signal = result.signal ? ` and signal ${result.signal}` : ''

  return details ? `${status}${signal}:\n${details}` : `${status}${signal}.`
}

const getSpawnErrorMessage = (command: string, error: Error) => {
  if ('code' in error && error.code === 'ENOENT') {
    return `OpenCode command '${command}' was not found. Install OpenCode or set OPENCODE_COMMAND.`
  }

  return error.message
}

const summarize = (value: string, maxLength = 2_000) => {
  const summary = value.trim().replace(/\s+/gu, ' ')

  return summary.length <= maxLength
    ? summary
    : `${summary.slice(0, maxLength - 1)}...`
}

const getTextMetrics = (value: string) => ({
  characters: Array.from(value).length,
  estimatedTokens: estimateTextTokens(value),
})

const truncateCapturedOutput = (value: string) =>
  value.length <= maxCapturedOutputChars
    ? value
    : value.slice(value.length - maxCapturedOutputChars)

const joinText = (values: Array<string | undefined>) => {
  const text = values.filter(Boolean).join('')

  return text.length > 0 ? text : undefined
}

const normalizeText = (value: string) => {
  return value.length > 0 ? value : undefined
}

const getString = (value: unknown) =>
  typeof value === 'string' ? normalizeText(value) : undefined

const isRecord = (value: unknown): value is RecordValue => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

  throw new Error('OPENCODE_COMMAND_ARGS must be a JSON string array')
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown OpenCode runtime error'
}
