import { randomUUID } from 'node:crypto'
import {
  type AgentRun,
  agentProjectListSchema,
  agentProjectSchema,
  createAgentProjectSchema,
  createIssueCommentSchema,
  createIssueSchema,
  issueSubtaskSchema,
  issueCommentSchema,
  issueEventSchema,
  issueListSchema,
  issueSchema,
  replaceIssueSubtasksSchema,
  updateAgentProjectSchema,
  updateIssueSchema,
  updateIssueSubtaskSchema,
  type AgentProject,
  type CreateAgentProjectInput,
  type CreateIssueCommentInput,
  type CreateIssueInput,
  type CreateIssueSubtaskInput,
  type Issue,
  type IssueComment,
  type IssueEvent,
  type IssueStatus,
  type IssueSubtask,
  type ReplaceIssueSubtasksInput,
  type UpdateAgentProjectInput,
  type UpdateIssueInput,
  type UpdateIssueSubtaskInput,
} from '@patchlane/shared'
import { AppDatabase, optionalString } from '../db/database'
import { notFound } from '../http/errors'

type IssueAnalysisOptions = {
  endpointId?: string
  analysis?: string
  eventMessage?: string
  planningRunId?: string
  requirementRunId?: string
}

type IssueRunStartOptions = {
  branchName?: string
  endpointId?: string
  workspaceId?: string
}

type AgentProjectRow = {
  id: string
  name: string
  description: string
  repository_url: string | null
  repository_ref: string | null
  workspace_id: string | null
  default_endpoint_id: string | null
  branch_prefix: string
  created_at: string
  updated_at: string
}

type IssueRow = {
  id: string
  title: string
  description: string
  project_id: string
  workspace_id: string | null
  endpoint_id: string | null
  requirement_run_id: string | null
  planning_run_id: string | null
  agent_run_id: string | null
  status: IssueStatus
  priority: Issue['priority']
  analysis: string | null
  branch_name: string | null
  pr_url: string | null
  created_at: string
  updated_at: string
}

type IssueEventRow = {
  id: string
  issue_id: string
  type: IssueEvent['type']
  message: string
  created_at: string
}

type IssueCommentRow = {
  id: string
  issue_id: string
  run_id: string | null
  author: IssueComment['author']
  kind: IssueComment['kind']
  body: string
  created_at: string
}

type IssueSubtaskRow = {
  id: string
  issue_id: string
  title: string
  description: string | null
  status: IssueSubtask['status']
  kind: IssueSubtask['kind']
  sequence: number
  depends_on_json: string
  agent_run_id: string | null
  result_summary: string | null
  created_at: string
  updated_at: string
}

export class IssueStore {
  constructor(private readonly database: AppDatabase) {}

  async listProjects() {
    const rows = this.database.sqlite
      .prepare('SELECT * FROM agent_projects ORDER BY name ASC')
      .all() as unknown as AgentProjectRow[]

    return agentProjectListSchema.parse(rows.map((row) => this.toProject(row)))
  }

  async getProject(id: string) {
    const project = this.getProjectById(id)

    if (!project) {
      throw notFound(`Project '${id}' was not found`)
    }

    return project
  }

  async createProject(input: CreateAgentProjectInput) {
    const parsed = createAgentProjectSchema.parse(input)
    const now = new Date().toISOString()
    const project = agentProjectSchema.parse({
      ...parsed,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    })

    this.database.transaction(() => {
      this.insertProject(project)
    })

    return project
  }

