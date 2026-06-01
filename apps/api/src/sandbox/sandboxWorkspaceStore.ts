import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createSandboxWorkspaceSchema,
  sandboxWorkspaceListSchema,
  sandboxWorkspaceSchema,
  type CreateSandboxWorkspaceInput,
  type SandboxWorkspace
} from "@agent-fleet/shared";
import { notFound } from "../http/errors";

export class SandboxWorkspaceStore {
  constructor(
    private readonly filePath: string,
    private readonly rootDir: string
  ) {}

  async list() {
    const workspaces = await this.read();
    return workspaces.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async get(id: string) {
    const workspaces = await this.read();
    const workspace = workspaces.find((item) => item.id === id);

    if (!workspace) {
      throw notFound(`Sandbox workspace '${id}' was not found`);
    }

    return workspace;
  }

  async create(input: CreateSandboxWorkspaceInput) {
    const parsed = createSandboxWorkspaceSchema.parse(input);
    const id = randomUUID();
    const now = new Date().toISOString();
    const name = parsed.name || getWorkspaceName(parsed.repositoryUrl) || "workspace";
    const workspacePath = this.getWorkspacePath(name, id);

    await mkdir(workspacePath, { recursive: true });

    const workspace = sandboxWorkspaceSchema.parse({
      id,
      name,
      path: workspacePath,
      repositoryUrl: parsed.repositoryUrl,
      ref: parsed.ref,
      status: "ready",
      createdAt: now,
      updatedAt: now
    });

    const workspaces = await this.read();
    workspaces.push(workspace);
    await this.write(workspaces);

    return workspace;
  }

  async markError(id: string, error: string) {
    const workspaces = await this.read();
    const index = workspaces.findIndex((item) => item.id === id);

    if (index < 0) {
      throw notFound(`Sandbox workspace '${id}' was not found`);
    }

    const current = workspaces[index];
    if (!current) {
      throw notFound(`Sandbox workspace '${id}' was not found`);
    }

    const updated = sandboxWorkspaceSchema.parse({
      ...current,
      status: "error",
      error,
      updatedAt: new Date().toISOString()
    });

    workspaces[index] = updated;
    await this.write(workspaces);

    return updated;
  }

  async remove(id: string) {
    const workspaces = await this.read();
    const workspace = workspaces.find((item) => item.id === id);

    if (!workspace) {
      throw notFound(`Sandbox workspace '${id}' was not found`);
    }

    await rm(ensureWithinRoot(this.rootDir, workspace.path), { force: true, recursive: true });
    await this.write(workspaces.filter((item) => item.id !== id));
  }

  private getWorkspacePath(name: string, id: string) {
    const directoryName = `${slugify(name)}-${id.slice(0, 8)}`;
    return ensureWithinRoot(this.rootDir, path.join(this.rootDir, directoryName));
  }

  private async read(): Promise<SandboxWorkspace[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return sandboxWorkspaceListSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (isMissingFileError(error)) {
        await this.write([]);
        return [];
      }

      throw error;
    }
  }

  private async write(workspaces: SandboxWorkspace[]) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await mkdir(this.rootDir, { recursive: true });

    const tmpPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(workspaces, null, 2)}\n`, "utf8");
    await rename(tmpPath, this.filePath);
  }
}

export const ensureWithinRoot = (rootDir: string, candidatePath: string) => {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedPath = path.resolve(candidatePath);
  const relativePath = path.relative(resolvedRoot, resolvedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Path '${candidatePath}' is outside sandbox root`);
  }

  return resolvedPath;
};

const getWorkspaceName = (repositoryUrl?: string) => {
  if (!repositoryUrl) {
    return undefined;
  }

  const pathname = new URL(repositoryUrl).pathname;
  const name = pathname.split("/").filter(Boolean).pop()?.replace(/\.git$/u, "");
  return name && name.length > 0 ? name : undefined;
};

const slugify = (value: string) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60);

  return slug || "workspace";
};

const isMissingFileError = (error: unknown) => {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
};
