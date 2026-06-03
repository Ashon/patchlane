import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import {
  createSandboxWorkspaceSchema,
  sandboxWorkspaceListSchema,
  sandboxWorkspaceSchema,
  type CreateSandboxWorkspaceInput,
  type SandboxWorkspace,
  type SandboxWorkspaceKind,
} from '@patchlane/shared'
import { AppDatabase, optionalString } from '../db/database'
import { readLegacyJson } from '../db/legacyJson'
import { notFound } from '../http/errors'

type SandboxWorkspaceRow = {
  id: string
  name: string
  path: string
  repository_url: string | null
  workspace_ref: string | null
  kind: SandboxWorkspaceKind
  project_id: string | null
  issue_id: string | null
  agent_run_id: string | null
  parent_workspace_id: string | null
  base_ref: string | null
  branch_name: string | null
  cleanup_status: SandboxWorkspace['cleanupStatus']
  status: 'ready' | 'error'
  error: string | null
  created_at: string
  updated_at: string
}

type ProjectCacheWorkspaceInput = {
  name: string
  projectId: string
  repositoryUrl: string
  ref?: string
}

type TaskWorkspaceInput = {
  branchName: string
  baseRef?: string
  issueId: string
  name: string
  parentWorkspaceId: string
  projectId: string
  repositoryUrl: string
  ref?: string
}

export class SandboxWorkspaceStore {
  constructor(
    private readonly database: AppDatabase,
    private readonly rootDir: string,
    private readonly legacyFilePath?: string,
  ) {
    this.ensureSeeded()
  }

  async list() {
    const rows = this.database.sqlite
      .prepare('SELECT * FROM sandbox_workspaces ORDER BY created_at DESC')
      .all() as unknown as SandboxWorkspaceRow[]

    return sandboxWorkspaceListSchema.parse(rows.map(toWorkspace))
  }

  async get(id: string) {
    const workspace = this.getById(id)

    if (!workspace) {
      throw notFound(`Sandbox workspace '${id}' was not found`)
    }

    return workspace
  }

  async findProjectCache(projectId: string) {
    const row = this.database.sqlite
      .prepare(
        "SELECT * FROM sandbox_workspaces WHERE project_id = ? AND kind = 'project_cache' ORDER BY created_at DESC LIMIT 1",
      )
      .get(projectId) as unknown as SandboxWorkspaceRow | undefined

    return row ? toWorkspace(row) : undefined
  }

  async create(input: CreateSandboxWorkspaceInput) {
    const parsed = createSandboxWorkspaceSchema.parse(input)
    const id = randomUUID()
    const now = new Date().toISOString()
    const name =
      parsed.name || getWorkspaceName(parsed.repositoryUrl) || 'workspace'
    const workspacePath = this.getWorkspacePath(name, id)

    await mkdir(workspacePath, { recursive: true })

    const workspace = sandboxWorkspaceSchema.parse({
      id,
      name,
      path: workspacePath,
      repositoryUrl: parsed.repositoryUrl,
      ref: parsed.ref,
      kind: parsed.kind ?? 'manual',
      projectId: parsed.projectId,
      issueId: parsed.issueId,
      agentRunId: parsed.agentRunId,
      parentWorkspaceId: parsed.parentWorkspaceId,
      baseRef: parsed.baseRef,
      branchName: parsed.branchName,
      cleanupStatus: parsed.cleanupStatus ?? 'active',
      status: 'ready',
      createdAt: now,
      updatedAt: now,
    })

    this.insert(workspace)
    return workspace
  }

  async createProjectCache(input: ProjectCacheWorkspaceInput) {
    const existing = await this.findProjectCache(input.projectId)

    if (existing) {
      return existing
    }

    const now = new Date().toISOString()
    const workspace = sandboxWorkspaceSchema.parse({
      id: randomUUID(),
      name: `${input.name} cache`.slice(0, 80),
      path: this.getProjectCachePath(input.projectId),
      repositoryUrl: input.repositoryUrl,
      ref: input.ref,
      kind: 'project_cache',
      projectId: input.projectId,
      baseRef: input.ref,
      cleanupStatus: 'active',
      status: 'ready',
      createdAt: now,
      updatedAt: now,
    })

    await mkdir(workspace.path, { recursive: true })
    this.insert(workspace)
    return workspace
  }

  async createTaskWorktree(input: TaskWorkspaceInput) {
    const id = randomUUID()
    const now = new Date().toISOString()
    const workspace = sandboxWorkspaceSchema.parse({
      id,
      name: input.name.slice(0, 80),
      path: this.getTaskWorkspacePath(input.projectId, id),
      repositoryUrl: input.repositoryUrl,
      ref: input.ref,
      kind: 'task_worktree',
      projectId: input.projectId,
      issueId: input.issueId,
      parentWorkspaceId: input.parentWorkspaceId,
      baseRef: input.baseRef,
      branchName: input.branchName,
      cleanupStatus: 'active',
      status: 'ready',
      createdAt: now,
      updatedAt: now,
    })

    this.insert(workspace)
    return workspace
  }

  async linkAgentRun(id: string, agentRunId: string) {
    const current = await this.get(id)
    const updated = sandboxWorkspaceSchema.parse({
      ...current,
      agentRunId,
      updatedAt: new Date().toISOString(),
    })

    this.database.sqlite
      .prepare(
        'UPDATE sandbox_workspaces SET agent_run_id = ?, updated_at = ? WHERE id = ?',
      )
      .run(updated.agentRunId ?? null, updated.updatedAt, updated.id)

    return updated
  }