  async updateProject(id: string, input: UpdateAgentProjectInput) {
    const current = await this.getProject(id)
    const parsed = updateAgentProjectSchema.parse(input)
    const updated = agentProjectSchema.parse({
      ...current,
      ...parsed,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    })

    this.database.transaction(() => {
      this.database.sqlite
        .prepare(
          `
          UPDATE agent_projects
          SET name = ?, description = ?, repository_url = ?, repository_ref = ?, workspace_id = ?,
            default_endpoint_id = ?, branch_prefix = ?, updated_at = ?
          WHERE id = ?
        `,
        )
        .run(
          updated.name,
          updated.description,
          updated.repositoryUrl ?? null,
          updated.repositoryRef ?? null,
          updated.workspaceId ?? null,
          updated.defaultEndpointId ?? null,
          updated.branchPrefix,
          updated.updatedAt,
          updated.id,
        )
    })

    return updated
  }

  async removeProject(id: string) {
    const result = this.database.sqlite
      .prepare('DELETE FROM agent_projects WHERE id = ?')
      .run(id)

    if (result.changes === 0) {
      throw notFound(`Project '${id}' was not found`)
    }
  }

  async listIssues() {
    const rows = this.database.sqlite
      .prepare('SELECT * FROM issues ORDER BY updated_at DESC')
      .all() as unknown as IssueRow[]

    return issueListSchema.parse(rows.map((row) => this.toIssue(row)))
  }

  async getIssue(id: string) {
    const issue = this.getIssueById(id)

    if (!issue) {
      throw notFound(`Issue '${id}' was not found`)
    }

    return issue
  }

  async createIssue(input: CreateIssueInput) {
    const parsed = createIssueSchema.parse(input)
    await this.getProject(parsed.projectId)

    const now = new Date().toISOString()
    const issue = issueSchema.parse({
      ...parsed,
      id: randomUUID(),
      status: 'backlog',
      createdAt: now,
      updatedAt: now,
      events: [],
    })
    const event = createEvent({
      issueId: issue.id,
      type: 'created',
      message: 'Issue registered.',
    })
    const next = { ...issue, events: [event] }

    this.database.transaction(() => {
      this.insertIssue(next)
      this.insertEvents([event])
    })

    return next
  }

  async updateIssue(
    id: string,
    input: UpdateIssueInput,
    eventMessage = 'Issue updated.',
  ) {
    const current = await this.getIssue(id)
    const parsed = updateIssueSchema.parse(input)
    const statusChanged = Boolean(
      parsed.status && parsed.status !== current.status,
    )
    const updated = issueSchema.parse({
      ...current,
      ...parsed,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
      events: current.events,
    })
    const event = createEvent({
      issueId: updated.id,
      type: statusChanged ? 'status_changed' : 'updated',
      message: statusChanged
        ? `Status changed to ${updated.status}.`
        : eventMessage,
    })

    this.database.transaction(() => {
      this.updateIssueRow(updated)
      this.insertEvents([event])
    })

    return { ...updated, events: [...updated.events, event] }
  }

  async getIssueAnalysisContext(id: string, endpointId?: string) {
    const issue = await this.getIssue(id)
    const project = await this.getProject(issue.projectId)

    return {
      issue,
      project,
      workspaceId: issue.workspaceId ?? project.workspaceId,
      branchName:
        issue.branchName ??
        buildBranchName(project.branchPrefix, issue.title, issue.id),
      endpointId: endpointId ?? issue.endpointId ?? project.defaultEndpointId,
    }
  }

  async analyzeIssue(id: string, options: IssueAnalysisOptions = {}) {
    const { branchName, endpointId, issue, project, workspaceId } =
      await this.getIssueAnalysisContext(id, options.endpointId)
    const analysis =
      options.analysis ??
      buildIssueAnalysis({ branchName, issue, project, workspaceId })
    const updated = issueSchema.parse({
      ...issue,
      status: 'ready',
      endpointId,
      workspaceId,
      requirementRunId: options.requirementRunId ?? issue.requirementRunId,
      planningRunId: options.planningRunId ?? issue.planningRunId,
      branchName,
      analysis,
      updatedAt: new Date().toISOString(),
    })
    const event = createEvent({
      issueId: id,
      type: 'analyzed',
      message: options.eventMessage ?? `Analyzed for ${branchName}.`,
    })

    this.database.transaction(() => {
      this.updateIssueRow(updated)
      this.insertEvents([event])
    })

    return { ...updated, events: [...updated.events, event] }
  }

