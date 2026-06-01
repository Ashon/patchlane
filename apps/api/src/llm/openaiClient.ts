import OpenAI from "openai";
import type { LlmChatRequest, LlmEndpoint, LlmEndpointTestResult } from "@agent-fleet/shared";

const LOCAL_API_KEY = "local-llm";

export const createOpenAIClient = (endpoint: LlmEndpoint) => {
  const apiKey = endpoint.apiKeyEnvVar ? process.env[endpoint.apiKeyEnvVar] || LOCAL_API_KEY : LOCAL_API_KEY;

  return new OpenAI({
    apiKey,
    baseURL: endpoint.baseUrl,
    timeout: 15_000
  });
};

export const testEndpointConnection = async (endpoint: LlmEndpoint): Promise<LlmEndpointTestResult> => {
  const startedAt = Date.now();

  try {
    const client = createOpenAIClient(endpoint);
    const response = await client.models.list();
    const models = response.data.map((model) => model.id).filter(Boolean).slice(0, 30);

    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      models
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      models: [],
      error: getErrorMessage(error)
    };
  }
};

export const createChatCompletion = async (endpoint: LlmEndpoint, request: LlmChatRequest) => {
  const client = createOpenAIClient(endpoint);

  return client.chat.completions.create({
    model: request.model || endpoint.defaultModel,
    messages: request.messages,
    temperature: request.temperature,
    max_tokens: request.maxTokens
  });
};

export const createStreamingChatCompletion = async (endpoint: LlmEndpoint, request: LlmChatRequest) => {
  const client = createOpenAIClient(endpoint);

  return client.chat.completions.create({
    model: request.model || endpoint.defaultModel,
    messages: request.messages,
    temperature: request.temperature,
    max_tokens: request.maxTokens,
    stream: true
  });
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
};
