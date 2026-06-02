import { randomUUID } from "node:crypto";
import {
  agentProjectListSchema,
  agentProjectSchema,
  createAgentProjectSchema,
  createIssueSchema,
  issueEventSchema,
  issueListSchema,
  issueSchema,
  updateAgentProjectSchema,
  updateIssueSchema,
  type AgentProject,
  type CreateAgentProjectInput,
  type CreateIssueInput,
  type Issue,
  type IssueEvent,
  type IssueStatus,
  type UpdateAgentProjectInput,
  type UpdateIssueInput
} from "@agent-fleet/shared";
import { AppDatabase, optionalString } from "../db/database";
import { notFound } from "../http/errors";

type IssueAnalysisOptions = {
  endpointId?: string;
  analysis?: string;
  eventMessage?: string;
  planningRunId?: string;
  requirementRunId?: string;
};

type IssuePlanningStartOptions = {
  branchName: string;
  endpointId?: string;
  eventMessage?: string;
  planningRunId: string;
  requirementRunId: string;
  workspaceId: string;
};

type IssueRunStartOptions = {
  branchName?: string;
  endpointId?: string;
  workspaceId?: string;
};

type AgentProjectRow = {
  id: string;
  name: string;
  description: string;
  repository_url: string | null;
  repository_ref: string | null;
  workspace_id: string | null;
  default_endpoint_id: string | null;
  branch_prefix: string;
  created_at: string;
  updated_at: string;
};

type IssueRow = {
  id: string;
  title: string;
  description: string;
  project_id: string;
  workspace_id: string | null;
  endpoint_id: string | null;
  requirement_run_id: string | null;
  planning_run_id: string | null;
  agent_run_id: string | null;
  status: IssueStatus;
  priority: Issue["priority"];
  analysis: string | null;
  branch_name: string | null;
  pr_url: string | null;
  created_at: string;
  updated_at: string;
};

type IssueEventRow = {
  id: string;
  issue_id: string;
  type: IssueEvent["type"];
  message: string;
  created_at: string;
};

export class IssueStore {
  constructor(private readonly database: AppDatabase) {}

  async listProjects() {
    const rows = this.database.sqlite
      .prepare("SELECT * FROM agent_projects ORDER BY name ASC")
      .all() as unknown as AgentProjectRow[];

    return agentProjectListSchema.parse(rows.map((row) => this.toProject(row)));
  }

  async getProject(id: string) {
    const project = this.getProjectById(id);

    if (!project) {
      throw notFound(`Project '${id}' was not found`);
    }

    return project;
  }

  async createProject(input: CreateAgentProjectInput) {
    const parsed = createAgentProjectSchema.parse(input);
    const now = new Date().toISOString();
    const project = agentProjectSchema.parse({
      ...parsed,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    });

    this.database.transaction(() => {
      this.insertProject(project);
    });

    return project;
  }

  async updateProject(id: string, input: UpdateAgentProjectInput) {
    const current = await this.getProject(id);
    const parsed = updateAgentProjectSchema.parse(input);
    const updated = agentProjectSchema.parse({
      ...current,
      ...parsed,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString()
    });

    this.database.transaction(() => {
      this.database.sqlite
        .prepare(
          `
          UPDATE agent_projects
          SET name = ?, description = ?, repository_url = ?, repository_ref = ?, workspace_id = ?,
            default_endpoint_id = ?, branch_prefix = ?, updated_at = ?
          WHERE id = ?
        `
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
          updated.id
        );
    });

    return updated;
  }

  async removeProject(id: string) {
    const result = this.database.sqlite.prepare("DELETE FROM agent_projects WHERE id = ?").run(id);

    if (result.changes === 0) {
      throw notFound(`Project '${id}' was not found`);
    }
  }

  async listIssues() {
    const rows = this.database.sqlite
      .prepare("SELECT * FROM issues ORDER BY updated_at DESC")
      .all() as unknown as IssueRow[];

    return issueListSchema.parse(rows.map((row) => this.toIssue(row)));
  }

  async getIssue(id: string) {
    const issue = this.getIssueById(id);

    if (!issue) {
      throw notFound(`Issue '${id}' was not found`);
    }

    return issue;
  }

  async createIssue(input: CreateIssueInput) {
    const parsed = createIssueSchema.parse(input);
    await this.getProject(parsed.projectId);

    const now = new Date().toISOString();
    const issue = issueSchema.parse({
      ...parsed,
      id: randomUUID(),
      status: "backlog",
      createdAt: now,
      updatedAt: now,
      events: []
    });
    const event = createEvent({
      issueId: issue.id,
      type: "created",
      message: "Issue registered."
    });
    const next = { ...issue, events: [event] };

    this.database.transaction(() => {
      this.insertIssue(next);
      this.insertEvents([event]);
    });

    return next;
  }