  async markRunStarted(
    id: string,
    agentRunId: string,
    options: IssueRunStartOptions = {},
  ) {
    const issue = await this.getIssue(id)
    const updated = issueSchema.parse({
      ...issue,
      status: 'running',
      agentRunId,
      endpointId: options.endpointId ?? issue.endpointId,
      workspaceId: options.workspaceId ?? issue.workspaceId,
      branchName: options.branchName ?? issue.branchName,
      updatedAt: new Date().toISOString(),
    })
    const event = createEvent({
      issueId: id,
      type: 'run_started',
      message: `Agent run ${agentRunId.slice(0, 8)} started.`,
    })

    this.database.transaction(() => {
      this.updateIssueRow(updated)
      this.insertEvents([event])
    })

    return { ...updated, events: [...updated.events, event] }
  }

  async markRunFinished(
    run: Pick<
      AgentRun,
      'branchName' | 'id' | 'issueId' | 'prUrl' | 'status' | 'workspaceId'
    >,
  ) {
    if (!run.issueId) {
      return undefined
    }

    const issue = await this.getIssue(run.issueId).catch(() => undefined)

    if (!issue || issue.agentRunId !== run.id) {
      return issue
    }

    const nextStatus = getIssueStatusFromRun(run)
    const updated = issueSchema.parse({
      ...issue,
      branchName: run.branchName ?? issue.branchName,
      prUrl: run.prUrl ?? issue.prUrl,
      status: nextStatus,
      workspaceId: run.workspaceId ?? issue.workspaceId,
      updatedAt: new Date().toISOString(),
    })
    const statusChanged = updated.status !== issue.status
    const event = createEvent({
      issueId: issue.id,
      type: statusChanged ? 'status_changed' : 'updated',
      message: getRunFinishedEventMessage(run, updated.status),
    })

    this.database.transaction(() => {
      this.updateIssueRow(updated)
      this.insertEvents([event])
    })

    return { ...updated, events: [...updated.events, event] }
  }

  async unlinkAgentRunReferences(run: {
    id: string
    issueId?: string
    kind?: string
    workspaceId?: string
  }) {
    if (!run.issueId) {
      return undefined
    }

    const issue = await this.getIssue(run.issueId).catch(() => undefined)

    if (!issue) {
      return undefined
    }

    const clearsRequirement = issue.requirementRunId === run.id
    const clearsPlanning = issue.planningRunId === run.id
    const clearsCoding = issue.agentRunId === run.id
    const linkedSubtask = issue.subtasks.find(
      (subtask) => subtask.agentRunId === run.id,
    )

    if (
      !clearsRequirement &&
      !clearsPlanning &&
      !clearsCoding &&
      !linkedSubtask
    ) {
      return issue
    }

    const updatedSubtasks = linkedSubtask
      ? issue.subtasks.map((subtask) =>
          subtask.id === linkedSubtask.id
            ? issueSubtaskSchema.parse({
                ...subtask,
                agentRunId: undefined,
                status:
                  subtask.status === 'running' ||
                  subtask.status === 'awaiting_user'
                    ? 'pending'
                    : subtask.status,
                updatedAt: new Date().toISOString(),
              })
            : subtask,
        )
      : issue.subtasks
    const shouldResetStatus =
      (clearsCoding &&
        (issue.status === 'running' || issue.status === 'awaiting_user')) ||
      ((clearsRequirement || clearsPlanning) && issue.status === 'planning')
    const updated = issueSchema.parse({
      ...issue,
      requirementRunId: clearsRequirement ? undefined : issue.requirementRunId,
      planningRunId: clearsPlanning ? undefined : issue.planningRunId,
      agentRunId: clearsCoding ? undefined : issue.agentRunId,
      workspaceId:
        clearsCoding && issue.workspaceId === run.workspaceId
          ? undefined
          : issue.workspaceId,
      status: linkedSubtask
        ? getIssueStatusFromSubtasks(
            updatedSubtasks,
            shouldResetStatus
              ? issue.analysis
                ? 'ready'
                : 'backlog'
              : issue.status,
          )
        : shouldResetStatus
          ? issue.analysis
            ? 'ready'
            : 'backlog'
          : issue.status,
      subtasks: updatedSubtasks,
      updatedAt: new Date().toISOString(),
    })
    const event = createEvent({
      issueId: issue.id,
      type: 'updated',
      message: `Unlinked deleted agent task ${run.id.slice(0, 8)}.`,
    })

    this.database.transaction(() => {
      this.updateIssueRow(updated)
      if (linkedSubtask) {
        const updatedSubtask = updatedSubtasks.find(
          (subtask) => subtask.id === linkedSubtask.id,
        )

        if (updatedSubtask) {
          this.updateSubtaskRow(updatedSubtask)
        }
      }
      this.insertEvents([event])
    })

    return { ...updated, events: [...updated.events, event] }
  }

