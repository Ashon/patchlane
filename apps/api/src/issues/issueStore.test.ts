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

  it('when an issue work plan is stored, then the issue exposes ordered subtasks', async () => {
    const project = await store.createProject({
      branchPrefix: 'agent',
      description: 'Use isolated task worktrees.',
      name: 'Patchlane',
    })
    const issue = await store.createIssue({
      description: 'Split complex coding work into inspect, edit, and verify.',
      priority: 'high',
      projectId: project.id,
      title: 'Add subtask planning',
    })

    const plannedIssue = await store.replaceIssueSubtasks(issue.id, {
      subtasks: [
        {
          description: 'Find the API and UI extension points.',
          kind: 'inspect',
          title: 'Inspect issue workflow',
        },
        {
          description: 'Add the first-class subtask persistence model.',
          kind: 'edit',
          title: 'Persist issue subtasks',
        },
        {
          dependsOnSubtaskIds: ['placeholder'],
          description: 'Run focused unit and type checks.',
          kind: 'verify',
          title: 'Verify subtask workflow',
        },
      ],
    })

    expect(plannedIssue.status).toBe('ready')
    expect(plannedIssue.subtasks).toHaveLength(3)
    expect(plannedIssue.subtasks.map((subtask) => subtask.sequence)).toEqual([
      0, 1, 2,
    ])
    expect(plannedIssue.subtasks.map((subtask) => subtask.kind)).toEqual([
      'inspect',
      'edit',
      'verify',
    ])
    expect(plannedIssue.events.at(-1)?.message).toContain(
      'updated with 3 subtasks',
    )

    const reloaded = await store.getIssue(issue.id)

    expect(reloaded.subtasks.map((subtask) => subtask.title)).toEqual([
      'Inspect issue workflow',
      'Persist issue subtasks',
      'Verify subtask workflow',
    ])
  })

  it('when subtask runs start and finish, then the issue status rolls up from the subtask states', async () => {
    const project = await store.createProject({
      branchPrefix: 'agent',
      description: 'Use isolated task worktrees.',
      name: 'Patchlane',
    })
    const issue = await store.createIssue({
      description: 'Complete two ordered pieces of work.',
      priority: 'medium',
      projectId: project.id,
      title: 'Complete planned work',
    })
    const plannedIssue = await store.replaceIssueSubtasks(issue.id, {
      subtasks: [
        {
          kind: 'edit',
          title: 'Implement the model',
        },
        {
          kind: 'verify',
          title: 'Verify the model',
        },
      ],
    })
    const [firstSubtask, secondSubtask] = plannedIssue.subtasks

    const firstStarted = await store.markSubtaskRunStarted(
      issue.id,
      firstSubtask!.id,
      'run-1',
    )

    expect(firstStarted.issue.status).toBe('running')
    expect(firstStarted.subtask.agentRunId).toBe('run-1')
    expect(firstStarted.subtask.status).toBe('running')

    const firstFinished = await store.markSubtaskRunFinished({
      id: 'run-1',
      issueId: issue.id,
      resultSummary: 'Model persistence completed.',
      status: 'completed',
      subtaskId: firstSubtask!.id,
    })

    expect(firstFinished?.issue.status).toBe('running')
    expect(firstFinished?.subtask?.status).toBe('completed')
    expect(firstFinished?.subtask?.resultSummary).toBe(
      'Model persistence completed.',
    )

    await store.markSubtaskRunStarted(issue.id, secondSubtask!.id, 'run-2')
    const secondFinished = await store.markSubtaskRunFinished({
      id: 'run-2',
      issueId: issue.id,
      resultSummary: 'Focused verification passed.',
      status: 'completed',
      subtaskId: secondSubtask!.id,
    })

    expect(secondFinished?.issue.status).toBe('completed')
    expect(
      secondFinished?.issue.subtasks.every(
        (subtask) => subtask.status === 'completed',
      ),
    ).toBe(true)
  })

  it('when a linked subtask run is deleted, then the subtask becomes pending again', async () => {
    const project = await store.createProject({
      branchPrefix: 'agent',
      description: 'Use isolated task worktrees.',
      name: 'Patchlane',
    })
    const issue = await store.createIssue({
      description: 'Run can be discarded and retried from the same plan.',
      priority: 'medium',
      projectId: project.id,
      title: 'Retry planned work',
    })
    const plannedIssue = await store.replaceIssueSubtasks(issue.id, {
      subtasks: [
        {
          kind: 'edit',
          title: 'Implement retryable work',
        },
      ],
    })
    const [subtask] = plannedIssue.subtasks

    await store.markRunStarted(issue.id, 'run-1', {
      workspaceId: 'workspace-1',
    })
    await store.markSubtaskRunStarted(issue.id, subtask!.id, 'run-1')

    const updatedIssue = await store.unlinkAgentRunReferences({
      id: 'run-1',
      issueId: issue.id,
      workspaceId: 'workspace-1',
    })

    expect(updatedIssue?.status).toBe('ready')
    expect(updatedIssue?.agentRunId).toBeUndefined()
    expect(updatedIssue?.subtasks[0]?.status).toBe('pending')
    expect(updatedIssue?.subtasks[0]?.agentRunId).toBeUndefined()
  })
})
