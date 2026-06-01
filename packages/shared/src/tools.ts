import { z } from "zod";

const optionalTokenSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().min(20).max(500).optional());

const isoDateSchema = z.string().datetime();

export const githubToolSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  token: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  scopes: z.array(z.string().min(1)).default([]),
  updatedAt: isoDateSchema.optional(),
  validatedAt: isoDateSchema.optional()
});

export const toolSettingsSchema = z.object({
  github: githubToolSettingsSchema.default({
    enabled: false,
    scopes: []
  })
});

export const publicGitHubToolSettingsSchema = githubToolSettingsSchema.omit({ token: true }).extend({
  tokenConfigured: z.boolean(),
  tokenPreview: z.string().optional()
});

export const publicToolSettingsSchema = z.object({
  github: publicGitHubToolSettingsSchema
});

export const updateGitHubToolSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    token: optionalTokenSchema,
    clearToken: z.boolean().optional()
  })
  .refine((value) => typeof value.enabled === "boolean" || Boolean(value.token) || Boolean(value.clearToken), {
    message: "At least one field is required"
  });

export type GitHubToolSettings = z.infer<typeof githubToolSettingsSchema>;
export type ToolSettings = z.infer<typeof toolSettingsSchema>;
export type PublicGitHubToolSettings = z.infer<typeof publicGitHubToolSettingsSchema>;
export type PublicToolSettings = z.infer<typeof publicToolSettingsSchema>;
export type UpdateGitHubToolSettingsInput = z.infer<typeof updateGitHubToolSettingsSchema>;

export type GitHubToolTestResult = {
  ok: boolean;
  checkedAt: string;
  latencyMs: number;
  scopes: string[];
  username?: string;
  rateLimitRemaining?: number;
  error?: string;
};
