import { randomUUID } from 'node:crypto'
import {
  agentRunListSchema,
  agentRunContextSchema,
  agentRunMessageSchema,
  agentRunMessageMetadataSchema,
  agentRunSchema,
  createAgentRunSchema,
  type AgentRun,
  type AgentRunContext,
  type AgentRunMessage,
  type AgentRunMessageMetadata,
  type AgentRuntime,
  type AgentRunStatus,
  type CreateAgentRunInput,
  type UpdateAgentRunRuntimeInput,
} from '@patchlane/shared'
import { AppDatabase, optionalString } from '../db/database'
import { readLegacyJson } from '../db/legacyJson'
import { notFound } from '../http/errors'
import { estimateTextTokens } from './agentContext'

type AgentRunRow = {
  id: string
  workspace_id: string
  endpoint_id: string | null
  model: string | null
  agent_runtime: AgentRuntime | null
  runtime_session_id: string | null
  title: string
  kind: AgentRun['kind']
  project_id: string | null
  issue_id: string | null
  subtask_id: string | null
  branch_name: string | null
  pr_url: string | null
  result_summary: string | null
  status: AgentRunStatus
  attempt: number | null
  queued_at: string | null
  started_at: string | null
  heartbeat_at: string | null
  lease_owner: string | null
  lease_expires_at: string | null
  cancellation_requested_at: string | null
  finished_at: string | null
  context_json: string | null
  error: string | null
  created_at: string
  updated_at: string
}

type AgentRunMessageRow = {
  id: string
  run_id: string
  role: AgentRunMessage['role']
  content: string
  tool_name: string | null
  tool_input_json: string | null
  metadata_json: string | null
  created_at: string
  sequence: number
}

type AgentRunEventRow = {
  id: string
  run_id: string
  source: string
  event_type: string | null
  item_type: string | null
  item_id: string | null
  payload_json: string
  created_at: string
  sequence: number
}

type UpsertAgentRunMessageInput = Omit<AgentRunMessage, 'createdAt'> & {
  createdAt?: string
}

export type AgentRunEvent = {
  id: string
  runId: string
  source: string
  eventType?: string
  itemType?: string
  itemId?: string
  payload: unknown
  createdAt: string
  sequence: number
}

export type AppendAgentRunEventInput = {
  source: string
  eventType?: string
  itemType?: string
  itemId?: string
  payload: unknown
  createdAt?: string
}

export type ClaimAgentExecutionInput = {
  leaseDurationMs?: number
  leaseOwner: string
  now?: Date
}

export type HeartbeatAgentExecutionInput = {
  leaseDurationMs?: number
  leaseOwner?: string
  now?: Date
}

export type ListAgentExecutionsFilter = {
  issueId?: string
  projectId?: string
  subtaskId?: string
}

const activeAgentExecutionStatuses: AgentRunStatus[] = [
  'idle',
  'running',
  'awaiting_user',
]

export class AgentRunStore {
  constructor(
    private readonly database: AppDatabase,
    private readonly legacyFilePath?: string,
  ) {
    this.ensureSeeded()
  }

  async list() {
    return this.listExecutions()
  }

