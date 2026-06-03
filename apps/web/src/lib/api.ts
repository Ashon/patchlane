import type {
  AgentRun,
  AgentRunMessageMetadata,
  AppendAgentRunMessageInput,
  AgentProject,
  CreateAgentProjectInput,
  CreateIssueInput,
  ContinueAgentRunInput,
  CreateAgentRunInput,
  CreateLlmEndpointInput,
  Issue,
  GitHubToolTestResult,
  LlmChatRequest,
  LlmEndpoint,
  LlmEndpointTestResult,
  PublicToolSettings,
  RewindAgentRunInput,
  SandboxExecRequest,
  SandboxExecResult,
  SandboxSettings,
  SandboxWorkspace,
  CreateSandboxWorkspaceInput,
  StartIssueInput,
  UpdateAgentProjectInput,
  UpdateGitHubToolSettingsInput,
  UpdateLlmEndpointInput,
  UpdateIssueInput,
} from '@patchlane/shared'
import axios, { AxiosError, type AxiosRequestConfig } from 'axios'

const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://localhost:8787' : '')
).replace(/\/+$/, '')

const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'content-type': 'application/json',
  },
})

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const config: AxiosRequestConfig = {
    url: path,
    method: options?.method || 'GET',
    headers: options?.headers as AxiosRequestConfig['headers'],
    data:
      typeof options?.body === 'string'
        ? JSON.parse(options.body)
        : options?.body,
  }

  try {
    const response = await apiClient.request<T>(config)
    return response.data
  } catch (requestError) {
    throw normalizeApiError(requestError)
  }
}

type ChatStreamEvent =
  | {
      type: 'meta'
      endpointId: string
      model: string
    }
  | {
      type: 'delta'
      content?: string
      reasoning?: string
    }
  | {
      type: 'finish'
      finishReason: string
    }
  | {
      type: 'done'
    }
  | {
      type: 'error'
      error: string
    }

type ChatStreamHandlers = {
  signal?: AbortSignal
  onEvent: (event: ChatStreamEvent) => void
}

type AgentRunStreamEvent =
  | {
      type: 'run'
      run: AgentRun
    }
  | {
      type: 'assistant_delta'
      content: string
      metadata?: AgentRunMessageMetadata
    }
  | {
      type: 'assistant_reset'
    }
  | {
      type: 'tool_start'
      toolName: string
      toolInput?: string
      metadata?: AgentRunMessageMetadata
    }
  | {
      type: 'tool_result'
      toolName: string
      content: string
      metadata?: AgentRunMessageMetadata
    }
  | {
      type: 'done'
      run: AgentRun
    }
  | {
      type: 'error'
      error: string
      run?: AgentRun
    }

type AgentRunStreamHandlers = {
  signal?: AbortSignal
  onEvent: (event: AgentRunStreamEvent) => void
}

const readSseResponse = async <TEvent>(
  response: Response,
  onEvent: (event: TEvent) => void,
) => {
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.error || `Request failed with ${response.status}`)
  }

  if (!response.body) {
    throw new Error('Streaming response body is empty')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const dispatchFrame = (frame: string) => {
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')

    if (data) {
      onEvent(JSON.parse(data) as TEvent)
    }
  }

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() || ''

    for (const frame of frames) {
      dispatchFrame(frame)
    }
  }

  buffer += decoder.decode()

  if (buffer.trim()) {
    dispatchFrame(buffer)
  }
}

const streamRequest = async (
  input: LlmChatRequest,
  { onEvent, signal }: ChatStreamHandlers,
) => {
  const response = await fetch(`${apiBaseUrl}/api/llm/chat/stream`, {
    body: JSON.stringify(input),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
    signal,
  })

  await readSseResponse(response, onEvent)
}

const normalizeApiError = (error: unknown) => {
  if (error instanceof AxiosError) {
    const payload = error.response?.data as { error?: string } | undefined
    return new Error(
      payload?.error ||
        error.message ||
        `Request failed with ${error.response?.status || 'unknown status'}`,
    )
  }

  return error
}

