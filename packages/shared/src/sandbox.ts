import { z } from 'zod'

const isoDateSchema = z.string().datetime()

export const sandboxCommandSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(
    /^[A-Za-z0-9._+-]+$/,
    'Use a command name without spaces or shell metacharacters',
  )

export const sandboxSettingsSchema = z.object({
  rootDir: z.string().trim().min(1),
  defaultTimeoutMs: z.number().int().min(1_000).max(600_000).default(120_000),
  maxOutputBytes: z.number().int().min(4_096).max(1_048_576).default(131_072),
  allowedCommands: z.array(sandboxCommandSchema).min(1),
  envAllowlist: z
    .array(z.string().trim().min(1))
    .default(['PATH', 'HOME', 'LANG', 'LC_ALL']),
})

export const sandboxWorkspaceStatusSchema = z.enum(['ready', 'error'])
export const sandboxWorkspaceKindSchema = z.enum([
  'manual',
  'project_cache',
  'task_worktree',
])
export const sandboxWorkspaceCleanupStatusSchema = z.enum([
  'active',
  'archived',
  'deleted',
  'cleanup_failed',
])

export const sandboxWorkspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  path: z.string().min(1),
  repositoryUrl: z.string().url().optional(),
  ref: z.string().trim().min(1).max(200).optional(),
  kind: sandboxWorkspaceKindSchema.default('manual'),
  projectId: z.string().min(1).optional(),
  issueId: z.string().min(1).optional(),
  agentRunId: z.string().min(1).optional(),
  parentWorkspaceId: z.string().min(1).optional(),
  baseRef: z.string().trim().min(1).max(200).optional(),
  branchName: z.string().trim().min(1).max(200).optional(),
  cleanupStatus: sandboxWorkspaceCleanupStatusSchema.default('active'),
  status: sandboxWorkspaceStatusSchema,
  error: z.string().optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export const sandboxWorkspaceListSchema = z.array(sandboxWorkspaceSchema)

export const createSandboxWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  repositoryUrl: z.string().trim().url().optional(),
  ref: z.string().trim().min(1).max(200).optional(),
  kind: sandboxWorkspaceKindSchema.optional(),
  projectId: z.string().min(1).optional(),
  issueId: z.string().min(1).optional(),
  agentRunId: z.string().min(1).optional(),
  parentWorkspaceId: z.string().min(1).optional(),
  baseRef: z.string().trim().min(1).max(200).optional(),
  branchName: z.string().trim().min(1).max(200).optional(),
  cleanupStatus: sandboxWorkspaceCleanupStatusSchema.optional(),
})

export const sandboxExecRequestSchema = z.object({
  command: sandboxCommandSchema,
  args: z.array(z.string().max(1_000)).max(40).default([]),
  cwd: z.string().trim().min(1).max(500).optional(),
  timeoutMs: z.number().int().min(1_000).max(600_000).optional(),
})

export const sandboxFilePathSchema = z
  .string()
  .trim()
  .max(1_000)
  .transform((value) => value || '.')

export const sandboxWriteFileRequestSchema = z.object({
  path: z.string().trim().min(1).max(1_000),
  content: z.string().max(2_000_000),
})

export type SandboxSettings = z.infer<typeof sandboxSettingsSchema>
export type SandboxWorkspaceKind = z.infer<typeof sandboxWorkspaceKindSchema>
export type SandboxWorkspaceCleanupStatus = z.infer<
  typeof sandboxWorkspaceCleanupStatusSchema
>
export type SandboxWorkspace = z.infer<typeof sandboxWorkspaceSchema>
export type CreateSandboxWorkspaceInput = z.infer<
  typeof createSandboxWorkspaceSchema
>
export type SandboxExecRequest = z.infer<typeof sandboxExecRequestSchema>
export type SandboxWriteFileRequest = z.infer<
  typeof sandboxWriteFileRequestSchema
>

export type SandboxFileEntry = {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modifiedAt?: string
}

export type SandboxFileContent = {
  path: string
  content: string
  size: number
  modifiedAt: string
}

export type SandboxGitStatus = {
  ok: boolean
  branch?: string
  entries: string[]
  raw: string
  error?: string
}

export type SandboxGitDiff = {
  ok: boolean
  diff: string
  error?: string
}

export type SandboxExecResult = {
  ok: boolean
  command: string
  args: string[]
  cwd: string
  exitCode: number | null
  signal: string | null
  durationMs: number
  stdout: string
  stderr: string
  truncated: boolean
  timedOut: boolean
}
