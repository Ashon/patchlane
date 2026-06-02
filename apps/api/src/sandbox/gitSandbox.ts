import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { SandboxSettings, SandboxWorkspace } from '@agent-fleet/shared'
import { buildSandboxEnv } from './sandboxExecutor'
import { runProcess } from './processRunner'

type CloneRepositoryInput = {
  repositoryUrl: string
  ref?: string
  settings: SandboxSettings
  target: SandboxWorkspace
  githubToken?: string
}

type RepositoryCacheInput = CloneRepositoryInput

type CreateWorktreeInput = {
  baseRef?: string
  branchName: string
  cache: SandboxWorkspace
  githubToken?: string
  settings: SandboxSettings
  target: SandboxWorkspace
}

type RemoveWorktreeInput = {
  cache: SandboxWorkspace
  githubToken?: string
  settings: SandboxSettings
  target: SandboxWorkspace
}

export const cloneRepositoryIntoSandbox = async ({
  repositoryUrl,
  ref,
  settings,
  target,
  githubToken,
}: CloneRepositoryInput) => {
  const env = buildSandboxEnv(
    settings.envAllowlist,
    getGitAuthEnv(repositoryUrl, githubToken),
  )
  const cloneResult = await runProcess({
    command: 'git',
    args: ['clone', repositoryUrl, target.path],
    cwd: settings.rootDir,
    env,
    timeoutMs: settings.defaultTimeoutMs,
    maxOutputBytes: settings.maxOutputBytes,
  })

  if (!cloneResult.ok) {
    throw new Error(
      getFailureMessage('git clone', cloneResult.stderr || cloneResult.stdout),
    )
  }

  if (!ref) {
    return
  }

  const checkoutResult = await runProcess({
    command: 'git',
    args: ['checkout', ref],
    cwd: target.path,
    env,
    timeoutMs: settings.defaultTimeoutMs,
    maxOutputBytes: settings.maxOutputBytes,
  })

  if (!checkoutResult.ok) {
    throw new Error(
      getFailureMessage(
        'git checkout',
        checkoutResult.stderr || checkoutResult.stdout,
      ),
    )
  }
}

export const ensureRepositoryCache = async ({
  repositoryUrl,
  ref,
  settings,
  target,
  githubToken,
}: RepositoryCacheInput) => {
  const env = buildSandboxEnv(
    settings.envAllowlist,
    getGitAuthEnv(repositoryUrl, githubToken),
  )

  if (!(await pathExists(path.join(target.path, '.git')))) {
    await mkdir(path.dirname(target.path), { recursive: true })

    const cloneResult = await runProcess({
      command: 'git',
      args: ['clone', repositoryUrl, target.path],
      cwd: settings.rootDir,
      env,
      timeoutMs: settings.defaultTimeoutMs,
      maxOutputBytes: settings.maxOutputBytes,
    })

    if (!cloneResult.ok) {
      throw new Error(
        getFailureMessage(
          'git clone',
          cloneResult.stderr || cloneResult.stdout,
        ),
      )
    }
  } else {
    const remoteResult = await runProcess({
      command: 'git',
      args: ['remote', 'set-url', 'origin', repositoryUrl],
      cwd: target.path,
      env,
      timeoutMs: settings.defaultTimeoutMs,
      maxOutputBytes: settings.maxOutputBytes,
    })

    if (!remoteResult.ok) {
      throw new Error(
        getFailureMessage(
          'git remote set-url',
          remoteResult.stderr || remoteResult.stdout,
        ),
      )
    }
  }

  const fetchResult = await runProcess({
    command: 'git',
    args: ['fetch', '--prune', 'origin'],
    cwd: target.path,
    env,
    timeoutMs: settings.defaultTimeoutMs,
    maxOutputBytes: settings.maxOutputBytes,
  })

  if (!fetchResult.ok) {
    throw new Error(
      getFailureMessage('git fetch', fetchResult.stderr || fetchResult.stdout),
    )
  }

  const resolvedRef = await resolveBaseRef({
    cwd: target.path,
    env,
    ref,
    settings,
  })
  const checkoutResult = await runProcess({
    command: 'git',
    args: ['checkout', resolvedRef],
    cwd: target.path,
    env,
    timeoutMs: settings.defaultTimeoutMs,
    maxOutputBytes: settings.maxOutputBytes,
  })

  if (!checkoutResult.ok) {
    throw new Error(
      getFailureMessage(
        'git checkout',
        checkoutResult.stderr || checkoutResult.stdout,
      ),
    )
  }

  return resolvedRef
}

