import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const readInt = (name: string, fallback: number) => {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`${name} must be a number`);
  }

  return parsed;
};

const readOptional = (name: string) => {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
};

const readCsv = (name: string, fallback: string[]) => {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

export const env = {
  port: readInt("PORT", 8787),
  webOrigin: process.env.WEB_ORIGIN?.trim() || "http://localhost:8788",
  llmEndpointsFile: path.resolve(process.cwd(), process.env.LLM_ENDPOINTS_FILE || ".data/llm-endpoints.json"),
  toolSettingsFile: path.resolve(process.cwd(), process.env.TOOL_SETTINGS_FILE || ".data/tool-settings.json"),
  agentRunsFile: path.resolve(process.cwd(), process.env.AGENT_RUNS_FILE || ".data/agent-runs.json"),
  sandboxWorkspacesFile: path.resolve(process.cwd(), process.env.SANDBOX_WORKSPACES_FILE || ".data/sandbox-workspaces.json"),
  sandbox: {
    rootDir: path.resolve(process.cwd(), process.env.SANDBOX_ROOT_DIR || ".data/sandboxes"),
    defaultTimeoutMs: readInt("SANDBOX_DEFAULT_TIMEOUT_MS", 120_000),
    maxOutputBytes: readInt("SANDBOX_MAX_OUTPUT_BYTES", 131_072),
    allowedCommands: readCsv("SANDBOX_ALLOWED_COMMANDS", [
      "git",
      "pnpm",
      "npm",
      "node",
      "tsx",
      "tsc",
      "ls",
      "pwd",
      "cat",
      "rg",
      "sed"
    ]),
    envAllowlist: readCsv("SANDBOX_ENV_ALLOWLIST", ["PATH", "HOME", "LANG", "LC_ALL"])
  },
  defaultEndpoint: {
    name: process.env.DEFAULT_LLM_ENDPOINT_NAME?.trim() || "Ollama Local",
    baseUrl: process.env.DEFAULT_LLM_BASE_URL?.trim() || "http://localhost:11434/v1",
    defaultModel: process.env.DEFAULT_LLM_MODEL?.trim() || "llama3.1",
    apiKeyEnvVar: readOptional("DEFAULT_LLM_API_KEY_ENV_VAR"),
    enabled: true
  }
};
