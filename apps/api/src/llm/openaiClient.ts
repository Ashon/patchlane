import OpenAI from 'openai'
import type {
  LlmChatRequest,
  LlmEndpoint,
  LlmEndpointTestResult,
} from '@patchlane/shared'

const LOCAL_API_KEY = 'local-llm'
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000

export const createOpenAIClient = (endpoint: LlmEndpoint) => {
  const apiKey = endpoint.apiKeyEnvVar
    ? process.env[endpoint.apiKeyEnvVar] || LOCAL_API_KEY
    : LOCAL_API_KEY

  return new OpenAI({
    apiKey,
    baseURL: endpoint.baseUrl,
    timeout: readRequestTimeoutMs(),
  })
}

export const testEndpointConnection = async (
  endpoint: LlmEndpoint,
): Promise<LlmEndpointTestResult> => {
  const startedAt = Date.now()

  try {
    const client = createOpenAIClient(endpoint)
    const response = await client.models.list()
    const models = response.data
      .map((model) => model.id)
      .filter(Boolean)
      .slice(0, 30)

    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      models,
    }
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      models: [],
      error: getErrorMessage(error),
    }
  }
}

export const createChatCompletion = async (
  endpoint: LlmEndpoint,
  request: LlmChatRequest,
) => {
  const client = createOpenAIClient(endpoint)

  return client.chat.completions.create({
    model: request.model || endpoint.defaultModel,
    messages: request.messages,
    temperature: request.temperature,
    max_tokens: request.maxTokens,
  })
}

export const createStreamingChatCompletion = async (
  endpoint: LlmEndpoint,
  request: LlmChatRequest,
) => {
  const client = createOpenAIClient(endpoint)

  return client.chat.completions.create({
    model: request.model || endpoint.defaultModel,
    messages: request.messages,
    temperature: request.temperature,
    max_tokens: request.maxTokens,
    stream: true,
  })
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown error'
}

const readRequestTimeoutMs = () => {
  const raw = process.env.LLM_REQUEST_TIMEOUT_MS

  if (!raw) {
    return DEFAULT_REQUEST_TIMEOUT_MS
  }

  const parsed = Number.parseInt(raw, 10)

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_REQUEST_TIMEOUT_MS
}