export const createWorktreeFromCache = async ({
  baseRef,
  branchName,
  cache,
  githubToken,
  settings,
  target,
}: CreateWorktreeInput) => {
  if (!cache.repositoryUrl) {
    throw new Error('Project repository cache does not have a repository URL')
  }

  const env = buildSandboxEnv(
    settings.envAllowlist,
    getGitAuthEnv(cache.repositoryUrl, githubToken),
  )
  const fetchResult = await runProcess({
    command: 'git',
    args: ['fetch', '--prune', 'origin'],
    cwd: cache.path,
    env,
    timeoutMs: settings.defaultTimeoutMs,
    maxOutputBytes: settings.maxOutputBytes,
  })

  if (!fetchResult.ok) {
    throw new Error(
      getFailureMessage('git fetch', fetchResult.stderr || fetchResult.stdout),
    )
  }

  const resolvedRef = await resolveBaseRef({
    cwd: cache.path,
    env,
    ref: baseRef ?? cache.ref,
    settings,
  })
  await mkdir(path.dirname(target.path), { recursive: true })

  const worktreeResult = await runProcess({
    command: 'git',
    args: ['worktree', 'add', '-b', branchName, target.path, resolvedRef],
    cwd: cache.path,
    env,
    timeoutMs: settings.defaultTimeoutMs,
    maxOutputBytes: settings.maxOutputBytes,
  })

  if (!worktreeResult.ok) {
    throw new Error(
      getFailureMessage(
        'git worktree add',
        worktreeResult.stderr || worktreeResult.stdout,
      ),
    )
  }

  return resolvedRef
}

export const removeWorktreeFromCache = async ({
  cache,
  githubToken,
  settings,
  target,
}: RemoveWorktreeInput) => {
  if (!cache.repositoryUrl) {
    return
  }

  const env = buildSandboxEnv(
    settings.envAllowlist,
    getGitAuthEnv(cache.repositoryUrl, githubToken),
  )
  const removeResult = await runProcess({
    command: 'git',
    args: ['worktree', 'remove', '--force', target.path],
    cwd: cache.path,
    env,
    timeoutMs: settings.defaultTimeoutMs,
    maxOutputBytes: settings.maxOutputBytes,
  })

  if (!removeResult.ok && (await pathExists(target.path))) {
    throw new Error(
      getFailureMessage(
        'git worktree remove',
        removeResult.stderr || removeResult.stdout,
      ),
    )
  }

  await runProcess({
    command: 'git',
    args: ['worktree', 'prune'],
    cwd: cache.path,
    env,
    timeoutMs: settings.defaultTimeoutMs,
    maxOutputBytes: settings.maxOutputBytes,
  })
}

export const getGitAuthEnv = (
  repositoryUrl: string,
  githubToken?: string,
): NodeJS.ProcessEnv => {
  if (!githubToken) {
    return {}
  }

  const parsed = new URL(repositoryUrl)

  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
    return {}
  }

  const credential = Buffer.from(
    `x-access-token:${githubToken}`,
    'utf8',
  ).toString('base64')

  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: `http.${parsed.origin}/.extraheader`,
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${credential}`,
  }
}

const getFailureMessage = (operation: string, output: string) => {
  const trimmed = output.trim()
  return trimmed ? `${operation} failed: ${trimmed}` : `${operation} failed`
}

const resolveBaseRef = async ({
  cwd,
  env,
  ref,
  settings,
}: {
  cwd: string
  env: NodeJS.ProcessEnv
  ref?: string
  settings: SandboxSettings
}) => {
  const candidates = buildBaseRefCandidates(ref)

  for (const candidate of candidates) {
    const result = await runProcess({
      command: 'git',
      args: ['rev-parse', '--verify', `${candidate}^{commit}`],
      cwd,
      env,
      timeoutMs: settings.defaultTimeoutMs,
      maxOutputBytes: settings.maxOutputBytes,
    })

    if (result.ok) {
      return candidate
    }
  }

  throw new Error(`Could not resolve base ref '${ref || 'origin/HEAD'}'`)
}

const buildBaseRefCandidates = (ref?: string) => {
  const trimmed = ref?.trim()

  if (!trimmed) {
    return ['origin/HEAD', 'origin/main', 'origin/master', 'HEAD']
  }

  if (trimmed.startsWith('origin/') || trimmed.startsWith('refs/')) {
    return [trimmed, 'HEAD']
  }

  return [`origin/${trimmed}`, trimmed, 'HEAD']
}

const pathExists = async (targetPath: string) => {
  try {
    await stat(targetPath)
    return true
  } catch {
    return false
  }
}