  async listExecutions(filter: ListAgentExecutionsFilter = {}) {
    const conditions: string[] = []
    const args: string[] = []

    if (filter.projectId) {
      conditions.push('project_id = ?')
      args.push(filter.projectId)
    }

    if (filter.issueId) {
      conditions.push('issue_id = ?')
      args.push(filter.issueId)
    }

    if (filter.subtaskId) {
      conditions.push('subtask_id = ?')
      args.push(filter.subtaskId)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = this.database.sqlite
      .prepare(`SELECT * FROM agent_runs ${where} ORDER BY created_at DESC`)
      .all(...args) as unknown as AgentRunRow[]

    return agentRunListSchema.parse(rows.map((row) => this.toRun(row)))
  }

  async listForIssueTask(issueId: string, taskId: string) {
    const rows = this.database.sqlite
      .prepare(
        `
        SELECT * FROM agent_runs
        WHERE issue_id = ? AND subtask_id = ?
        ORDER BY attempt DESC, created_at DESC
      `,
      )
      .all(issueId, taskId) as unknown as AgentRunRow[]

    return agentRunListSchema.parse(rows.map((row) => this.toRun(row)))
  }

  async findActiveForIssueTask(issueId: string, taskId: string) {
    const row = this.database.sqlite
      .prepare(
        `
        SELECT * FROM agent_runs
        WHERE issue_id = ? AND subtask_id = ?
          AND status IN (${activeAgentExecutionStatuses.map(() => '?').join(', ')})
        ORDER BY created_at DESC
        LIMIT 1
      `,
      )
      .get(issueId, taskId, ...activeAgentExecutionStatuses) as
      | AgentRunRow
      | undefined

    return row ? this.toRun(row) : undefined
  }

  async get(id: string) {
    const run = this.getById(id)

    if (!run) {
      throw notFound(`Agent run '${id}' was not found`)
    }

    return run
  }

  async listEvents(id: string) {
    await this.get(id)

    const rows = this.database.sqlite
      .prepare(
        'SELECT * FROM agent_run_events WHERE run_id = ? ORDER BY sequence ASC',
      )
      .all(id) as unknown as AgentRunEventRow[]

    return rows.map(toEvent)
  }

  async find(id: string) {
    return this.getById(id)
  }

  async create(input: CreateAgentRunInput) {
    const parsed = createAgentRunSchema.parse(input)
    const now = new Date().toISOString()
    const attempt = this.getNextAttempt(parsed)
    const run = agentRunSchema.parse({
      id: randomUUID(),
      workspaceId: parsed.workspaceId,
      endpointId: parsed.endpointId,
      model: parsed.model,
      agentRuntime: parsed.agentRuntime ?? 'patchlane',
      title: parsed.title || getTitle(parsed.task),
      kind: parsed.kind ?? 'coding',
      projectId: parsed.projectId,
      issueId: parsed.issueId,
      subtaskId: parsed.subtaskId,
      branchName: parsed.branchName,
      status: 'idle',
      attempt,
      queuedAt: now,
      messages: [
        createMessage({
          role: 'user',
          content: parsed.task,
          createdAt: now,
        }),
      ],
      createdAt: now,
      updatedAt: now,
    })

    this.database.transaction(() => {
      this.insertRunWithMessages(run)
    })

    return run
  }

  async appendMessage(
    id: string,
    message: Omit<AgentRunMessage, 'id' | 'createdAt'>,
  ) {
    return this.update(id, (run) => {
      const now = new Date().toISOString()
      const nextRun =
        message.role === 'user'
          ? resetExecutionForQueuedRun(run, now)
          : { ...run, updatedAt: now }

      return {
        ...nextRun,
        messages: [...run.messages, createMessage(message)],
      }
    })
  }

  async appendMessages(
    id: string,
    messages: Array<Omit<AgentRunMessage, 'id' | 'createdAt'>>,
  ) {
    return this.update(id, (run) => {
      const now = new Date().toISOString()
      const hasUserMessage = messages.some((message) => message.role === 'user')
      const nextRun = hasUserMessage
        ? resetExecutionForQueuedRun(run, now)
        : { ...run, updatedAt: now }

      return {
        ...nextRun,
        messages: [
          ...run.messages,
          ...messages.map((message) => createMessage(message)),
        ],
      }
    })
  }

  async upsertMessage(id: string, message: UpsertAgentRunMessageInput) {
    return this.update(id, (run) => {
      const normalizedMessage = {
        ...message,
        id: this.getMessageIdForRun(id, message.id),
      }
      const existingIndex = run.messages.findIndex(
        (item) => item.id === normalizedMessage.id,
      )
      const existing =
        existingIndex >= 0 ? run.messages[existingIndex] : undefined
      const nextMessage = createMessageWithId(
        normalizedMessage,
        existing?.createdAt,
      )

      return {
        ...run,
        messages:
          existingIndex >= 0
            ? run.messages.map((item, index) =>
                index === existingIndex ? nextMessage : item,
              )
            : [...run.messages, nextMessage],
        updatedAt: new Date().toISOString(),
      }
    })
  }

  async appendEvent(id: string, input: AppendAgentRunEventInput) {
    await this.get(id)

    const event = this.database.transaction(() => {
      const sequenceRow = this.database.sqlite
        .prepare(
          'SELECT COALESCE(MAX(sequence), -1) + 1 AS sequence FROM agent_run_events WHERE run_id = ?',
        )
        .get(id) as { sequence: number }
      const event = {
        id: randomUUID(),
        runId: id,
        source: input.source,
        eventType: input.eventType,
        itemType: input.itemType,
        itemId: input.itemId,
        payload: input.payload,
        createdAt: input.createdAt || new Date().toISOString(),
        sequence: sequenceRow.sequence,
      }

      this.database.sqlite
        .prepare(
          `
          INSERT INTO agent_run_events (
            id, run_id, source, event_type, item_type, item_id, payload_json, created_at, sequence
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          event.id,
          event.runId,
          event.source,
          event.eventType ?? null,
          event.itemType ?? null,
          event.itemId ?? null,
          JSON.stringify(event.payload ?? null),
          event.createdAt,
          event.sequence,
        )

      return event
    })

    return event
  }

  async setStatus(id: string, status: AgentRunStatus, error?: string) {
    return this.update(id, (run) =>
      applyExecutionStatus(run, status, {
        error,
        now: new Date().toISOString(),
      }),
    )
  }

  async claimExecution(id: string, input: ClaimAgentExecutionInput) {
    const now = (input.now ?? new Date()).toISOString()
    const leaseExpiresAt = getLeaseExpiresAt(now, input.leaseDurationMs)

    return this.update(id, (run) =>
      applyExecutionStatus(run, 'running', {
        now,
        patch: {
          leaseExpiresAt,
          leaseOwner: input.leaseOwner,
        },
      }),
    )
  }

  async heartbeat(id: string, input: HeartbeatAgentExecutionInput = {}) {
    const now = (input.now ?? new Date()).toISOString()
    const leaseExpiresAt = getLeaseExpiresAt(now, input.leaseDurationMs)

    return this.update(id, (run) => ({
      ...run,
      heartbeatAt: now,
      leaseExpiresAt: leaseExpiresAt ?? run.leaseExpiresAt,
      leaseOwner: input.leaseOwner ?? run.leaseOwner,
      updatedAt: now,
    }))
  }

  async requestCancellation(id: string) {
    const now = new Date().toISOString()

    return this.update(id, (run) => ({
      ...run,
      cancellationRequestedAt: run.cancellationRequestedAt ?? now,
      updatedAt: now,
    }))
  }

  async listExpiredLeases(now = new Date()) {
    const rows = this.database.sqlite
      .prepare(
        `
        SELECT * FROM agent_runs
        WHERE status = 'running'
          AND lease_expires_at IS NOT NULL
          AND lease_expires_at < ?
        ORDER BY lease_expires_at ASC
      `,
      )
      .all(now.toISOString()) as unknown as AgentRunRow[]

    return agentRunListSchema.parse(rows.map((row) => this.toRun(row)))
  }

  async cancel(id: string, message = 'Agent run stopped by user.') {
    const now = new Date().toISOString()

    return this.update(id, (run) => {
      const shouldAppendMessage = !run.messages.some(
        (item) => item.role === 'system' && item.content === message,
      )

      return {
        ...run,
        cancellationRequestedAt: run.cancellationRequestedAt ?? now,
        error: message,
        finishedAt: run.finishedAt ?? now,
        leaseExpiresAt: undefined,
        leaseOwner: undefined,
        messages: shouldAppendMessage
          ? [
              ...run.messages,
              createMessage({
                role: 'system',
                content: message,
              }),
            ]
          : run.messages,
        status: 'cancelled',
        updatedAt: now,
      }
    })
  }

  async setContext(id: string, context: AgentRunContext) {
    return this.update(id, (run) => ({
      ...run,
      context,
      updatedAt: new Date().toISOString(),
    }))
  }

  async setPullRequest(id: string, prUrl: string) {
    return this.update(id, (run) => ({
      ...run,
      prUrl,
      updatedAt: new Date().toISOString(),
    }))
  }

  async updateRuntime(id: string, input: UpdateAgentRunRuntimeInput) {
    return this.update(id, (run) => ({
      ...resetExecutionForQueuedRun(run, new Date().toISOString()),
      agentRuntime: input.agentRuntime,
      endpointId: input.endpointId,
      model: input.model,
      runtimeSessionId: undefined,
    }))
  }

  async setRuntimeSessionId(id: string, runtimeSessionId: string) {
    return this.update(id, (run) => ({
      ...run,
      runtimeSessionId,
      updatedAt: new Date().toISOString(),
    }))
  }

  async setResultSummary(id: string, resultSummary: string) {
    return this.update(id, (run) => ({
      ...run,
      resultSummary,
      updatedAt: new Date().toISOString(),
    }))
  }

  async rewind(id: string, messageId: string) {
    return this.update(id, (run) => {
      const messageIndex = run.messages.findIndex(
        (message) => message.id === messageId,
      )

      if (messageIndex < 0) {
        throw notFound(`Agent run message '${messageId}' was not found`)
      }

      return {
        ...resetExecutionForQueuedRun(run, new Date().toISOString()),
        context: undefined,
        messages: run.messages.slice(0, messageIndex + 1),
        prUrl: undefined,
        resultSummary: undefined,
        runtimeSessionId: undefined,
      }
    })
  }

  async remove(id: string) {
    const result = this.database.sqlite
      .prepare('DELETE FROM agent_runs WHERE id = ?')
      .run(id)

    if (result.changes === 0) {
      throw notFound(`Agent run '${id}' was not found`)
    }
  }

  private update(id: string, updater: (run: AgentRun) => AgentRun) {
    const current = this.getById(id)

    if (!current) {
      throw notFound(`Agent run '${id}' was not found`)
    }

    const updated = agentRunSchema.parse(updater(current))

    this.database.transaction(() => {
      this.database.sqlite
        .prepare(
          `
          UPDATE agent_runs
          SET workspace_id = ?, endpoint_id = ?, model = ?, agent_runtime = ?, runtime_session_id = ?, title = ?, kind = ?, project_id = ?, issue_id = ?,
            subtask_id = ?, branch_name = ?, pr_url = ?, result_summary = ?, status = ?, attempt = ?, queued_at = ?, started_at = ?, heartbeat_at = ?,
            lease_owner = ?, lease_expires_at = ?, cancellation_requested_at = ?, finished_at = ?, context_json = ?, error = ?, updated_at = ?
          WHERE id = ?
        `,
        )
        .run(
          updated.workspaceId,
          updated.endpointId ?? null,
          updated.model ?? null,
          updated.agentRuntime,
          updated.runtimeSessionId ?? null,
          updated.title,
          updated.kind,
          updated.projectId ?? null,
          updated.issueId ?? null,
          updated.subtaskId ?? null,
          updated.branchName ?? null,
          updated.prUrl ?? null,
          updated.resultSummary ?? null,
          updated.status,
          updated.attempt ?? 1,
          updated.queuedAt ?? null,
          updated.startedAt ?? null,
          updated.heartbeatAt ?? null,
          updated.leaseOwner ?? null,
          updated.leaseExpiresAt ?? null,
          updated.cancellationRequestedAt ?? null,
          updated.finishedAt ?? null,
          updated.context ? JSON.stringify(updated.context) : null,
          updated.error ?? null,
          updated.updatedAt,
          updated.id,
        )

      this.database.sqlite
        .prepare('DELETE FROM agent_run_messages WHERE run_id = ?')
        .run(updated.id)
      this.insertMessages(updated.id, updated.messages)
    })

    return updated
  }

  private getById(id: string) {
    const row = this.database.sqlite
      .prepare('SELECT * FROM agent_runs WHERE id = ?')
      .get(id) as unknown as AgentRunRow | undefined
    return row ? this.toRun(row) : undefined
  }

  private getMessageIdForRun(runId: string, messageId: string) {
    const row = this.database.sqlite
      .prepare('SELECT run_id FROM agent_run_messages WHERE id = ?')
      .get(messageId) as { run_id: string } | undefined

    if (!row || row.run_id === runId) {
      return messageId
    }

    return `${runId}:${messageId}`
  }

  private toRun(row: AgentRunRow) {
    const messageRows = this.database.sqlite
      .prepare(
        'SELECT * FROM agent_run_messages WHERE run_id = ? ORDER BY sequence ASC',
      )
      .all(row.id) as unknown as AgentRunMessageRow[]

    return agentRunSchema.parse({
      id: row.id,
      workspaceId: row.workspace_id,
      endpointId: optionalString(row.endpoint_id),
      model: optionalString(row.model),
      agentRuntime: row.agent_runtime ?? 'patchlane',
      runtimeSessionId: optionalString(row.runtime_session_id),
      title: row.title,
      kind: row.kind ?? 'coding',
      projectId: optionalString(row.project_id),
      issueId: optionalString(row.issue_id),
      subtaskId: optionalString(row.subtask_id),
      branchName: optionalString(row.branch_name),
      prUrl: optionalString(row.pr_url),
      resultSummary: optionalString(row.result_summary),
      status: row.status,
      attempt: row.attempt ?? 1,
      queuedAt: optionalString(row.queued_at),
      startedAt: optionalString(row.started_at),
      heartbeatAt: optionalString(row.heartbeat_at),
      leaseOwner: optionalString(row.lease_owner),
      leaseExpiresAt: optionalString(row.lease_expires_at),
      cancellationRequestedAt: optionalString(row.cancellation_requested_at),
      finishedAt: optionalString(row.finished_at),
      messages: messageRows.map(toMessage),
      context: parseContext(row.context_json),
      error: optionalString(row.error),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
  }

  private ensureSeeded() {
    const countRow = this.database.sqlite
      .prepare('SELECT COUNT(*) AS count FROM agent_runs')
      .get() as { count: number }

    if (countRow.count > 0) {
      return
    }

    const legacyRuns = readLegacyJson(this.legacyFilePath, agentRunListSchema)

    if (!legacyRuns?.length) {
      return
    }

    this.database.transaction(() => {
      for (const run of legacyRuns) {
        this.insertRunWithMessages(run)
      }
    })
  }

  private insertRunWithMessages(run: AgentRun) {
    this.database.sqlite
      .prepare(
        `
        INSERT INTO agent_runs (
          id, workspace_id, endpoint_id, model, agent_runtime, runtime_session_id, title, kind, project_id, issue_id, subtask_id, branch_name, pr_url,
          result_summary, status, attempt, queued_at, started_at, heartbeat_at, lease_owner, lease_expires_at, cancellation_requested_at, finished_at,
          context_json, error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        run.id,
        run.workspaceId,
        run.endpointId ?? null,
        run.model ?? null,
        run.agentRuntime,
        run.runtimeSessionId ?? null,
        run.title,
        run.kind,
        run.projectId ?? null,
        run.issueId ?? null,
        run.subtaskId ?? null,
        run.branchName ?? null,
        run.prUrl ?? null,
        run.resultSummary ?? null,
        run.status,
        run.attempt ?? 1,
        run.queuedAt ?? null,
        run.startedAt ?? null,
        run.heartbeatAt ?? null,
        run.leaseOwner ?? null,
        run.leaseExpiresAt ?? null,
        run.cancellationRequestedAt ?? null,
        run.finishedAt ?? null,
        run.context ? JSON.stringify(run.context) : null,
        run.error ?? null,
        run.createdAt,
        run.updatedAt,
      )

    this.insertMessages(run.id, run.messages)
  }

  private getNextAttempt(
    input: Pick<CreateAgentRunInput, 'issueId' | 'kind' | 'subtaskId'>,
  ) {
    if (!input.issueId) {
      return 1
    }

    const kind = input.kind ?? 'coding'
    const row = input.subtaskId
      ? (this.database.sqlite
          .prepare(
            `
            SELECT COALESCE(MAX(attempt), 0) + 1 AS attempt
            FROM agent_runs
            WHERE issue_id = ? AND subtask_id = ?
          `,
          )
          .get(input.issueId, input.subtaskId) as { attempt: number })
      : (this.database.sqlite
          .prepare(
            `
            SELECT COALESCE(MAX(attempt), 0) + 1 AS attempt
            FROM agent_runs
            WHERE issue_id = ? AND subtask_id IS NULL AND kind = ?
          `,
          )
          .get(input.issueId, kind) as { attempt: number })

    return row.attempt
  }

  private insertMessages(runId: string, messages: AgentRunMessage[]) {
    const statement = this.database.sqlite.prepare(
      `
      INSERT INTO agent_run_messages (
        id, run_id, role, content, tool_name, tool_input_json, metadata_json, created_at, sequence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )

    messages.forEach((message, index) => {
      statement.run(
        message.id,
        runId,
        message.role,
        message.content,
        message.toolName ?? null,
        message.toolInput ? JSON.stringify(message.toolInput) : null,
        message.metadata ? JSON.stringify(message.metadata) : null,
        message.createdAt,
        index,
      )
    })
  }
}

const toMessage = (row: AgentRunMessageRow) => {
  const toolInput = parseToolInput(row.tool_input_json)
  const metadata = mergeDerivedMessageMetadata(
    parseMessageMetadata(row.metadata_json),
    getDerivedMessageMetadata(row),
  )

  return agentRunMessageSchema.parse({
    id: row.id,
    role: row.role,
    content: row.content,
    toolName: optionalString(row.tool_name),
    toolInput,
    metadata,
    createdAt: row.created_at,
  })
}

const toEvent = (row: AgentRunEventRow): AgentRunEvent => {
  return {
    id: row.id,
    runId: row.run_id,
    source: row.source,
    eventType: optionalString(row.event_type),
    itemType: optionalString(row.item_type),
    itemId: optionalString(row.item_id),
    payload: parseEventPayload(row.payload_json),
    createdAt: row.created_at,
    sequence: row.sequence,
  }
}

const parseContext = (value: string | null) => {
  if (!value) {
    return undefined
  }

  try {
    return agentRunContextSchema.parse(JSON.parse(value))
  } catch {
    return undefined
  }
}

const parseEventPayload = (value: string) => {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return { raw: value }
  }
}

const parseMessageMetadata = (value: string | null) => {
  if (!value) {
    return undefined
  }

  try {
    return agentRunMessageMetadataSchema.parse(JSON.parse(value))
  } catch {
    return undefined
  }
}

const getDerivedMessageMetadata = (
  row: AgentRunMessageRow,
): AgentRunMessageMetadata | undefined => {
  if (row.role === 'assistant' || row.role === 'system') {
    const text = splitAgentThinking(row.content)
    const content = text.content.trim()
    const reasoning = text.reasoning.trim()

    return hasMetadata({
      content: content ? getTextMetrics(content) : undefined,
      reasoning: reasoning ? getTextMetrics(reasoning) : undefined,
    })
  }

  if (row.role === 'tool') {
    return hasMetadata({
      tool: {
        input: row.tool_input_json
          ? getTextMetrics(row.tool_input_json)
          : undefined,
        output: row.content ? getTextMetrics(row.content) : undefined,
      },
    })
  }

  return undefined
}

const mergeDerivedMessageMetadata = (
  metadata: AgentRunMessageMetadata | undefined,
  derived: AgentRunMessageMetadata | undefined,
) => {
  if (!metadata) {
    return derived
  }

  if (!derived) {
    return metadata
  }

  const tool =
    metadata.tool || derived.tool
      ? {
          input: metadata.tool?.input ?? derived.tool?.input,
          output: metadata.tool?.output ?? derived.tool?.output,
        }
      : undefined

  return {
    ...metadata,
    content: metadata.content ?? derived.content,
    reasoning: metadata.reasoning ?? derived.reasoning,
    tool,
  }
}

const getTextMetrics = (value: string) => {
  return {
    characters: Array.from(value).length,
    estimatedTokens: estimateTextTokens(value),
  }
}

const hasMetadata = (metadata: AgentRunMessageMetadata) => {
  return metadata.content ||
    metadata.reasoning ||
    metadata.tool?.input ||
    metadata.tool?.output
    ? metadata
    : undefined
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

const parseToolInput = (value: string | null) => {
  if (!value) {
    return undefined
  }

  try {
    const parsed = JSON.parse(value) as unknown

    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

const createMessage = (
  message: Omit<AgentRunMessage, 'id' | 'createdAt'> & { createdAt?: string },
) => {
  return agentRunMessageSchema.parse({
    ...message,
    id: randomUUID(),
    createdAt: message.createdAt || new Date().toISOString(),
  })
}

const createMessageWithId = (
  message: UpsertAgentRunMessageInput,
  fallbackCreatedAt?: string,
) => {
  return agentRunMessageSchema.parse({
    ...message,
    createdAt:
      message.createdAt || fallbackCreatedAt || new Date().toISOString(),
  })
}

const applyExecutionStatus = (
  run: AgentRun,
  status: AgentRunStatus,
  {
    error,
    now,
    patch = {},
  }: {
    error?: string
    now: string
    patch?: Partial<AgentRun>
  },
) => {
  if (status === 'idle') {
    return resetExecutionForQueuedRun(
      {
        ...run,
        ...patch,
        error,
      },
      now,
    )
  }

  const terminal = isTerminalAgentRunStatus(status)
  const running = status === 'running'

  return {
    ...run,
    ...patch,
    error,
    finishedAt: terminal ? (run.finishedAt ?? now) : patch.finishedAt,
    heartbeatAt: running
      ? (patch.heartbeatAt ?? now)
      : (patch.heartbeatAt ?? run.heartbeatAt),
    leaseExpiresAt: running
      ? (patch.leaseExpiresAt ?? run.leaseExpiresAt)
      : undefined,
    leaseOwner: running ? (patch.leaseOwner ?? run.leaseOwner) : undefined,
    queuedAt: run.queuedAt,
    startedAt: running ? (run.startedAt ?? now) : run.startedAt,
    status,
    updatedAt: now,
  }
}

const resetExecutionForQueuedRun = (run: AgentRun, now: string): AgentRun => {
  return {
    ...run,
    cancellationRequestedAt: undefined,
    error: undefined,
    finishedAt: undefined,
    heartbeatAt: undefined,
    leaseExpiresAt: undefined,
    leaseOwner: undefined,
    queuedAt: now,
    startedAt: undefined,
    status: 'idle',
    updatedAt: now,
  }
}

const getLeaseExpiresAt = (
  now: string,
  leaseDurationMs: number | undefined,
) => {
  if (!leaseDurationMs) {
    return undefined
  }

  return new Date(new Date(now).getTime() + leaseDurationMs).toISOString()
}

const isTerminalAgentRunStatus = (status: AgentRunStatus) => {
  return status === 'completed' || status === 'cancelled' || status === 'failed'
}

const getTitle = (task: string) => {
  const firstLine = task.split('\n').find(Boolean) || 'Agent task'
  return firstLine.slice(0, 80)
}
