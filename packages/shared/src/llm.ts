import { z } from "zod";

const optionalEnvVarSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Use a valid environment variable name").max(80).optional());

export const llmEndpointBaseUrlSchema = z
  .string()
  .trim()
  .url()
  .transform((value) => value.replace(/\/+$/, ""));

export const createLlmEndpointSchema = z.object({
  name: z.string().trim().min(1).max(80),
  baseUrl: llmEndpointBaseUrlSchema,
  defaultModel: z.string().trim().min(1).max(120),
  apiKeyEnvVar: optionalEnvVarSchema,
  enabled: z.boolean().default(true)
});

export const updateLlmEndpointSchema = createLlmEndpointSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required"
  });

export const llmEndpointSchema = createLlmEndpointSchema.extend({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const llmEndpointListSchema = z.array(llmEndpointSchema);

export const llmChatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1)
});

export const llmChatRequestSchema = z.object({
  endpointId: z.string().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  messages: z.array(llmChatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(8192).optional()
});

export type CreateLlmEndpointInput = z.infer<typeof createLlmEndpointSchema>;
export type UpdateLlmEndpointInput = z.infer<typeof updateLlmEndpointSchema>;
export type LlmEndpoint = z.infer<typeof llmEndpointSchema>;
export type LlmChatMessage = z.infer<typeof llmChatMessageSchema>;
export type LlmChatRequest = z.infer<typeof llmChatRequestSchema>;

export type LlmEndpointTestResult = {
  ok: boolean;
  latencyMs: number;
  models: string[];
  error?: string;
};

