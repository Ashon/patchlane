import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { AppDatabase } from '../db/database'
import {
  SandboxWorkspaceStore,
  ensureWithinRoot,
  resolveWithinRoot,
} from './sandboxWorkspaceStore'

describe('Given sandbox root path guards', () => {
  const root = '/tmp/patchlane-root'

  it('when a path is inside the root, then resolveWithinRoot returns it resolved', () => {
    expect(resolveWithinRoot(root, `${root}/a/b`)).toBe(
      path.resolve(`${root}/a/b`),
    )
  })

  it('when a path is outside the root, then resolveWithinRoot returns null', () => {
    expect(resolveWithinRoot(root, '/some/other/place')).toBeNull()
    expect(resolveWithinRoot(root, `${root}/../escape`)).toBeNull()
  })

  it('when a path is outside the root, then ensureWithinRoot throws', () => {
    expect(() => ensureWithinRoot(root, '/some/other/place')).toThrow(
      /outside sandbox root/,
    )
  })
})

describe('Given a sandbox workspace with a stale foreign path', () => {
  let database: AppDatabase
  let store: SandboxWorkspaceStore
  let tempDir: string
  let rootDir: string

  const insertWorkspace = (id: string, workspacePath: string) => {
    database.sqlite
      .prepare(
        `INSERT INTO sandbox_workspaces
          (id, name, path, kind, status, created_at, updated_at)
         VALUES (?, ?, ?, 'manual', 'ready', ?, ?)`,
      )
      .run(
        id,
        `ws-${id}`,
        workspacePath,
        new Date(0).toISOString(),
        new Date(0).toISOString(),
      )
  }

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'patchlane-sandbox-'))
    rootDir = path.join(tempDir, 'sandboxes')
    mkdirSync(rootDir, { recursive: true })
    database = new AppDatabase(path.join(tempDir, 'app.db'))
    store = new SandboxWorkspaceStore(database, rootDir)
  })

  afterEach(() => {
    database.sqlite.close()
    rmSync(tempDir, { force: true, recursive: true })
  })

  it('when the workspace path is outside the root, then remove drops the record and leaves the foreign directory untouched', async () => {
    const foreignPath = path.join(
      tempDir,
      'other-project',
      'sandboxes',
      'forge-x',
    )
    mkdirSync(foreignPath, { recursive: true })
    insertWorkspace('outside-1', foreignPath)

    await store.remove('outside-1')

    expect(existsSync(foreignPath)).toBe(true)
    await expect(store.get('outside-1')).rejects.toThrow()
  })

  it('when the workspace path is inside the root, then remove deletes both the directory and the record', async () => {
    const insidePath = path.join(rootDir, 'ws-inside-1')
    mkdirSync(insidePath, { recursive: true })
    insertWorkspace('inside-1', insidePath)

    await store.remove('inside-1')

    expect(existsSync(insidePath)).toBe(false)
    await expect(store.get('inside-1')).rejects.toThrow()
  })
})
