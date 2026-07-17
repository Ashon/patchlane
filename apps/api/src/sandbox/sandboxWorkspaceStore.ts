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
  status: 'ready' | 'error'
  error: string | null
  created_at: string
  updated_at: string
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
      status: 'ready',
      createdAt: now,
      updatedAt: now,
    })

    this.insert(workspace)
    return workspace
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

    // Only delete files that live inside our own sandbox root. A record whose
    // path points outside the current root (e.g. created under a different
    // project root) is stale metadata — drop the record without touching a
    // directory we do not own, instead of failing the whole deletion.
    const workspacePath = resolveWithinRoot(this.rootDir, workspace.path)

    if (workspacePath) {
      await rm(workspacePath, {
        force: true,
        recursive: true,
      })
    }

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
          id, name, path, repository_url, workspace_ref, kind, status, error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        workspace.id,
        workspace.name,
        workspace.path,
        workspace.repositoryUrl ?? null,
        workspace.ref ?? null,
        workspace.kind,
        workspace.status,
        workspace.error ?? null,
        workspace.createdAt,
        workspace.updatedAt,
      )
  }
}

export const resolveWithinRoot = (
  rootDir: string,
  candidatePath: string,
): string | null => {
  const resolvedRoot = path.resolve(rootDir)
  const resolvedPath = path.resolve(candidatePath)
  const relativePath = path.relative(resolvedRoot, resolvedPath)

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null
  }

  return resolvedPath
}

export const ensureWithinRoot = (rootDir: string, candidatePath: string) => {
  const resolvedPath = resolveWithinRoot(rootDir, candidatePath)

  if (resolvedPath === null) {
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