  async clearMissingAgentRunReference(
    id: string,
    runId: string,
    eventMessage?: string,
  ) {
    const issue = await this.getIssue(id)

    if (issue.agentRunId !== runId) {
      return issue
    }

    const shouldResetStatus =
      issue.status === 'running' || issue.status === 'awaiting_user'
    const updated = issueSchema.parse({
      ...issue,
      agentRunId: undefined,
      status: shouldResetStatus
        ? issue.analysis
          ? 'ready'
          : 'backlog'
        : issue.status,
      updatedAt: new Date().toISOString(),
    })
    const event = createEvent({
      issueId: issue.id,
      type: 'updated',
      message:
        eventMessage ?? `Unlinked missing coding task ${runId.slice(0, 8)}.`,
    })

    this.database.transaction(() => {
      this.updateIssueRow(updated)
      this.insertEvents([event])
    })

    return { ...updated, events: [...updated.events, event] }
  }

  async addIssueComment(issueId: string, input: CreateIssueCommentInput) {
    const issue = await this.getIssue(issueId)
    const parsed = createIssueCommentSchema.parse(input)
    const comment = createComment({
      ...parsed,
      issueId: issue.id,
    })
    const updated = issueSchema.parse({
      ...issue,
      updatedAt: comment.createdAt,
      comments: [...issue.comments, comment],
    })

    this.database.transaction(() => {
      this.updateIssueRow(updated)
      this.insertComments([comment])
    })

    return { issue: updated, comment }
  }

  async replaceIssueSubtasks(
    issueId: string,
    input: ReplaceIssueSubtasksInput,
  ) {
    const issue = await this.getIssue(issueId)
    const parsed = replaceIssueSubtasksSchema.parse(input)
    const now = new Date().toISOString()
    const subtasks = parsed.subtasks.map((subtask, index) =>
      createSubtask({
        ...subtask,
        issueId: issue.id,
        sequence: index,
        createdAt: now,
        updatedAt: now,
      }),
    )
    const updated = issueSchema.parse({
      ...issue,
      status:
        issue.status === 'backlog' || issue.status === 'planning'
          ? 'ready'
          : issue.status,
      subtasks,
      updatedAt: now,
    })
    const event = createEvent({
      issueId: issue.id,
      type: 'updated',
      message: `Issue work plan updated with ${subtasks.length} subtasks.`,
      createdAt: now,
    })

    this.database.transaction(() => {
      this.updateIssueRow(updated)
      this.database.sqlite
        .prepare('DELETE FROM issue_subtasks WHERE issue_id = ?')
        .run(issue.id)
      this.insertSubtasks(subtasks)
      this.insertEvents([event])
    })

    return { ...updated, events: [...updated.events, event] }
  }

