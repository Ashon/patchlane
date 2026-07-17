import { z } from 'zod'

export const agentRuntimeConnectorTypeSchema = z.enum([
  'openai_compatible',
  'opencode_cli',
  'codex_cli',
])

const optionalEnvVarSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') {
      return value
    }

    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  },
  z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Use a valid environment variable name')
    .max(80)
    .optional(),
)

export const llmEndpointBaseUrlSchema = z
  .string()
  .trim()
  .url()
  .transform((value) => value.replace(/\/+$/, ''))

const optionalBaseUrlSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}, llmEndpointBaseUrlSchema.optional())

const optionalDefaultModelSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}, z.string().max(120).optional())

const cliDefaultModelSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    return value.trim()
  }

  return value == null ? '' : value
}, z.string().max(120))

const cliCommandSchema = z.string().trim().min(1).max(120)

const opencodeCommandSchema = cliCommandSchema.default('opencode')

const codexCommandSchema = cliCommandSchema.default('codex')

const opencodeCommandArgsSchema = z
  .array(z.string().min(1).max(300))
  .max(20)
  .default([])

const commonRuntimeFields = {
  name: z.string().trim().min(1).max(80),
  apiKeyEnvVar: optionalEnvVarSchema,
  enabled: z.boolean().default(true),
  opencodeCommand: opencodeCommandSchema,
  opencodeCommandArgs: opencodeCommandArgsSchema,
  opencodeDangerouslySkipPermissions: z.boolean().default(false),
}

const openAiRuntimeSchema = z.object({
  ...commonRuntimeFields,
  runtimeType: z.literal('openai_compatible'),
  baseUrl: llmEndpointBaseUrlSchema,
  defaultModel: z.string().trim().min(1).max(120),
})

const opencodeRuntimeSchema = z.object({
  ...commonRuntimeFields,
  runtimeType: z.literal('opencode_cli'),
  baseUrl: optionalBaseUrlSchema.default('opencode://cli'),
  defaultModel: cliDefaultModelSchema,
})

const codexRuntimeSchema = z.object({
  ...commonRuntimeFields,
  opencodeCommand: codexCommandSchema,
  runtimeType: z.literal('codex_cli'),
  baseUrl: optionalBaseUrlSchema.default('codex://cli'),
  defaultModel: cliDefaultModelSchema,
})

const runtimeInputSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return value
    }

    return {
      runtimeType: 'openai_compatible',
      ...value,
    }
  },
  z.discriminatedUnion('runtimeType', [
    openAiRuntimeSchema,
    opencodeRuntimeSchema,
    codexRuntimeSchema,
  ]),
)

export const createLlmEndpointSchema = runtimeInputSchema

export const updateLlmEndpointSchema = z
  .object({
    runtimeType: agentRuntimeConnectorTypeSchema.optional(),
    name: z.string().trim().min(1).max(80).optional(),
    baseUrl: optionalBaseUrlSchema,
    defaultModel: optionalDefaultModelSchema,
    apiKeyEnvVar: optionalEnvVarSchema,
    opencodeCommand: opencodeCommandSchema.optional(),
    opencodeCommandArgs: opencodeCommandArgsSchema.optional(),
    opencodeDangerouslySkipPermissions: z.boolean().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  })

export const llmEndpointSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return value
    }

    return {
      runtimeType: 'openai_compatible',
      ...value,
    }
  },
  z.discriminatedUnion('runtimeType', [
    openAiRuntimeSchema.extend({
      id: z.string().min(1),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    }),
    opencodeRuntimeSchema.extend({
      id: z.string().min(1),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    }),
    codexRuntimeSchema.extend({
      id: z.string().min(1),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    }),
  ]),
)

export const llmEndpointListSchema = z.array(llmEndpointSchema)

export const llmChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1),
})

export const llmChatRequestSchema = z.object({
  endpointId: z.string().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  messages: z.array(llmChatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(8192).optional(),
})

export type AgentRuntimeConnectorType = z.infer<
  typeof agentRuntimeConnectorTypeSchema
>
export type CreateLlmEndpointInput = {
  runtimeType?: AgentRuntimeConnectorType
  name: string
  baseUrl?: string
  defaultModel?: string
  apiKeyEnvVar?: string
  opencodeCommand?: string
  opencodeCommandArgs?: string[]
  opencodeDangerouslySkipPermissions?: boolean
  enabled?: boolean
}
export type UpdateLlmEndpointInput = Partial<CreateLlmEndpointInput>
export type LlmEndpoint = z.infer<typeof llmEndpointSchema>
export type LlmChatMessage = z.infer<typeof llmChatMessageSchema>
export type LlmChatRequest = z.infer<typeof llmChatRequestSchema>

export type LlmEndpointTestResult = {
  ok: boolean
  latencyMs: number
  models: string[]
  error?: string
}
