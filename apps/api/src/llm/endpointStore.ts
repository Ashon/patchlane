import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  createLlmEndpointSchema,
  llmEndpointListSchema,
  llmEndpointSchema,
  updateLlmEndpointSchema,
  type CreateLlmEndpointInput,
  type LlmEndpoint,
  type UpdateLlmEndpointInput
} from "@agent-fleet/shared";
import { notFound } from "../http/errors";

export class LlmEndpointStore {
  constructor(
    private readonly filePath: string,
    private readonly seedEndpoint: CreateLlmEndpointInput
  ) {}

  async list() {
    const endpoints = await this.read();
    return endpoints.sort((left, right) => left.name.localeCompare(right.name));
  }

  async get(id: string) {
    const endpoints = await this.read();
    const endpoint = endpoints.find((item) => item.id === id);

    if (!endpoint) {
      throw notFound(`LLM endpoint '${id}' was not found`);
    }

    return endpoint;
  }

  async getDefault() {
    const endpoints = await this.read();
    const endpoint = endpoints.find((item) => item.enabled);

    if (!endpoint) {
      throw notFound("No enabled LLM endpoint is configured");
    }

    return endpoint;
  }

  async create(input: CreateLlmEndpointInput) {
    const parsed = createLlmEndpointSchema.parse(input);
    const endpoints = await this.read();
    const now = new Date().toISOString();
    const endpoint = llmEndpointSchema.parse({
      ...parsed,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    });

    endpoints.push(endpoint);
    await this.write(endpoints);

    return endpoint;
  }

  async update(id: string, input: UpdateLlmEndpointInput) {
    const parsed = updateLlmEndpointSchema.parse(input);
    const endpoints = await this.read();
    const index = endpoints.findIndex((item) => item.id === id);

    if (index < 0) {
      throw notFound(`LLM endpoint '${id}' was not found`);
    }

    const current = endpoints[index];
    if (!current) {
      throw notFound(`LLM endpoint '${id}' was not found`);
    }

    const updated = llmEndpointSchema.parse({
      ...current,
      ...parsed,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString()
    });

    endpoints[index] = updated;
    await this.write(endpoints);

    return updated;
  }

  async remove(id: string) {
    const endpoints = await this.read();
    const next = endpoints.filter((item) => item.id !== id);

    if (next.length === endpoints.length) {
      throw notFound(`LLM endpoint '${id}' was not found`);
    }

    await this.write(next);
  }

  private async read(): Promise<LlmEndpoint[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return llmEndpointListSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (isMissingFileError(error)) {
        const seeded = this.seed();
        await this.write(seeded);
        return seeded;
      }

      throw error;
    }
  }

  private seed() {
    const parsed = createLlmEndpointSchema.parse(this.seedEndpoint);
    const now = new Date().toISOString();

    return [
      llmEndpointSchema.parse({
        ...parsed,
        id: "local-default",
        createdAt: now,
        updatedAt: now
      })
    ];
  }

  private async write(endpoints: LlmEndpoint[]) {
    await mkdir(path.dirname(this.filePath), { recursive: true });

    const tmpPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(endpoints, null, 2)}\n`, "utf8");
    await rename(tmpPath, this.filePath);
  }
}

const isMissingFileError = (error: unknown) => {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
};