  async updateIssue(id: string, input: UpdateIssueInput, eventMessage = "Issue updated.") {
    const current = await this.getIssue(id);
    const parsed = updateIssueSchema.parse(input);
    const statusChanged = Boolean(parsed.status && parsed.status !== current.status);
    const updated = issueSchema.parse({
      ...current,
      ...parsed,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
      events: current.events
    });
    const event = createEvent({
      issueId: updated.id,
      type: statusChanged ? "status_changed" : "updated",
      message: statusChanged ? `Status changed to ${updated.status}.` : eventMessage
    });

    this.database.transaction(() => {
      this.updateIssueRow(updated);
      this.insertEvents([event]);
    });

    return { ...updated, events: [...updated.events, event] };
  }

  async getIssueAnalysisContext(id: string, endpointId?: string) {
    const issue = await this.getIssue(id);
    const project = await this.getProject(issue.projectId);

    return {
      issue,
      project,
      workspaceId: issue.workspaceId ?? project.workspaceId,
      branchName: issue.branchName ?? buildBranchName(project.branchPrefix, issue.title, issue.id),
      endpointId: endpointId ?? issue.endpointId ?? project.defaultEndpointId
    };
  }

  async analyzeIssue(id: string, options: IssueAnalysisOptions = {}) {
    const { branchName, endpointId, issue, project, workspaceId } = await this.getIssueAnalysisContext(id, options.endpointId);
    const analysis = options.analysis ?? buildIssueAnalysis({ branchName, issue, project, workspaceId });
    const updated = issueSchema.parse({
      ...issue,
      status: "ready",
      endpointId,
      workspaceId,
      requirementRunId: options.requirementRunId ?? issue.requirementRunId,
      planningRunId: options.planningRunId ?? issue.planningRunId,
      branchName,
      analysis,
      updatedAt: new Date().toISOString()
    });
    const event = createEvent({
      issueId: id,
      type: "analyzed",
      message: options.eventMessage ?? `Analyzed for ${branchName}.`
    });

    this.database.transaction(() => {
      this.updateIssueRow(updated);
      this.insertEvents([event]);
    });

    return { ...updated, events: [...updated.events, event] };
  }

  async markPlanningStarted(id: string, options: IssuePlanningStartOptions) {
    const issue = await this.getIssue(id);
    const updated = issueSchema.parse({
      ...issue,
      status: "planning",
      endpointId: options.endpointId ?? issue.endpointId,
      workspaceId: options.workspaceId,
      requirementRunId: options.requirementRunId,
      planningRunId: options.planningRunId,
      branchName: options.branchName,
      analysis: undefined,
      updatedAt: new Date().toISOString()
    });
    const event = createEvent({
      issueId: id,
      type: "updated",
      message: options.eventMessage ?? `Planning tasks started for ${options.branchName}.`
    });

    this.database.transaction(() => {
      this.updateIssueRow(updated);
      this.insertEvents([event]);
    });

    return { ...updated, events: [...updated.events, event] };
  }

  async markRunStarted(id: string, agentRunId: string, options: IssueRunStartOptions = {}) {
    const issue = await this.getIssue(id);
    const updated = issueSchema.parse({
      ...issue,
      status: "running",
      agentRunId,
      endpointId: options.endpointId ?? issue.endpointId,
      workspaceId: options.workspaceId ?? issue.workspaceId,
      branchName: options.branchName ?? issue.branchName,
      updatedAt: new Date().toISOString()
    });
    const event = createEvent({
      issueId: id,
      type: "run_started",
      message: `Agent run ${agentRunId.slice(0, 8)} started.`
    });

    this.database.transaction(() => {
      this.updateIssueRow(updated);
      this.insertEvents([event]);
    });

    return { ...updated, events: [...updated.events, event] };
  }

  async unlinkAgentRunReferences(run: { id: string; issueId?: string; kind?: string; workspaceId?: string }) {
    if (!run.issueId) {
      return undefined;
    }

    const issue = await this.getIssue(run.issueId).catch(() => undefined);

    if (!issue) {
      return undefined;
    }

    const clearsRequirement = issue.requirementRunId === run.id;
    const clearsPlanning = issue.planningRunId === run.id;
    const clearsCoding = issue.agentRunId === run.id;

    if (!clearsRequirement && !clearsPlanning && !clearsCoding) {
      return issue;
    }

    const shouldResetStatus =
      (clearsCoding && (issue.status === "running" || issue.status === "awaiting_user")) ||
      ((clearsRequirement || clearsPlanning) && issue.status === "planning");
    const updated = issueSchema.parse({
      ...issue,
      requirementRunId: clearsRequirement ? undefined : issue.requirementRunId,
      planningRunId: clearsPlanning ? undefined : issue.planningRunId,
      agentRunId: clearsCoding ? undefined : issue.agentRunId,
      workspaceId: clearsCoding && issue.workspaceId === run.workspaceId ? undefined : issue.workspaceId,
      status: shouldResetStatus ? (issue.analysis ? "ready" : "backlog") : issue.status,
      updatedAt: new Date().toISOString()
    });
    const event = createEvent({
      issueId: issue.id,
      type: "updated",
      message: `Unlinked deleted agent task ${run.id.slice(0, 8)}.`
    });

    this.database.transaction(() => {
      this.updateIssueRow(updated);
      this.insertEvents([event]);
    });

    return { ...updated, events: [...updated.events, event] };
  }

