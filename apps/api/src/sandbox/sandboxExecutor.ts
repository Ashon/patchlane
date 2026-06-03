import path from 'node:path'
import {
  sandboxExecRequestSchema,
  sandboxSettingsSchema,
  type SandboxExecRequest,
  type SandboxSettings,
  type SandboxWorkspace,
} from '@patchlane/shared'
import { badRequest } from '../http/errors'
import { ensureWithinRoot } from './sandboxWorkspaceStore'
import { runProcess } from './processRunner'

export const executeSandboxCommand = async (
  settingsInput: SandboxSettings,
  workspace: SandboxWorkspace,
  input: SandboxExecRequest,
  extraEnv: NodeJS.ProcessEnv = {},
) => {
  const settings = sandboxSettingsSchema.parse(settingsInput)
  const request = sandboxExecRequestSchema.parse(input)
  const args = normalizeCommandArgs(request.command, request.args)

  if (!settings.allowedCommands.includes(request.command)) {
    throw badRequest(
      `Command '${request.command}' is not allowed in the sandbox`,
    )
  }

  const cwd = ensureWorkspacePath(workspace, request.cwd)
  validateCommandRequest(workspace, request.command, args)

  return runProcess({
    command: request.command,
    args,
    cwd,
    env: buildSandboxEnv(settings.envAllowlist, extraEnv),
    timeoutMs: request.timeoutMs ?? settings.defaultTimeoutMs,
    maxOutputBytes: settings.maxOutputBytes,
  })
}

export const ensureWorkspacePath = (
  workspace: SandboxWorkspace,
  requestedPath?: string,
) => {
  const candidate = requestedPath
    ? path.resolve(workspace.path, requestedPath)
    : workspace.path
  return ensureWithinRoot(workspace.path, candidate)
}

export const buildSandboxEnv = (
  allowlist: string[],
  extraEnv: NodeJS.ProcessEnv = {},
) => {
  const env: NodeJS.ProcessEnv = {
    CI: 'true',
    GIT_TERMINAL_PROMPT: '0',
  }

  for (const key of allowlist) {
    const value = process.env[key]

    if (value !== undefined) {
      env[key] = value
    }
  }

  return {
    ...env,
    ...extraEnv,
  }
}

const validateCommandRequest = (
  workspace: SandboxWorkspace,
  command: string,
  args: string[],
) => {
  if (command === 'git') {
    validateGitCommand(args)
    return
  }

  if (command === 'find') {
    validateFindCommand(workspace, args)
    return
  }

  if (command === 'rm') {
    validateRmCommand(workspace, args)
    return
  }

  if (command === 'chmod') {
    validateChmodCommand(workspace, args)
    return
  }

  if (pathGuardedCommands.has(command)) {
    validatePathArgs(workspace, command, args)
  }
}

const normalizeCommandArgs = (command: string, args: string[]) => {
  if (args[0] === command) {
    return args.slice(1)
  }

  return args
}

const blockedGitSubcommands = new Set([
  'reset',
  'clean',
  'restore',
  'checkout',
  'switch',
  'rebase',
  'stash',
  'worktree',
])
const blockedFindActions = new Set([
  '-delete',
  '-exec',
  '-execdir',
  '-ok',
  '-okdir',
])
const pathGuardedCommands = new Set(['mkdir', 'cp', 'mv', 'touch'])

const validateGitCommand = (args: string[]) => {
  const subcommand = args.find((arg) => !arg.startsWith('-'))

  if (subcommand && blockedGitSubcommands.has(subcommand)) {
    throw badRequest(`Git subcommand '${subcommand}' is blocked in the sandbox`)
  }
}

const validateFindCommand = (workspace: SandboxWorkspace, args: string[]) => {
  for (const arg of args) {
    if (blockedFindActions.has(arg)) {
      throw badRequest(`find action '${arg}' is blocked in the sandbox`)
    }
  }

  for (const arg of getFindPathArgs(args)) {
    validateWorkspacePathArg(workspace, 'find', arg)
  }
}

const getFindPathArgs = (args: string[]) => {
  const pathArgs: string[] = []

  for (const arg of args) {
    if (arg.startsWith('-') || arg === '(' || arg === '!') {
      break
    }

    pathArgs.push(arg)
  }

  return pathArgs
}

const validateRmCommand = (workspace: SandboxWorkspace, args: string[]) => {
  for (const arg of args) {
    if (isRecursiveRmFlag(arg)) {
      throw badRequest(
        'Recursive rm is blocked in the sandbox; use a dedicated cleanup action instead',
      )
    }
  }

  validatePathArgs(workspace, 'rm', args)
}

const isRecursiveRmFlag = (arg: string) => {
  if (arg === '--recursive') {
    return true
  }

  return arg.startsWith('-') && !arg.startsWith('--') && /[rR]/u.test(arg)
}

const validateChmodCommand = (workspace: SandboxWorkspace, args: string[]) => {
  const paths = args.filter((arg) => !arg.startsWith('-')).slice(1)
  validatePathArgs(workspace, 'chmod', paths)
}

const validatePathArgs = (
  workspace: SandboxWorkspace,
  command: string,
  args: string[],
) => {
  for (const arg of args) {
    if (arg === '--' || arg.startsWith('-')) {
      continue
    }

    validateWorkspacePathArg(workspace, command, arg)
  }
}

const validateWorkspacePathArg = (
  workspace: SandboxWorkspace,
  command: string,
  arg: string,
) => {
  if (path.isAbsolute(arg)) {
    throw badRequest(
      `Command '${command}' cannot access absolute path '${arg}'`,
    )
  }

  try {
    ensureWorkspacePath(workspace, arg)
  } catch {
    throw badRequest(
      `Command '${command}' cannot access path outside the workspace: '${arg}'`,
    )
  }
}
