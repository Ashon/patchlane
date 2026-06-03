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

export const agentProjectSchema = z.object({
  id: z.string().min(1),
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
  'blocked',
  'failed',
])
export const issuePrioritySchema = z.enum(['low', 'medium', 'high', 'urgent'])

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

export const issueSchema = z.object({
  id: z.string().min(1),
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

export const agentProjectListSchema = z.array(agentProjectSchema)
export const issueListSchema = z.array(issueSchema)

export type AgentProject = z.infer<typeof agentProjectSchema>
export type CreateAgentProjectInput = z.infer<typeof createAgentProjectSchema>
export type UpdateAgentProjectInput = z.infer<typeof updateAgentProjectSchema>
export type Issue = z.infer<typeof issueSchema>
export type IssueStatus = z.infer<typeof issueStatusSchema>
export type IssuePriority = z.infer<typeof issuePrioritySchema>
export type IssueEvent = z.infer<typeof issueEventSchema>
export type CreateIssueInput = z.infer<typeof createIssueSchema>
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>
export type StartIssueInput = z.infer<typeof startIssueSchema>
