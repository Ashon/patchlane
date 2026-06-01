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

export const env = {
  port: readInt("PORT", 8787),
  webOrigin: process.env.WEB_ORIGIN?.trim() || "http://localhost:8788",
  llmEndpointsFile: path.resolve(process.cwd(), process.env.LLM_ENDPOINTS_FILE || ".data/llm-endpoints.json"),
  defaultEndpoint: {
    name: process.env.DEFAULT_LLM_ENDPOINT_NAME?.trim() || "Ollama Local",
    baseUrl: process.env.DEFAULT_LLM_BASE_URL?.trim() || "http://localhost:11434/v1",
    defaultModel: process.env.DEFAULT_LLM_MODEL?.trim() || "llama3.1",
    apiKeyEnvVar: readOptional("DEFAULT_LLM_API_KEY_ENV_VAR"),
    enabled: true
  }
};
