import { randomUUID } from "node:crypto";
import {
  agentRunListSchema,
  agentRunMessageSchema,
  agentRunSchema,
  createAgentRunSchema,
  type AgentRun,
  type AgentRunMessage,
  type AgentRunStatus,
  type CreateAgentRunInput
} from "@agent-fleet/shared";
import { AppDatabase, optionalString } from "../db/database";
import { readLegacyJson } from "../db/legacyJson";
import { notFound } from "../http/errors";

type AgentRunRow = {
  id: string;
  workspace_id: string;
  endpoint_id: string | null;
  model: string | null;
  title: string;
  status: AgentRunStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
};

type AgentRunMessageRow = {
  id: string;
  run_id: string;
  role: AgentRunMessage["role"];
  content: string;
  tool_name: string | null;
  created_at: string;
  sequence: number;
};

export class AgentRunStore {
  constructor(
    private readonly database: AppDatabase,
    private readonly legacyFilePath?: string
  ) {
    this.ensureSeeded();
  }

  async list() {
    const rows = this.database.sqlite
      .prepare("SELECT * FROM agent_runs ORDER BY created_at DESC")
      .all() as unknown as AgentRunRow[];

    return agentRunListSchema.parse(rows.map((row) => this.toRun(row)));
  }

  async get(id: string) {
    const run = this.getById(id);

    if (!run) {
      throw notFound(`Agent run '${id}' was not found`);
    }

    return run;
  }

  async create(input: CreateAgentRunInput) {
    const parsed = createAgentRunSchema.parse(input);
    const now = new Date().toISOString();
    const run = agentRunSchema.parse({
      id: randomUUID(),
      workspaceId: parsed.workspaceId,
      endpointId: parsed.endpointId,
      model: parsed.model,
      title: parsed.title || getTitle(parsed.task),
      status: "idle",
      messages: [
        createMessage({
          role: "user",
          content: parsed.task,
          createdAt: now
        })
      ],
      createdAt: now,
      updatedAt: now
    });

    this.database.transaction(() => {
      this.insertRunWithMessages(run);
    });

    return run;
  }

  async appendMessage(id: string, message: Omit<AgentRunMessage, "id" | "createdAt">) {
    return this.update(id, (run) => ({
      ...run,
      messages: [...run.messages, createMessage(message)],
      status: message.role === "user" ? "idle" : run.status,
      updatedAt: new Date().toISOString()
    }));
  }

  async appendMessages(id: string, messages: Array<Omit<AgentRunMessage, "id" | "createdAt">>) {
    return this.update(id, (run) => ({
      ...run,
      messages: [...run.messages, ...messages.map((message) => createMessage(message))],
      updatedAt: new Date().toISOString()
    }));
  }

  async setStatus(id: string, status: AgentRunStatus, error?: string) {
    return this.update(id, (run) => ({
      ...run,
      status,
      error,
      updatedAt: new Date().toISOString()
    }));
  }

  async remove(id: string) {
    const result = this.database.sqlite.prepare("DELETE FROM agent_runs WHERE id = ?").run(id);

    if (result.changes === 0) {
      throw notFound(`Agent run '${id}' was not found`);
    }
  }

  private update(id: string, updater: (run: AgentRun) => AgentRun) {
    const current = this.getById(id);

    if (!current) {
      throw notFound(`Agent run '${id}' was not found`);
    }

    const updated = agentRunSchema.parse(updater(current));

    this.database.transaction(() => {
      this.database.sqlite
        .prepare(
          `
          UPDATE agent_runs
          SET workspace_id = ?, endpoint_id = ?, model = ?, title = ?, status = ?, error = ?, updated_at = ?
          WHERE id = ?
        `
        )
        .run(
          updated.workspaceId,
          updated.endpointId ?? null,
          updated.model ?? null,
          updated.title,
          updated.status,
          updated.error ?? null,
          updated.updatedAt,
          updated.id
        );

      this.database.sqlite.prepare("DELETE FROM agent_run_messages WHERE run_id = ?").run(updated.id);
      this.insertMessages(updated.id, updated.messages);
    });

    return updated;
  }

  private getById(id: string) {
    const row = this.database.sqlite.prepare("SELECT * FROM agent_runs WHERE id = ?").get(id) as unknown as AgentRunRow | undefined;
    return row ? this.toRun(row) : undefined;
  }

  private toRun(row: AgentRunRow) {
    const messageRows = this.database.sqlite
      .prepare("SELECT * FROM agent_run_messages WHERE run_id = ? ORDER BY sequence ASC")
      .all(row.id) as unknown as AgentRunMessageRow[];

    return agentRunSchema.parse({
      id: row.id,
      workspaceId: row.workspace_id,
      endpointId: optionalString(row.endpoint_id),
      model: optionalString(row.model),
      title: row.title,
      status: row.status,
      messages: messageRows.map(toMessage),
      error: optionalString(row.error),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  private ensureSeeded() {
    const countRow = this.database.sqlite.prepare("SELECT COUNT(*) AS count FROM agent_runs").get() as { count: number };

    if (countRow.count > 0) {
      return;
    }

    const legacyRuns = readLegacyJson(this.legacyFilePath, agentRunListSchema);

    if (!legacyRuns?.length) {
      return;
    }

    this.database.transaction(() => {
      for (const run of legacyRuns) {
        this.insertRunWithMessages(run);
      }
    });
  }

  private insertRunWithMessages(run: AgentRun) {
    this.database.sqlite
      .prepare(
        `
        INSERT INTO agent_runs (
          id, workspace_id, endpoint_id, model, title, status, error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        run.id,
        run.workspaceId,
        run.endpointId ?? null,
        run.model ?? null,
        run.title,
        run.status,
        run.error ?? null,
        run.createdAt,
        run.updatedAt
      );

    this.insertMessages(run.id, run.messages);
  }

  private insertMessages(runId: string, messages: AgentRunMessage[]) {
    const statement = this.database.sqlite.prepare(
      `
      INSERT INTO agent_run_messages (
        id, run_id, role, content, tool_name, created_at, sequence
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    );

    messages.forEach((message, index) => {
      statement.run(message.id, runId, message.role, message.content, message.toolName ?? null, message.createdAt, index);
    });
  }
}

const toMessage = (row: AgentRunMessageRow) => {
  return agentRunMessageSchema.parse({
    id: row.id,
    role: row.role,
    content: row.content,
    toolName: optionalString(row.tool_name),
    createdAt: row.created_at
  });
};

const createMessage = (message: Omit<AgentRunMessage, "id" | "createdAt"> & { createdAt?: string }) => {
  return agentRunMessageSchema.parse({
    ...message,
    id: randomUUID(),
    createdAt: message.createdAt || new Date().toISOString()
  });
};

const getTitle = (task: string) => {
  const firstLine = task.split("\n").find(Boolean) || "Agent task";
  return firstLine.slice(0, 80);
};
