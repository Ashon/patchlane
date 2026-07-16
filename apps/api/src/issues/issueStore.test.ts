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

  it('when issues are created, then they receive stable project-scoped numbers', async () => {
    const firstProject = await store.createProject({
      branchPrefix: 'agent',
      description: 'Track project scoped issue numbers.',
      name: 'Patchlane',
    })
    const secondProject = await store.createProject({
      branchPrefix: 'agent',
      description: 'Track separate project scoped issue numbers.',
      name: 'Patchlane Labs',
    })

    const firstIssue = await store.createIssue({
      description: 'First issue in the project.',
      priority: 'medium',
      projectId: firstProject.id,
      title: 'Add issue numbers',
    })
    const secondIssue = await store.createIssue({
      description: 'Second issue in the project.',
      priority: 'medium',
      projectId: firstProject.id,
      title: 'Display issue numbers',
    })
    const otherProjectIssue = await store.createIssue({
      description: 'First issue in another project.',
      priority: 'medium',
      projectId: secondProject.id,
      title: 'Start numbering independently',
    })

    expect(firstIssue.number).toBe(1)
    expect(secondIssue.number).toBe(2)
    expect(otherProjectIssue.number).toBe(1)
    expect(firstProject.code).toBe('PLN')
    expect(secondProject.code).toBe('PLX')
    await expect(store.getIssue(secondIssue.id)).resolves.toMatchObject({
      number: 2,
    })
  })

  it('when an issue task plan is stored, then the issue exposes ordered tasks', async () => {
    const project = await store.createProject({
      branchPrefix: 'agent',
      description: 'Use isolated task worktrees.',
      name: 'Patchlane',
    })
    const issue = await store.createIssue({
      description: 'Split complex coding work into inspect, edit, and verify.',
      priority: 'high',
      projectId: project.id,
      title: 'Add task planning',
    })

    const plannedIssue = await store.replaceIssueTasks(issue.id, {
      tasks: [
        {
          description: 'Find the API and UI extension points.',
          kind: 'inspect',
          title: 'Inspect issue workflow',
        },
        {
          description: 'Add the first-class task persistence model.',
          kind: 'edit',
          title: 'Persist issue tasks',
        },
        {
          dependsOnSubtaskIds: ['placeholder'],
          description: 'Run focused unit and type checks.',
          kind: 'verify',
          title: 'Verify task workflow',
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
      'updated with 3 tasks',
    )

    const reloaded = await store.getIssue(issue.id)

    expect(reloaded.subtasks.map((subtask) => subtask.title)).toEqual([
      'Inspect issue workflow',
      'Persist issue tasks',
      'Verify task workflow',
    ])
  })

  it('when issue task runs start and finish, then the issue status rolls up from the task states', async () => {
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
    const plannedIssue = await store.replaceIssueTasks(issue.id, {
      tasks: [
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
    const [firstTask, secondTask] = plannedIssue.subtasks

    const firstStarted = await store.markTaskRunStarted(
      issue.id,
      firstTask!.id,
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
      subtaskId: firstTask!.id,
    })

    expect(firstFinished?.issue.status).toBe('running')
    expect(firstFinished?.subtask?.status).toBe('completed')
    expect(firstFinished?.subtask?.resultSummary).toBe(
      'Model persistence completed.',
    )

    await store.markTaskRunStarted(issue.id, secondTask!.id, 'run-2')
    const secondFinished = await store.markSubtaskRunFinished({
      id: 'run-2',
      issueId: issue.id,
      resultSummary: 'Focused verification passed.',
      status: 'completed',
      subtaskId: secondTask!.id,
    })

    expect(secondFinished?.issue.status).toBe('completed')
    expect(
      secondFinished?.issue.subtasks.every(
        (subtask) => subtask.status === 'completed',
      ),
    ).toBe(true)
  })

  it('when a completed issue is finalized, then its artifact manifest is persisted', async () => {
    const project = await store.createProject({
      branchPrefix: 'agent',
      description: 'Archive finished work.',
      name: 'Patchlane',
    })
    const issue = await store.createIssue({
      description: 'Collect changed files and run summaries.',
      priority: 'medium',
      projectId: project.id,
      title: 'Finalize completed work',
    })
    const plannedIssue = await store.replaceIssueTasks(issue.id, {
      tasks: [
        {
          kind: 'edit',
          title: 'Implement finalize',
        },
      ],
    })
    const [task] = plannedIssue.subtasks

    await store.markTaskRunStarted(issue.id, task!.id, 'run-1')
    const completed = await store.markSubtaskRunFinished({
      id: 'run-1',
      issueId: issue.id,
      resultSummary: 'Finalize flow implemented.',
      status: 'completed',
      subtaskId: task!.id,
    })
    const finalizedAt = new Date().toISOString()
    const finalized = await store.finalizeIssue(completed!.issue.id, {
      finalizedAt,
      changedFiles: [{ path: 'README.md', status: 'M' }],
      comments: 0,
      runs: [
        {
          id: 'run-1',
          kind: 'coding',
          messages: 3,
          providerTokens: 120,
          reasoning: 1,
          status: 'completed',
          toolInputTokens: 5,
          toolOutputTokens: 40,
          tools: 1,
          updatedAt: finalizedAt,
        },
      ],
      summary: '1 changed files · 0 untracked files · 1 agent runs',
      untrackedFiles: [],
      warnings: [],
    })

    expect(finalized.status).toBe('finalized')
    expect(finalized.artifactManifest?.changedFiles).toEqual([
      { path: 'README.md', status: 'M' },
    ])
    expect(finalized.events.at(-1)?.message).toContain('finalized')

    const reloaded = await store.getIssue(issue.id)

    expect(reloaded.status).toBe('finalized')
    expect(reloaded.artifactManifest?.runs[0]?.providerTokens).toBe(120)
  })

  it('when a linked issue task run is deleted, then the task becomes pending again', async () => {
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
    const plannedIssue = await store.replaceIssueTasks(issue.id, {
      tasks: [
        {
          kind: 'edit',
          title: 'Implement retryable work',
        },
      ],
    })
    const [task] = plannedIssue.subtasks

    await store.markRunStarted(issue.id, 'run-1', {
      workspaceId: 'workspace-1',
    })
    await store.markTaskRunStarted(issue.id, task!.id, 'run-1')

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

  it('when a project with issues is removed, then its issues, comments, and tasks are cascaded', async () => {
    const project = await store.createProject({
      branchPrefix: 'agent',
      description: 'Use isolated task worktrees.',
      name: 'Patchlane',
    })
    const issue = await store.createIssue({
      description: 'Work that should be removed alongside its project.',
      priority: 'medium',
      projectId: project.id,
      title: 'Removable issue',
    })
    await store.addIssueComment(issue.id, {
      body: 'Progress note that must not outlive the project.',
      kind: 'progress',
    })
    await store.replaceIssueTasks(issue.id, {
      tasks: [{ kind: 'edit', title: 'Task that must be cascaded' }],
    })

    // foreign_keys is ON, so a project that still has issues can only be
    // removed if removeProject cascades to the child issues first.
    await store.removeProject(project.id)

    await expect(store.getProject(project.id)).rejects.toThrow()
    expect(await store.listIssues()).toEqual([])

    const remainingComments = database.sqlite
      .prepare(
        'SELECT COUNT(*) AS count FROM issue_comments WHERE issue_id = ?',
      )
      .get(issue.id) as { count: number }
    const remainingTasks = database.sqlite
      .prepare(
        'SELECT COUNT(*) AS count FROM issue_subtasks WHERE issue_id = ?',
      )
      .get(issue.id) as { count: number }

    expect(remainingComments.count).toBe(0)
    expect(remainingTasks.count).toBe(0)
  })

  it('when a missing project is removed, then it reports not found', async () => {
    await expect(store.removeProject('does-not-exist')).rejects.toThrow()
  })
})