export const api = {
  async health() {
    return request<{ ok: boolean }>('/health')
  },
  async listEndpoints() {
    return request<{ endpoints: LlmEndpoint[] }>('/api/llm/endpoints')
  },
  async createEndpoint(input: CreateLlmEndpointInput) {
    return request<{ endpoint: LlmEndpoint }>('/api/llm/endpoints', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  async updateEndpoint(id: string, input: UpdateLlmEndpointInput) {
    return request<{ endpoint: LlmEndpoint }>(`/api/llm/endpoints/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },
  async deleteEndpoint(id: string) {
    return request<void>(`/api/llm/endpoints/${id}`, {
      method: 'DELETE',
    })
  },
  async testEndpoint(id: string) {
    return request<{ result: LlmEndpointTestResult }>(
      `/api/llm/endpoints/${id}/test`,
      {
        method: 'POST',
      },
    )
  },
  async getToolSettings() {
    return request<{ settings: PublicToolSettings }>('/api/tools/settings')
  },
  async updateGitHubToolSettings(input: UpdateGitHubToolSettingsInput) {
    return request<{ settings: PublicToolSettings }>(
      '/api/tools/settings/github',
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
    )
  },
  async testGitHubTool() {
    return request<{
      result: GitHubToolTestResult
      settings: PublicToolSettings
    }>('/api/tools/github/test', {
      method: 'POST',
    })
  },
  async listProjects() {
    return request<{ projects: AgentProject[] }>('/api/issues/projects')
  },
  async createProject(input: CreateAgentProjectInput) {
    return request<{ project: AgentProject }>('/api/issues/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  async updateProject(id: string, input: UpdateAgentProjectInput) {
    return request<{ project: AgentProject }>(`/api/issues/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },
  async deleteProject(id: string) {
    return request<void>(`/api/issues/projects/${id}`, {
      method: 'DELETE',
    })
  },
  async listIssues() {
    return request<{ issues: Issue[] }>('/api/issues')
  },
  async createIssue(input: CreateIssueInput) {
    return request<{ issue: Issue }>('/api/issues', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  async updateIssue(id: string, input: UpdateIssueInput) {
    return request<{ issue: Issue }>(`/api/issues/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },
  async analyzeIssue(id: string, input: { endpointId?: string }) {
    return request<{ issue: Issue; runs?: AgentRun[] }>(
      `/api/issues/${id}/analyze`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    )
  },
  async startIssue(id: string, input: StartIssueInput) {
    return request<{ run?: AgentRun; issue: Issue; runs?: AgentRun[] }>(
      `/api/issues/${id}/start`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    )
  },
  async getSandboxSettings() {
    return request<{ settings: SandboxSettings }>('/api/sandbox/settings')
  },
  async listSandboxWorkspaces() {
    return request<{ workspaces: SandboxWorkspace[] }>(
      '/api/sandbox/workspaces',
    )
  },
  async createSandboxWorkspace(input: CreateSandboxWorkspaceInput) {
    return request<{ workspace: SandboxWorkspace }>('/api/sandbox/workspaces', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  async deleteSandboxWorkspace(id: string) {
    return request<void>(`/api/sandbox/workspaces/${id}`, {
      method: 'DELETE',
    })
  },
  async executeSandboxCommand(id: string, input: SandboxExecRequest) {
    return request<{ result: SandboxExecResult }>(
      `/api/sandbox/workspaces/${id}/exec`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    )
  },
  async listAgentRuns() {
    return request<{ runs: AgentRun[] }>('/api/agent/runs')
  },
  async getAgentRun(id: string) {
    return request<{ run: AgentRun }>(`/api/agent/runs/${id}`)
  },
  async createAgentRun(input: CreateAgentRunInput) {
    return request<{ run: AgentRun }>('/api/agent/runs', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  async appendAgentRunMessage(id: string, input: AppendAgentRunMessageInput) {
    return request<{ run: AgentRun }>(`/api/agent/runs/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  async deleteAgentRun(
    id: string,
    options: { cleanupWorkspace?: boolean } = {},
  ) {
    const query = options.cleanupWorkspace ? '?cleanupWorkspace=true' : ''
    return request<void>(`/api/agent/runs/${id}${query}`, {
      method: 'DELETE',
    })
  },
  async continueAgentRun(id: string, input: ContinueAgentRunInput) {
    return request<{ run: AgentRun }>(`/api/agent/runs/${id}/continue`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  async rewindAgentRun(id: string, input: RewindAgentRunInput) {
    return request<{ run: AgentRun }>(`/api/agent/runs/${id}/rewind`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  async streamAgentRun(
    id: string,
    input: ContinueAgentRunInput,
    { onEvent, signal }: AgentRunStreamHandlers,
  ) {
    const response = await fetch(
      `${apiBaseUrl}/api/agent/runs/${id}/continue/stream`,
      {
        body: JSON.stringify(input),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
        signal,
      },
    )

    await readSseResponse(response, onEvent)
  },
  async streamChat(input: LlmChatRequest, handlers: ChatStreamHandlers) {
    return streamRequest(input, handlers)
  },
}