  async clearMissingAgentRunReference(id: string, runId: string, eventMessage?: string) {
    const issue = await this.getIssue(id);

    if (issue.agentRunId !== runId) {
      return issue;
    }

    const shouldResetStatus = issue.status === "running" || issue.status === "awaiting_user";
    const updated = issueSchema.parse({
      ...issue,
      agentRunId: undefined,
      status: shouldResetStatus ? (issue.analysis ? "ready" : "backlog") : issue.status,
      updatedAt: new Date().toISOString()
    });
    const event = createEvent({
      issueId: issue.id,
      type: "updated",
      message: eventMessage ?? `Unlinked missing coding task ${runId.slice(0, 8)}.`
    });

    this.database.transaction(() => {
      this.updateIssueRow(updated);
      this.insertEvents([event]);
    });

    return { ...updated, events: [...updated.events, event] };
  }

  private getProjectById(id: string) {
    const row = this.database.sqlite
      .prepare("SELECT * FROM agent_projects WHERE id = ?")
      .get(id) as unknown as AgentProjectRow | undefined;

    return row ? this.toProject(row) : undefined;
  }

  private insertProject(project: AgentProject) {
    this.database.sqlite
      .prepare(
        `
        INSERT INTO agent_projects (
          id, name, description, repository_url, repository_ref, workspace_id,
          default_endpoint_id, branch_prefix, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
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
        project.updatedAt
      );
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
      updatedAt: row.updated_at
    });
  }

  private getIssueById(id: string) {
    const row = this.database.sqlite.prepare("SELECT * FROM issues WHERE id = ?").get(id) as unknown as IssueRow | undefined;
    return row ? this.toIssue(row) : undefined;
  }

  private toIssue(row: IssueRow) {
    const events = this.database.sqlite
      .prepare("SELECT * FROM issue_events WHERE issue_id = ? ORDER BY created_at ASC")
      .all(row.id) as unknown as IssueEventRow[];

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
      events: events.map(toIssueEvent)
    });
  }

  private insertIssue(issue: Issue) {
    this.database.sqlite
      .prepare(
        `
        INSERT INTO issues (
          id, title, description, project_id, workspace_id, endpoint_id, requirement_run_id, planning_run_id, agent_run_id,
          status, priority, analysis, branch_name, pr_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
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
        issue.updatedAt
      );
  }

  private updateIssueRow(issue: Issue) {
    this.database.sqlite
      .prepare(
        `
        UPDATE issues
        SET title = ?, description = ?, project_id = ?, workspace_id = ?, endpoint_id = ?,
          requirement_run_id = ?, planning_run_id = ?, agent_run_id = ?, status = ?, priority = ?, analysis = ?, branch_name = ?, pr_url = ?, updated_at = ?
        WHERE id = ?
      `
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
        issue.id
      );
  }

  private insertEvents(events: IssueEvent[]) {
    const statement = this.database.sqlite.prepare(
      "INSERT INTO issue_events (id, issue_id, type, message, created_at) VALUES (?, ?, ?, ?, ?)"
    );

    for (const event of events) {
      statement.run(event.id, event.issueId, event.type, event.message, event.createdAt);
    }
  }
}

const toIssueEvent = (row: IssueEventRow) => {
  return issueEventSchema.parse({
    id: row.id,
    issueId: row.issue_id,
    type: row.type,
    message: row.message,
    createdAt: row.created_at
  });
};

const createEvent = (event: Omit<IssueEvent, "id" | "createdAt"> & { createdAt?: string }) => {
  return issueEventSchema.parse({
    ...event,
    id: randomUUID(),
    createdAt: event.createdAt || new Date().toISOString()
  });
};

const buildIssueAnalysis = ({
  branchName,
  issue,
  project,
  workspaceId
}: {
  branchName: string;
  issue: Issue;
  project: AgentProject;
  workspaceId?: string;
}) => {
  return [
    `Project: ${project.name}`,
    `Repository: ${project.repositoryUrl || "Not configured"}`,
    `Repository ref: ${project.repositoryRef || "default"}`,
    `Project policy: ${project.description}`,
    `Workspace: ${workspaceId || "Not selected"}`,
    `Suggested branch/worktree: ${branchName}`,
    `Priority: ${issue.priority}`,
    "",
    "Suggested flow:",
    "1. Create or reuse an isolated branch/worktree for this issue.",
    "2. Inspect the repository before editing.",
    "3. Implement the requested change in the issue workspace.",
    "4. Run relevant checks and summarize the result.",
    "5. Move the issue to review when the agent needs human confirmation."
  ].join("\n");
};

const buildBranchName = (prefix: string, title: string, id: string) => {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);

  return `${prefix}/${slug || "issue"}-${id.slice(0, 8)}`;
};
