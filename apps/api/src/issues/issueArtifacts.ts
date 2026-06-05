import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  issueArtifactManifestSchema,
  type AgentRun,
  type Issue,
  type IssueArtifactManifest,
  type SandboxWorkspace,
} from '@patchlane/shared'
import type { AgentRunStore } from '../agent/agentRunStore'
import type { SandboxWorkspaceStore } from '../sandbox/sandboxWorkspaceStore'

const execFileAsync = promisify(execFile)

type BuildIssueArtifactManifestInput = {
  issue: Issue
  runStore: AgentRunStore
  workspaceStore: SandboxWorkspaceStore
}

export const buildIssueArtifactManifest = async ({
  issue,
  runStore,
  workspaceStore,
}: BuildIssueArtifactManifestInput): Promise<IssueArtifactManifest> => {
  const finalizedAt = new Date().toISOString()
  const runs = await getIssueRuns(issue, runStore)
  const workspace = await getArtifactWorkspace({
    issue,
    runs,
    workspaceStore,
  })
  const warnings: string[] = []

  if (!workspace) {
    warnings.push('No task workspace was available for artifact collection.')
  }

  const gitStatus = workspace
    ? await getGitStatus(workspace).catch((error: unknown) => {
        warnings.push(getErrorMessage(error))
        return { changedFiles: [], untrackedFiles: [] }
      })
    : { changedFiles: [], untrackedFiles: [] }

  if (gitStatus.changedFiles.length === 0) {
    warnings.push('No tracked file changes were detected.')
  }

  if (gitStatus.untrackedFiles.length > 0) {
    warnings.push(`${gitStatus.untrackedFiles.length} untracked files remain.`)
  }

  return issueArtifactManifestSchema.parse({
    finalizedAt,
    workspaceId: workspace?.id,
    workspacePath: workspace?.path,
    branchName: issue.branchName ?? workspace?.branchName,
    changedFiles: gitStatus.changedFiles,
    untrackedFiles: gitStatus.untrackedFiles,
    runs: runs.map(toArtifactRun),
    comments: issue.comments.length,
    summary: [
      `${gitStatus.changedFiles.length} changed files`,
      `${gitStatus.untrackedFiles.length} untracked files`,
      `${runs.length} agent runs`,
    ].join(' · '),
    warnings,
  })
}

const getIssueRuns = async (issue: Issue, runStore: AgentRunStore) => {
  const ids = new Set(
    [
      issue.requirementRunId,
      issue.planningRunId,
      issue.agentRunId,
      ...issue.subtasks.map((task) => task.agentRunId),
    ].filter((id): id is string => Boolean(id)),
  )
  const runs: AgentRun[] = []

  for (const id of ids) {
    const run = await runStore.find(id)

    if (run) {
      runs.push(run)
    }
  }

  return runs.sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  )
}

const getArtifactWorkspace = async ({
  issue,
  runs,
  workspaceStore,
}: {
  issue: Issue
  runs: AgentRun[]
  workspaceStore: SandboxWorkspaceStore
}) => {
  const workspaceIds = [
    issue.workspaceId,
    ...runs
      .slice()
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((run) => run.workspaceId),
  ].filter((id): id is string => Boolean(id))

  for (const workspaceId of workspaceIds) {
    const workspace = await workspaceStore.get(workspaceId).catch(() => null)

    if (workspace?.kind === 'task_worktree') {
      return workspace
    }
  }

  for (const workspaceId of workspaceIds) {
    const workspace = await workspaceStore.get(workspaceId).catch(() => null)

    if (workspace) {
      return workspace
    }
  }

  return undefined
}

const getGitStatus = async (workspace: SandboxWorkspace) => {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', workspace.path, 'status', '--porcelain=v1', '--untracked-files=all'],
    { maxBuffer: 1024 * 1024 },
  )
  const entries = stdout
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map(parseStatusLine)

  return {
    changedFiles: entries.filter((entry) => !entry.untracked),
    untrackedFiles: entries.filter((entry) => entry.untracked),
  }
}

const parseStatusLine = (line: string) => {
  const status = line.slice(0, 2).trim() || line.slice(0, 2)
  const rawPath = line.slice(3)
  const path = rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1)! : rawPath

  return {
    path,
    status,
    untracked: status === '??',
  }
}

const toArtifactRun = (run: AgentRun) => {
  return {
    id: run.id,
    status: run.status,
    kind: run.kind,
    taskId: run.subtaskId,
    messages: run.messages.length,
    tools: run.messages.filter((message) => message.role === 'tool').length,
    reasoning: run.messages.filter(
      (message) => (message.metadata?.reasoning?.characters ?? 0) > 0,
    ).length,
    providerTokens: getProviderTokens(run),
    toolInputTokens: sumToolTokens(run, 'input'),
    toolOutputTokens: sumToolTokens(run, 'output'),
    updatedAt: run.updatedAt,
  }
}

const getProviderTokens = (run: AgentRun) => {
  const seenRequests = new Set<string>()
  let total = 0

  for (const message of run.messages) {
    const usage = message.metadata?.usage

    if (!usage) {
      continue
    }

    const key = JSON.stringify({
      request: message.metadata?.request ?? null,
      usage,
    })

    if (seenRequests.has(key)) {
      continue
    }

    seenRequests.add(key)
    total += usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)
  }

  return total
}

const sumToolTokens = (run: AgentRun, field: 'input' | 'output') => {
  return run.messages.reduce((total, message) => {
    return total + (message.metadata?.tool?.[field]?.estimatedTokens ?? 0)
  }, 0)
}

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : 'Artifact collection failed.'
}
