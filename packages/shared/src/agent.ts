import { z } from "zod";

const isoDateSchema = z.string().datetime();

export const agentRunStatusSchema = z.enum(["idle", "running", "awaiting_user", "completed", "failed"]);

export const agentRunMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant", "tool", "system"]),
  content: z.string(),
  toolName: z.string().optional(),
  createdAt: isoDateSchema
});

export const agentRunSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  endpointId: z.string().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(120),
  status: agentRunStatusSchema,
  messages: z.array(agentRunMessageSchema),
  error: z.string().optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema
});

export const agentRunListSchema = z.array(agentRunSchema);

export const createAgentRunSchema = z.object({
  workspaceId: z.string().min(1),
  endpointId: z.string().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  task: z.string().trim().min(1).max(20_000)
});

export const appendAgentRunMessageSchema = z.object({
  content: z.string().trim().min(1).max(20_000)
});

export const continueAgentRunSchema = z.object({
  endpointId: z.string().min(1).optional(),
  model: z.string().trim().min(1).optional()
});

export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;
export type AgentRunMessage = z.infer<typeof agentRunMessageSchema>;
export type AgentRun = z.infer<typeof agentRunSchema>;
export type CreateAgentRunInput = z.infer<typeof createAgentRunSchema>;
export type AppendAgentRunMessageInput = z.infer<typeof appendAgentRunMessageSchema>;
export type ContinueAgentRunInput = z.infer<typeof continueAgentRunSchema>;
