import path from "node:path";
import {
  sandboxExecRequestSchema,
  sandboxSettingsSchema,
  type SandboxExecRequest,
  type SandboxSettings,
  type SandboxWorkspace
} from "@agent-fleet/shared";
import { badRequest } from "../http/errors";
import { ensureWithinRoot } from "./sandboxWorkspaceStore";
import { runProcess } from "./processRunner";

export const executeSandboxCommand = async (
  settingsInput: SandboxSettings,
  workspace: SandboxWorkspace,
  input: SandboxExecRequest,
  extraEnv: NodeJS.ProcessEnv = {}
) => {
  const settings = sandboxSettingsSchema.parse(settingsInput);
  const request = sandboxExecRequestSchema.parse(input);

  if (!settings.allowedCommands.includes(request.command)) {
    throw badRequest(`Command '${request.command}' is not allowed in the sandbox`);
  }

  const cwd = ensureWorkspacePath(workspace, request.cwd);

  return runProcess({
    command: request.command,
    args: request.args,
    cwd,
    env: buildSandboxEnv(settings.envAllowlist, extraEnv),
    timeoutMs: request.timeoutMs ?? settings.defaultTimeoutMs,
    maxOutputBytes: settings.maxOutputBytes
  });
};

export const ensureWorkspacePath = (workspace: SandboxWorkspace, requestedPath?: string) => {
  const candidate = requestedPath ? path.resolve(workspace.path, requestedPath) : workspace.path;
  return ensureWithinRoot(workspace.path, candidate);
};

export const buildSandboxEnv = (allowlist: string[], extraEnv: NodeJS.ProcessEnv = {}) => {
  const env: NodeJS.ProcessEnv = {
    CI: "true",
    GIT_TERMINAL_PROMPT: "0"
  };

  for (const key of allowlist) {
    const value = process.env[key];

    if (value !== undefined) {
      env[key] = value;
    }
  }

  return {
    ...env,
    ...extraEnv
  };
};
