import { z } from 'zod'

const isoDateSchema = z.string().datetime()

export const agentRunStatusSchema = z.enum([
  'idle',
  'running',
  'awaiting_user',
  'completed',
  'cancelled',
  'failed',
])
export const agentRunKindSchema = z.enum(['coding'])
export const agentRuntimeSchema = z.enum(['patchlane', 'opencode', 'codex'])

export const agentRunContextSchema = z.object({
  strategy: z.enum(['full', 'compacted']),
  tokenBudget: z.number().int().positive(),
  estimatedTokens: z.number().int().nonnegative(),
  retainedMessages: z.number().int().nonnegative(),
  summarizedMessages: z.number().int().nonnegative(),
  summary: z.string().optional(),
  updatedAt: isoDateSchema,
})

const agentRunMessageTextMetricsSchema = z.object({
  characters: z.number().int().nonnegative(),
  estimatedTokens: z.number().int().nonnegative(),
})

const agentRunMessageTokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  reasoningTokens: z.number().int().nonnegative().optional(),
  cachedInputTokens: z.number().int().nonnegative().optional(),
})

const agentRunMessageContextMetadataSchema = agentRunContextSchema
  .omit({
    summary: true,
    updatedAt: true,
  })
  .extend({
    promptMessages: z.number().int().nonnegative().optional(),
  })

export const agentRunMessageMetadataSchema = z.object({
  durationMs: z.number().int().nonnegative().optional(),
  context: agentRunMessageContextMetadataSchema.optional(),
  request: z
    .object({
      model: z.string().min(1).optional(),
      attempt: z.number().int().positive().optional(),
      iteration: z.number().int().positive().optional(),
      maxOutputTokens: z.number().int().positive().optional(),
    })
    .optional(),
  usage: agentRunMessageTokenUsageSchema.optional(),
  content: agentRunMessageTextMetricsSchema.optional(),
  reasoning: agentRunMessageTextMetricsSchema.optional(),
  tool: z
    .object({
      input: agentRunMessageTextMetricsSchema.optional(),
      output: agentRunMessageTextMetricsSchema.optional(),
    })
    .optional(),
})

export const agentRunMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant', 'tool', 'system']),
  content: z.string(),
  toolName: z.string().optional(),
  toolInput: z.record(z.unknown()).optional(),
  metadata: agentRunMessageMetadataSchema.optional(),
  createdAt: isoDateSchema,
})

export const agentRunSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  endpointId: z.string().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  agentRuntime: agentRuntimeSchema.default('patchlane'),
  runtimeSessionId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(120),
  kind: agentRunKindSchema.default('coding'),
  prUrl: z.string().url().optional(),
  resultSummary: z.string().max(8_000).optional(),
  status: agentRunStatusSchema,
  attempt: z.number().int().positive().optional(),
  queuedAt: isoDateSchema.optional(),
  startedAt: isoDateSchema.optional(),
  heartbeatAt: isoDateSchema.optional(),
  leaseOwner: z.string().trim().min(1).optional(),
  leaseExpiresAt: isoDateSchema.optional(),
  cancellationRequestedAt: isoDateSchema.optional(),
  finishedAt: isoDateSchema.optional(),
  messages: z.array(agentRunMessageSchema),
  context: agentRunContextSchema.optional(),
  error: z.string().optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
})

export const agentRunListSchema = z.array(agentRunSchema)

export const createAgentRunSchema = z.object({
  workspaceId: z.string().min(1),
  endpointId: z.string().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  agentRuntime: agentRuntimeSchema.optional(),
  title: z.string().trim().min(1).max(120).optional(),
  kind: agentRunKindSchema.optional(),
  task: z.string().trim().min(1).max(20_000),
})

export const appendAgentRunMessageSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
})

export const continueAgentRunSchema = z.object({
  endpointId: z.string().min(1).optional(),
  model: z.string().trim().min(1).optional(),
})

export const updateAgentRunRuntimeSchema = z.object({
  endpointId: z.string().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  agentRuntime: agentRuntimeSchema,
})

export const rewindAgentRunSchema = z.object({
  messageId: z.string().min(1),
})

export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>
export type AgentRunKind = z.infer<typeof agentRunKindSchema>
export type AgentRuntime = z.infer<typeof agentRuntimeSchema>
export type AgentRunMessage = z.infer<typeof agentRunMessageSchema>
export type AgentRunMessageMetadata = z.infer<
  typeof agentRunMessageMetadataSchema
>
export type AgentRunContext = z.infer<typeof agentRunContextSchema>
export type AgentRun = z.infer<typeof agentRunSchema>
export const agentExecutionSchema = agentRunSchema
export type AgentExecution = AgentRun
export type CreateAgentRunInput = z.infer<typeof createAgentRunSchema>
export type AppendAgentRunMessageInput = z.infer<
  typeof appendAgentRunMessageSchema
>
export type ContinueAgentRunInput = z.infer<typeof continueAgentRunSchema>
export type UpdateAgentRunRuntimeInput = z.infer<
  typeof updateAgentRunRuntimeSchema
>
export type RewindAgentRunInput = z.infer<typeof rewindAgentRunSchema>
