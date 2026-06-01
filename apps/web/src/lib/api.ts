import type {
  CreateLlmEndpointInput,
  LlmChatRequest,
  LlmEndpoint,
  LlmEndpointTestResult,
  UpdateLlmEndpointInput
} from "@agent-fleet/shared";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://localhost:8787" : "")).replace(
  /\/+$/,
  ""
);

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options?.headers
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `Request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};

type ChatStreamEvent =
  | {
      type: "meta";
      endpointId: string;
      model: string;
    }
  | {
      type: "delta";
      content?: string;
      reasoning?: string;
    }
  | {
      type: "finish";
      finishReason: string;
    }
  | {
      type: "done";
    }
  | {
      type: "error";
      error: string;
    };

type ChatStreamHandlers = {
  signal?: AbortSignal;
  onEvent: (event: ChatStreamEvent) => void;
};

const streamRequest = async (input: LlmChatRequest, { onEvent, signal }: ChatStreamHandlers) => {
  const response = await fetch(`${apiBaseUrl}/api/llm/chat/stream`, {
    body: JSON.stringify(input),
    headers: {
      "content-type": "application/json"
    },
    method: "POST",
    signal
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `Request failed with ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Streaming response body is empty");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";

    for (const frame of frames) {
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");

      if (!data) {
        continue;
      }

      onEvent(JSON.parse(data) as ChatStreamEvent);
    }
  }
};

export const api = {
  async health() {
    return request<{ ok: boolean }>("/health");
  },
  async listEndpoints() {
    return request<{ endpoints: LlmEndpoint[] }>("/api/llm/endpoints");
  },
  async createEndpoint(input: CreateLlmEndpointInput) {
    return request<{ endpoint: LlmEndpoint }>("/api/llm/endpoints", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  async updateEndpoint(id: string, input: UpdateLlmEndpointInput) {
    return request<{ endpoint: LlmEndpoint }>(`/api/llm/endpoints/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  },
  async deleteEndpoint(id: string) {
    return request<void>(`/api/llm/endpoints/${id}`, {
      method: "DELETE"
    });
  },
  async testEndpoint(id: string) {
    return request<{ result: LlmEndpointTestResult }>(`/api/llm/endpoints/${id}/test`, {
      method: "POST"
    });
  },
  async streamChat(input: LlmChatRequest, handlers: ChatStreamHandlers) {
    return streamRequest(input, handlers);
  }
};
