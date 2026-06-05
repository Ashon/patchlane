import { z } from 'zod'

const isoDateSchema = z.string().datetime()
const optionalTextSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}, z.string().max(8_000).optional())
const optionalUrlSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}, z.string().url().optional())
const optionalShortTextSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}, z.string().max(200).optional())
const projectCodeSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const normalized = value.trim().toUpperCase()
  return normalized.length > 0 ? normalized : undefined
}, z.string().regex(/^[A-Z][A-Z0-9]{1,7}$/))
const optionalProjectCodeSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const normalized = value.trim().toUpperCase()
  return normalized.length > 0 ? normalized : undefined
}, z.string().regex(/^[A-Z][A-Z0-9]{1,7}$/).optional())

export const agentProjectSchema = z.object({
  id: z.string().min(1),
  code: projectCodeSchema,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(1_000),
  repositoryUrl: optionalUrlSchema,
  repositoryRef: optionalShortTextSchema,
  workspaceId: z.string().min(1).optional(),
  defaultEndpointId: z.string().min(1).optional(),
  branchPrefix: z.string().trim().min(1).max(80).default('agent'),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export const createAgentProjectSchema = z.object({
  code: optionalProjectCodeSchema,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(1_000),
  repositoryUrl: optionalUrlSchema,
  repositoryRef: optionalShortTextSchema,
  workspaceId: z.string().min(1).optional(),
  defaultEndpointId: z.string().min(1).optional(),
  branchPrefix: z.string().trim().min(1).max(80).default('agent'),
})

export const updateAgentProjectSchema = createAgentProjectSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  })

export const issueStatusSchema = z.enum([
  'backlog',
  'planning',
  'ready',
  'running',
  'awaiting_user',
  'review',
  'completed',
  'finalized',
  'blocked',
  'failed',
])
export const issuePrioritySchema = z.enum(['low', 'medium', 'high', 'urgent'])
export const issueSubtaskStatusSchema = z.enum([
  'pending',
  'running',
  'awaiting_user',
  'completed',
  'failed',
  'skipped',
])
export const issueSubtaskKindSchema = z.enum([
  'inspect',
  'edit',
  'verify',
  'publish',
  'followup',
])
export const issueCommentAuthorSchema = z.enum(['agent', 'user', 'system'])
export const issueCommentKindSchema = z.enum([
  'progress',
  'decision',
  'blocked',
  'summary',
])

export const issueEventSchema = z.object({
  id: z.string().min(1),
  issueId: z.string().min(1),
  type: z.enum([
    'created',
    'updated',
    'analyzed',
    'run_started',
    'status_changed',
  ]),
  message: z.string().min(1).max(4_000),
  createdAt: isoDateSchema,
})

export const issueCommentSchema = z.object({
  id: z.string().min(1),
  issueId: z.string().min(1),
  runId: z.string().min(1).optional(),
  author: issueCommentAuthorSchema.default('agent'),
  kind: issueCommentKindSchema.default('progress'),
  body: z.string().trim().min(1).max(4_000),
  createdAt: isoDateSchema,
})

export const issueArtifactFileSchema = z.object({
  path: z.string().min(1).max(1_000),
  status: z.string().min(1).max(40),
  untracked: z.boolean().optional(),
})

export const issueArtifactRunSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1).max(40),
  kind: z.string().min(1).max(40).optional(),
  taskId: z.string().min(1).optional(),
  messages: z.number().int().nonnegative(),
  tools: z.number().int().nonnegative(),
  reasoning: z.number().int().nonnegative(),
  providerTokens: z.number().int().nonnegative(),
  toolInputTokens: z.number().int().nonnegative(),
  toolOutputTokens: z.number().int().nonnegative(),
  updatedAt: isoDateSchema,
})

export const issueArtifactManifestSchema = z.object({
  finalizedAt: isoDateSchema,
  workspaceId: z.string().min(1).optional(),
  workspacePath: z.string().min(1).optional(),
  branchName: z.string().trim().min(1).max(200).optional(),
  changedFiles: z.array(issueArtifactFileSchema).default([]),
  untrackedFiles: z.array(issueArtifactFileSchema).default([]),
  runs: z.array(issueArtifactRunSchema).default([]),
  comments: z.number().int().nonnegative(),
  summary: z.string().trim().min(1).max(2_000).optional(),
  warnings: z.array(z.string().trim().min(1).max(500)).default([]),
})

