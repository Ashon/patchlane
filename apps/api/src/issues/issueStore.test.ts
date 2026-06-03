import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { AppDatabase } from '../db/database'
import { IssueStore } from './issueStore'

describe('Given issue comments', () => {
  let database: AppDatabase
  let store: IssueStore
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'patchlane-issue-store-'))
    database = new AppDatabase(path.join(tempDir, 'app.db'))
    store = new IssueStore(database)
  })

  afterEach(() => {
    database.sqlite.close()
    rmSync(tempDir, { force: true, recursive: true })
  })

  it('when an agent records an issue comment, then the issue exposes it separately from status events', async () => {
    const project = await store.createProject({
      branchPrefix: 'agent',
      description: 'Use isolated task worktrees.',
      name: 'Patchlane',
    })
    const issue = await store.createIssue({
      description: 'Keep users informed while work progresses.',
      priority: 'medium',
      projectId: project.id,
      title: 'Add issue updates',
    })

    const { comment, issue: updatedIssue } = await store.addIssueComment(
      issue.id,
      {
        body: 'I found the relevant issue storage and am wiring the agent tool.',
        kind: 'progress',
        runId: 'run-1',
      },
    )

    expect(comment).toMatchObject({
      author: 'agent',
      body: 'I found the relevant issue storage and am wiring the agent tool.',
      issueId: issue.id,
      kind: 'progress',
      runId: 'run-1',
    })
    expect(updatedIssue.comments).toEqual([comment])
    expect(updatedIssue.events).toHaveLength(1)
    expect(updatedIssue.events[0]?.type).toBe('created')
    expect(updatedIssue.updatedAt).toBe(comment.createdAt)

    const reloaded = await store.getIssue(issue.id)

    expect(reloaded.comments).toEqual([comment])
    expect(reloaded.events).toHaveLength(1)
  })
})