  async updateIssueSubtask(
    issueId: string,
    subtaskId: string,
    input: UpdateIssueSubtaskInput,
    eventMessage = `Subtask ${subtaskId.slice(0, 8)} updated.`,
  ) {
    const issue = await this.getIssue(issueId)
    const parsed = updateIssueSubtaskSchema.parse(input)
    const currentSubtask = issue.subtasks.find(
      (subtask) => subtask.id === subtaskId,
    )

    if (!currentSubtask) {
      throw notFound(`Issue subtask '${subtaskId}' was not found`)
    }

    const now = new Date().toISOString()
    const updatedSubtask = issueSubtaskSchema.parse({
      ...currentSubtask,
      ...parsed,
      id: currentSubtask.id,
      issueId: currentSubtask.issueId,
      createdAt: currentSubtask.createdAt,
      updatedAt: now,
    })
    const subtasks = issue.subtasks.map((subtask) =>
      subtask.id === updatedSubtask.id ? updatedSubtask : subtask,
    )
    const updated = issueSchema.parse({
      ...issue,
      status: getIssueStatusFromSubtasks(subtasks, issue.status),
      subtasks,
      updatedAt: now,
    })
    const event = createEvent({
      issueId: issue.id,
      type: 'updated',
      message: eventMessage,
      createdAt: now,
    })

    this.database.transaction(() => {
      this.updateIssueRow(updated)
      this.updateSubtaskRow(updatedSubtask)
      this.insertEvents([event])
    })

    return {
      issue: { ...updated, events: [...updated.events, event] },
      subtask: updatedSubtask,
    }
  }

  async markSubtaskRunStarted(
    issueId: string,
    subtaskId: string,
    agentRunId: string,
  ) {
    return this.updateIssueSubtask(
      issueId,
      subtaskId,
      {
        agentRunId,
        status: 'running',
      },
      `Subtask ${subtaskId.slice(0, 8)} started agent run ${agentRunId.slice(0, 8)}.`,
    )
  }

  async markSubtaskRunFinished(
    run: Pick<
      AgentRun,
      'id' | 'issueId' | 'resultSummary' | 'status' | 'subtaskId'
    >,
  ) {
    if (!run.issueId || !run.subtaskId) {
      return undefined
    }

    const issue = await this.getIssue(run.issueId).catch(() => undefined)

    if (!issue) {
      return undefined
    }

    const subtask = issue.subtasks.find((item) => item.id === run.subtaskId)

    if (!subtask) {
      return { issue, subtask: undefined }
    }

    if (subtask.agentRunId && subtask.agentRunId !== run.id) {
      return { issue, subtask }
    }

    return this.updateIssueSubtask(
      issue.id,
      subtask.id,
      {
        agentRunId: run.id,
        resultSummary: run.resultSummary,
        status: getSubtaskStatusFromRun(run.status),
      },
      `Subtask ${subtask.id.slice(0, 8)} finished with status ${run.status}.`,
    )
  }

  private getProjectById(id: string) {
    const row = this.database.sqlite
      .prepare('SELECT * FROM agent_projects WHERE id = ?')
      .get(id) as unknown as AgentProjectRow | undefined

    return row ? this.toProject(row) : undefined
  }