export const issueSubtaskSchema = z.object({
  id: z.string().min(1),
  issueId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  description: optionalTextSchema,
  status: issueSubtaskStatusSchema.default('pending'),
  kind: issueSubtaskKindSchema.default('edit'),
  sequence: z.number().int().nonnegative(),
  dependsOnSubtaskIds: z.array(z.string().min(1)).default([]),
  agentRunId: z.string().min(1).optional(),
  resultSummary: optionalTextSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export const issueSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().positive(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(20_000),
  projectId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  endpointId: z.string().min(1).optional(),
  requirementRunId: z.string().min(1).optional(),
  planningRunId: z.string().min(1).optional(),
  agentRunId: z.string().min(1).optional(),
  status: issueStatusSchema,
  priority: issuePrioritySchema,
  analysis: optionalTextSchema,
  branchName: z.string().trim().min(1).max(200).optional(),
  prUrl: z.string().url().optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  events: z.array(issueEventSchema).default([]),
  comments: z.array(issueCommentSchema).default([]),
  subtasks: z.array(issueSubtaskSchema).default([]),
  artifactManifest: issueArtifactManifestSchema.optional(),
})

export const createIssueSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(20_000),
  projectId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  endpointId: z.string().min(1).optional(),
  priority: issuePrioritySchema.default('medium'),
})

export const updateIssueSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().min(1).max(20_000).optional(),
    projectId: z.string().min(1).optional(),
    workspaceId: z.string().min(1).optional(),
    endpointId: z.string().min(1).optional(),
    requirementRunId: z.string().min(1).optional(),
    planningRunId: z.string().min(1).optional(),
    status: issueStatusSchema.optional(),
    priority: issuePrioritySchema.optional(),
    analysis: optionalTextSchema,
    branchName: z.string().trim().min(1).max(200).optional(),
    prUrl: z.string().url().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  })

export const startIssueSchema = z.object({
  endpointId: z.string().min(1).optional(),
})

export const createIssueCommentSchema = z.object({
  runId: z.string().min(1).optional(),
  author: issueCommentAuthorSchema.default('agent'),
  kind: issueCommentKindSchema.default('progress'),
  body: z.string().trim().min(1).max(4_000),
})

export const createIssueSubtaskSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: optionalTextSchema,
  kind: issueSubtaskKindSchema.default('edit'),
  sequence: z.number().int().nonnegative().optional(),
  dependsOnSubtaskIds: z.array(z.string().min(1)).default([]),
})

export const replaceIssueSubtasksSchema = z.object({
  subtasks: z.array(createIssueSubtaskSchema).min(1).max(20),
})

export const issueTaskStatusSchema = issueSubtaskStatusSchema
export const issueTaskKindSchema = issueSubtaskKindSchema
export const issueTaskSchema = issueSubtaskSchema
export const createIssueTaskSchema = createIssueSubtaskSchema
export const replaceIssueTasksSchema = z.object({
  tasks: z.array(createIssueTaskSchema).min(1).max(20),
})

export const updateIssueSubtaskSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: optionalTextSchema,
    status: issueSubtaskStatusSchema.optional(),
    kind: issueSubtaskKindSchema.optional(),
    sequence: z.number().int().nonnegative().optional(),
    dependsOnSubtaskIds: z.array(z.string().min(1)).optional(),
    agentRunId: z.string().min(1).optional(),
    resultSummary: optionalTextSchema,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  })
export const updateIssueTaskSchema = updateIssueSubtaskSchema

export const agentProjectListSchema = z.array(agentProjectSchema)
export const issueListSchema = z.array(issueSchema)

export type AgentProject = z.infer<typeof agentProjectSchema>
export type CreateAgentProjectInput = z.infer<typeof createAgentProjectSchema>
export type UpdateAgentProjectInput = z.infer<typeof updateAgentProjectSchema>
export type Issue = z.infer<typeof issueSchema>
export type IssueStatus = z.infer<typeof issueStatusSchema>
export type IssuePriority = z.infer<typeof issuePrioritySchema>
export type IssueArtifactManifest = z.infer<
  typeof issueArtifactManifestSchema
>
export type IssueSubtask = z.infer<typeof issueSubtaskSchema>
export type IssueSubtaskStatus = z.infer<typeof issueSubtaskStatusSchema>
export type IssueSubtaskKind = z.infer<typeof issueSubtaskKindSchema>
export type IssueTask = IssueSubtask
export type IssueTaskStatus = IssueSubtaskStatus
export type IssueTaskKind = IssueSubtaskKind
export type IssueEvent = z.infer<typeof issueEventSchema>
export type IssueComment = z.infer<typeof issueCommentSchema>
export type IssueCommentAuthor = z.infer<typeof issueCommentAuthorSchema>
export type IssueCommentKind = z.infer<typeof issueCommentKindSchema>
export type CreateIssueInput = z.infer<typeof createIssueSchema>
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>
export type StartIssueInput = z.infer<typeof startIssueSchema>
export type CreateIssueCommentInput = z.input<typeof createIssueCommentSchema>
export type CreateIssueSubtaskInput = z.input<typeof createIssueSubtaskSchema>
export type ReplaceIssueSubtasksInput = z.input<
  typeof replaceIssueSubtasksSchema
>
export type UpdateIssueSubtaskInput = z.input<typeof updateIssueSubtaskSchema>
export type CreateIssueTaskInput = z.input<typeof createIssueTaskSchema>
export type ReplaceIssueTasksInput = z.input<typeof replaceIssueTasksSchema>
export type UpdateIssueTaskInput = z.input<typeof updateIssueTaskSchema>