  async updateRepositorySource(
    id: string,
    input: {
      baseRef?: string
      name?: string
      ref?: string
      repositoryUrl: string
    },
  ) {
    const current = await this.get(id)
    const updated = sandboxWorkspaceSchema.parse({
      ...current,
      name: input.name ?? current.name,
      repositoryUrl: input.repositoryUrl,
      ref: input.ref,
      baseRef: input.baseRef ?? input.ref,
      status: 'ready',
      error: undefined,
      updatedAt: new Date().toISOString(),
    })

    this.database.sqlite
      .prepare(
        `
        UPDATE sandbox_workspaces
        SET name = ?, repository_url = ?, workspace_ref = ?, base_ref = ?, status = ?, error = ?, updated_at = ?
        WHERE id = ?
      `,
      )
      .run(
        updated.name,
        updated.repositoryUrl ?? null,
        updated.ref ?? null,
        updated.baseRef ?? null,
        updated.status,
        updated.error ?? null,
        updated.updatedAt,
        updated.id,
      )

    return updated
  }

  async markError(id: string, error: string) {
    const current = await this.get(id)
    const updated = sandboxWorkspaceSchema.parse({
      ...current,
      status: 'error',
      error,
      updatedAt: new Date().toISOString(),
    })

    this.database.sqlite
      .prepare(
        'UPDATE sandbox_workspaces SET status = ?, error = ?, updated_at = ? WHERE id = ?',
      )
      .run(updated.status, updated.error ?? null, updated.updatedAt, updated.id)

    return updated
  }

  async remove(id: string) {
    const workspace = await this.get(id)

    await rm(ensureWithinRoot(this.rootDir, workspace.path), {
      force: true,
      recursive: true,
    })

    const result = this.database.sqlite
      .prepare('DELETE FROM sandbox_workspaces WHERE id = ?')
      .run(id)

    if (result.changes === 0) {
      throw notFound(`Sandbox workspace '${id}' was not found`)
    }
  }

  private getWorkspacePath(name: string, id: string) {
    const directoryName = `${slugify(name)}-${id.slice(0, 8)}`
    return ensureWithinRoot(
      this.rootDir,
      path.join(this.rootDir, directoryName),
    )
  }

  private getProjectCachePath(projectId: string) {
    return ensureWithinRoot(
      this.rootDir,
      path.join(this.rootDir, 'projects', slugify(projectId), 'repo'),
    )
  }

  private getTaskWorkspacePath(projectId: string, id: string) {
    return ensureWithinRoot(
      this.rootDir,
      path.join(this.rootDir, 'projects', slugify(projectId), 'tasks', id),
    )
  }

  private getById(id: string) {
    const row = this.database.sqlite
      .prepare('SELECT * FROM sandbox_workspaces WHERE id = ?')
      .get(id) as unknown as SandboxWorkspaceRow | undefined

    return row ? toWorkspace(row) : undefined
  }

  private ensureSeeded() {
    const countRow = this.database.sqlite
      .prepare('SELECT COUNT(*) AS count FROM sandbox_workspaces')
      .get() as { count: number }

    if (countRow.count > 0) {
      return
    }

    const legacyWorkspaces = readLegacyJson(
      this.legacyFilePath,
      sandboxWorkspaceListSchema,
    )

    if (!legacyWorkspaces?.length) {
      return
    }

    this.database.transaction(() => {
      for (const workspace of legacyWorkspaces) {
        this.insert(workspace)
      }
    })
  }

  private insert(workspace: SandboxWorkspace) {
    this.database.sqlite
      .prepare(
        `
        INSERT INTO sandbox_workspaces (
          id, name, path, repository_url, workspace_ref, kind, project_id, issue_id, agent_run_id,
          parent_workspace_id, base_ref, branch_name, cleanup_status, status, error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        workspace.id,
        workspace.name,
        workspace.path,
        workspace.repositoryUrl ?? null,
        workspace.ref ?? null,
        workspace.kind,
        workspace.projectId ?? null,
        workspace.issueId ?? null,
        workspace.agentRunId ?? null,
        workspace.parentWorkspaceId ?? null,
        workspace.baseRef ?? null,
        workspace.branchName ?? null,
        workspace.cleanupStatus,
        workspace.status,
        workspace.error ?? null,
        workspace.createdAt,
        workspace.updatedAt,
      )
  }
}

export const ensureWithinRoot = (rootDir: string, candidatePath: string) => {
  const resolvedRoot = path.resolve(rootDir)
  const resolvedPath = path.resolve(candidatePath)
  const relativePath = path.relative(resolvedRoot, resolvedPath)

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Path '${candidatePath}' is outside sandbox root`)
  }

  return resolvedPath
}

const toWorkspace = (row: SandboxWorkspaceRow) => {
  return sandboxWorkspaceSchema.parse({
    id: row.id,
    name: row.name,
    path: row.path,
    repositoryUrl: optionalString(row.repository_url),
    ref: optionalString(row.workspace_ref),
    kind: row.kind ?? 'manual',
    projectId: optionalString(row.project_id),
    issueId: optionalString(row.issue_id),
    agentRunId: optionalString(row.agent_run_id),
    parentWorkspaceId: optionalString(row.parent_workspace_id),
    baseRef: optionalString(row.base_ref),
    branchName: optionalString(row.branch_name),
    cleanupStatus: row.cleanup_status ?? 'active',
    status: row.status,
    error: optionalString(row.error),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

const getWorkspaceName = (repositoryUrl?: string) => {
  if (!repositoryUrl) {
    return undefined
  }

  const pathname = new URL(repositoryUrl).pathname
  const name = pathname
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/\.git$/u, '')
  return name && name.length > 0 ? name : undefined
}

const slugify = (value: string) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 60)

  return slug || 'workspace'
}
