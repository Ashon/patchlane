import type { SandboxSettings, SandboxWorkspace } from "@agent-fleet/shared";
import { buildSandboxEnv } from "./sandboxExecutor";
import { runProcess } from "./processRunner";

type CloneRepositoryInput = {
  repositoryUrl: string;
  ref?: string;
  settings: SandboxSettings;
  target: SandboxWorkspace;
  githubToken?: string;
};

export const cloneRepositoryIntoSandbox = async ({
  repositoryUrl,
  ref,
  settings,
  target,
  githubToken
}: CloneRepositoryInput) => {
  const env = buildSandboxEnv(settings.envAllowlist, getGitAuthEnv(repositoryUrl, githubToken));
  const cloneResult = await runProcess({
    command: "git",
    args: ["clone", repositoryUrl, target.path],
    cwd: settings.rootDir,
    env,
    timeoutMs: settings.defaultTimeoutMs,
    maxOutputBytes: settings.maxOutputBytes
  });

  if (!cloneResult.ok) {
    throw new Error(getFailureMessage("git clone", cloneResult.stderr || cloneResult.stdout));
  }

  if (!ref) {
    return;
  }

  const checkoutResult = await runProcess({
    command: "git",
    args: ["checkout", ref],
    cwd: target.path,
    env,
    timeoutMs: settings.defaultTimeoutMs,
    maxOutputBytes: settings.maxOutputBytes
  });

  if (!checkoutResult.ok) {
    throw new Error(getFailureMessage("git checkout", checkoutResult.stderr || checkoutResult.stdout));
  }
};

export const getGitAuthEnv = (repositoryUrl: string, githubToken?: string): NodeJS.ProcessEnv => {
  if (!githubToken) {
    return {};
  }

  const parsed = new URL(repositoryUrl);

  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") {
    return {};
  }

  const credential = Buffer.from(`x-access-token:${githubToken}`, "utf8").toString("base64");

  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: `http.${parsed.origin}/.extraheader`,
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${credential}`
  };
};

const getFailureMessage = (operation: string, output: string) => {
  const trimmed = output.trim();
  return trimmed ? `${operation} failed: ${trimmed}` : `${operation} failed`;
};