  private insertProject(project: AgentProject) {
    this.database.sqlite
      .prepare(
        `
        INSERT INTO agent_projects (
          id, name, description, repository_url, repository_ref, workspace_id,
          default_endpoint_id, branch_prefix, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        project.id,
        project.name,
        project.description,
        project.repositoryUrl ?? null,
        project.repositoryRef ?? null,
        project.workspaceId ?? null,
        project.defaultEndpointId ?? null,
        project.branchPrefix,
        project.createdAt,
        project.updatedAt,
      )
  }

  private toProject(row: AgentProjectRow) {
    return agentProjectSchema.parse({
      id: row.id,
      name: row.name,
      description: row.description,
      repositoryUrl: optionalString(row.repository_url),
      repositoryRef: optionalString(row.repository_ref),
      workspaceId: optionalString(row.workspace_id),
      defaultEndpointId: optionalString(row.default_endpoint_id),
      branchPrefix: row.branch_prefix,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
  }

  private getIssueById(id: string) {
    const row = this.database.sqlite
      .prepare('SELECT * FROM issues WHERE id = ?')
      .get(id) as unknown as IssueRow | undefined
    return row ? this.toIssue(row) : undefined
  }

  private toIssue(row: IssueRow) {
    const events = this.database.sqlite
      .prepare(
        'SELECT * FROM issue_events WHERE issue_id = ? ORDER BY created_at ASC',
      )
      .all(row.id) as unknown as IssueEventRow[]
    const comments = this.database.sqlite
      .prepare(
        'SELECT * FROM issue_comments WHERE issue_id = ? ORDER BY created_at ASC',
      )
      .all(row.id) as unknown as IssueCommentRow[]
    const subtasks = this.database.sqlite
      .prepare(
        'SELECT * FROM issue_subtasks WHERE issue_id = ? ORDER BY sequence ASC, created_at ASC',
      )
      .all(row.id) as unknown as IssueSubtaskRow[]

    return issueSchema.parse({
      id: row.id,
      title: row.title,
      description: row.description,
      projectId: row.project_id,
      workspaceId: optionalString(row.workspace_id),
      endpointId: optionalString(row.endpoint_id),
      requirementRunId: optionalString(row.requirement_run_id),
      planningRunId: optionalString(row.planning_run_id),
      agentRunId: optionalString(row.agent_run_id),
      status: row.status,
      priority: row.priority,
      analysis: optionalString(row.analysis),
      branchName: optionalString(row.branch_name),
      prUrl: optionalString(row.pr_url),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      events: events.map(toIssueEvent),
      comments: comments.map(toIssueComment),
      subtasks: subtasks.map(toIssueSubtask),
    })
  }

  private insertIssue(issue: Issue) {
    this.database.sqlite
      .prepare(
        `
        INSERT INTO issues (
          id, title, description, project_id, workspace_id, endpoint_id, requirement_run_id, planning_run_id, agent_run_id,
          status, priority, analysis, branch_name, pr_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        issue.id,
        issue.title,
        issue.description,
        issue.projectId,
        issue.workspaceId ?? null,
        issue.endpointId ?? null,
        issue.requirementRunId ?? null,
        issue.planningRunId ?? null,
        issue.agentRunId ?? null,
        issue.status,
        issue.priority,
        issue.analysis ?? null,
        issue.branchName ?? null,
        issue.prUrl ?? null,
        issue.createdAt,
        issue.updatedAt,
      )
  }

  private updateIssueRow(issue: Issue) {
    this.database.sqlite
      .prepare(
        `
        UPDATE issues
        SET title = ?, description = ?, project_id = ?, workspace_id = ?, endpoint_id = ?,
          requirement_run_id = ?, planning_run_id = ?, agent_run_id = ?, status = ?, priority = ?, analysis = ?, branch_name = ?, pr_url = ?, updated_at = ?
        WHERE id = ?
      `,
      )
      .run(
        issue.title,
        issue.description,
        issue.projectId,
        issue.workspaceId ?? null,
        issue.endpointId ?? null,
        issue.requirementRunId ?? null,
        issue.planningRunId ?? null,
        issue.agentRunId ?? null,
        issue.status,
        issue.priority,
        issue.analysis ?? null,
        issue.branchName ?? null,
        issue.prUrl ?? null,
        issue.updatedAt,
        issue.id,
      )
  }

  private insertEvents(events: IssueEvent[]) {
    const statement = this.database.sqlite.prepare(
      'INSERT INTO issue_events (id, issue_id, type, message, created_at) VALUES (?, ?, ?, ?, ?)',
    )

    for (const event of events) {
      statement.run(
        event.id,
        event.issueId,
        event.type,
        event.message,
        event.createdAt,
      )
    }
  }

  private insertComments(comments: IssueComment[]) {
    const statement = this.database.sqlite.prepare(
      'INSERT INTO issue_comments (id, issue_id, run_id, author, kind, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )

    for (const comment of comments) {
      statement.run(
        comment.id,
        comment.issueId,
        comment.runId ?? null,
        comment.author,
        comment.kind,
        comment.body,
        comment.createdAt,
      )
    }
  }

  private insertSubtasks(subtasks: IssueSubtask[]) {
    const statement = this.database.sqlite.prepare(
      `
      INSERT INTO issue_subtasks (
        id, issue_id, title, description, status, kind, sequence, depends_on_json,
        agent_run_id, result_summary, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )

    for (const subtask of subtasks) {
      statement.run(
        subtask.id,
        subtask.issueId,
        subtask.title,
        subtask.description ?? null,
        subtask.status,
        subtask.kind,
        subtask.sequence,
        JSON.stringify(subtask.dependsOnSubtaskIds),
        subtask.agentRunId ?? null,
        subtask.resultSummary ?? null,
        subtask.createdAt,
        subtask.updatedAt,
      )
    }
  }

  private updateSubtaskRow(subtask: IssueSubtask) {
    this.database.sqlite
      .prepare(
        `
        UPDATE issue_subtasks
        SET title = ?, description = ?, status = ?, kind = ?, sequence = ?, depends_on_json = ?,
          agent_run_id = ?, result_summary = ?, updated_at = ?
        WHERE id = ? AND issue_id = ?
      `,
      )
      .run(
        subtask.title,
        subtask.description ?? null,
        subtask.status,
        subtask.kind,
        subtask.sequence,
        JSON.stringify(subtask.dependsOnSubtaskIds),
        subtask.agentRunId ?? null,
        subtask.resultSummary ?? null,
        subtask.updatedAt,
        subtask.id,
        subtask.issueId,
      )
  }
}

const toIssueEvent = (row: IssueEventRow) => {
  return issueEventSchema.parse({
    id: row.id,
    issueId: row.issue_id,
    type: row.type,
    message: row.message,
    createdAt: row.created_at,
  })
}

const toIssueComment = (row: IssueCommentRow) => {
  return issueCommentSchema.parse({
    id: row.id,
    issueId: row.issue_id,
    runId: optionalString(row.run_id),
    author: row.author,
    kind: row.kind,
    body: row.body,
    createdAt: row.created_at,
  })
}

const toIssueSubtask = (row: IssueSubtaskRow) => {
  return issueSubtaskSchema.parse({
    id: row.id,
    issueId: row.issue_id,
    title: row.title,
    description: optionalString(row.description),
    status: row.status,
    kind: row.kind,
    sequence: row.sequence,
    dependsOnSubtaskIds: parseDependsOnSubtaskIds(row.depends_on_json),
    agentRunId: optionalString(row.agent_run_id),
    resultSummary: optionalString(row.result_summary),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

const createEvent = (
  event: Omit<IssueEvent, 'id' | 'createdAt'> & { createdAt?: string },
) => {
  return issueEventSchema.parse({
    ...event,
    id: randomUUID(),
    createdAt: event.createdAt || new Date().toISOString(),
  })
}

const createComment = (
  comment: Omit<IssueComment, 'id' | 'createdAt'> & { createdAt?: string },
) => {
  return issueCommentSchema.parse({
    ...comment,
    id: randomUUID(),
    createdAt: comment.createdAt || new Date().toISOString(),
  })
}

const createSubtask = (
  subtask: CreateIssueSubtaskInput & {
    createdAt?: string
    issueId: string
    sequence: number
    updatedAt?: string
  },
) => {
  const now = new Date().toISOString()

  return issueSubtaskSchema.parse({
    ...subtask,
    id: randomUUID(),
    status: 'pending',
    createdAt: subtask.createdAt || now,
    updatedAt: subtask.updatedAt || now,
  })
}

const buildIssueAnalysis = ({
  branchName,
  issue,
  project,
  workspaceId,
}: {
  branchName: string
  issue: Issue
  project: AgentProject
  workspaceId?: string
}) => {
  return [
    `Project: ${project.name}`,
    `Repository: ${project.repositoryUrl || 'Not configured'}`,
    `Repository ref: ${project.repositoryRef || 'default'}`,
    `Project policy: ${project.description}`,
    `Workspace: ${workspaceId || 'Not selected'}`,
    `Suggested branch/worktree: ${branchName}`,
    `Priority: ${issue.priority}`,
    '',
    'Agent execution context:',
    '- The coding agent should assess scope directly in the task worktree.',
    '- The agent should decide whether the issue is actionable, under-specified, or unsafe before editing.',
    '- The agent should create its own plan when the inspected scope requires one.',
    '- The agent should convert the issue into a concrete completion target before editing.',
    '- The agent should implement, verify, inspect git status/diff, add a final summary issue comment, and finish from the same run when possible.',
    '- The agent should recover from failed commands by inspecting the error, making a smaller correction, and re-running focused verification.',
    '- The agent should avoid repeated broad exploration once the relevant files or behavior are known.',
    '- The agent should treat verification failures as feedback to patch and retry, not as immediate blockers.',
    '- The agent should ask for user input only when blocked by a concrete missing decision and no safe useful next step remains.',
  ].join('\n')
}

const buildBranchName = (prefix: string, title: string, id: string) => {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48)

  return `${prefix}/${slug || 'issue'}-${id.slice(0, 8)}`
}

const getIssueStatusFromRun = (
  run: Pick<AgentRun, 'prUrl' | 'status'>,
): IssueStatus => {
  if (run.prUrl) {
    return 'review'
  }

  if (run.status === 'completed') {
    return 'completed'
  }

  if (run.status === 'failed') {
    return 'failed'
  }

  if (run.status === 'awaiting_user') {
    return 'awaiting_user'
  }

  return 'running'
}

const getIssueStatusFromSubtasks = (
  subtasks: IssueSubtask[],
  fallback: IssueStatus,
): IssueStatus => {
  if (subtasks.length === 0) {
    return fallback
  }

  if (subtasks.some((subtask) => subtask.status === 'running')) {
    return 'running'
  }

  if (subtasks.some((subtask) => subtask.status === 'awaiting_user')) {
    return 'awaiting_user'
  }

  if (subtasks.some((subtask) => subtask.status === 'failed')) {
    return 'failed'
  }

  if (
    subtasks.every(
      (subtask) =>
        subtask.status === 'completed' || subtask.status === 'skipped',
    )
  ) {
    return 'completed'
  }

  if (fallback === 'backlog' || fallback === 'planning') {
    return 'ready'
  }

  return fallback
}

const getSubtaskStatusFromRun = (
  status: AgentRun['status'],
): IssueSubtask['status'] => {
  if (status === 'completed') {
    return 'completed'
  }

  if (status === 'failed') {
    return 'failed'
  }

  if (status === 'awaiting_user') {
    return 'awaiting_user'
  }

  return 'running'
}

const parseDependsOnSubtaskIds = (value: string) => {
  try {
    const parsed = JSON.parse(value) as unknown

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

const getRunFinishedEventMessage = (
  run: Pick<AgentRun, 'id' | 'status'>,
  status: IssueStatus,
) => {
  if (status === 'review') {
    return `Agent run ${run.id.slice(0, 8)} opened a pull request.`
  }

  return `Agent run ${run.id.slice(0, 8)} finished with status ${run.status}.`
}
