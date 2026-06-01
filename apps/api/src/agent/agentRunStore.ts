import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
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
import { notFound } from "../http/errors";

export class AgentRunStore {
  constructor(private readonly filePath: string) {}

  async list() {
    const runs = await this.read();
    return runs.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async get(id: string) {
    const runs = await this.read();
    const run = runs.find((item) => item.id === id);

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

    const runs = await this.read();
    runs.push(run);
    await this.write(runs);

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
    const runs = await this.read();
    const next = runs.filter((run) => run.id !== id);

    if (next.length === runs.length) {
      throw notFound(`Agent run '${id}' was not found`);
    }

    await this.write(next);
  }

  private async update(id: string, updater: (run: AgentRun) => AgentRun) {
    const runs = await this.read();
    const index = runs.findIndex((item) => item.id === id);

    if (index < 0) {
      throw notFound(`Agent run '${id}' was not found`);
    }

    const current = runs[index];
    if (!current) {
      throw notFound(`Agent run '${id}' was not found`);
    }

    const updated = agentRunSchema.parse(updater(current));
    runs[index] = updated;
    await this.write(runs);

    return updated;
  }

  private async read(): Promise<AgentRun[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return agentRunListSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (isMissingFileError(error)) {
        await this.write([]);
        return [];
      }

      throw error;
    }
  }

  private async write(runs: AgentRun[]) {
    await mkdir(path.dirname(this.filePath), { recursive: true });

    const tmpPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(runs, null, 2)}\n`, "utf8");
    await rename(tmpPath, this.filePath);
  }
}

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

const isMissingFileError = (error: unknown) => {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
};
