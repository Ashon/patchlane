export type EndpointDraft = {
  name: string
  baseUrl: string
  defaultModel: string
  apiKeyEnvVar: string
  enabled: boolean
}

export type GitHubToolDraft = {
  enabled: boolean
  token: string
  clearToken: boolean
}

export type SandboxWorkspaceDraft = {
  name: string
  repositoryUrl: string
  ref: string
}

export type AppView = 'projects' | 'workspaces' | 'sandbox' | 'settings'
export type ThemeMode = 'light' | 'dark' | 'system'

export const emptyEndpointDraft: EndpointDraft = {
  name: '',
  baseUrl: 'http://localhost:11434/v1',
  defaultModel: '',
  apiKeyEnvVar: '',
  enabled: true,
}

export const emptyGitHubToolDraft: GitHubToolDraft = {
  enabled: false,
  token: '',
  clearToken: false,
}

export const emptySandboxWorkspaceDraft: SandboxWorkspaceDraft = {
  name: '',
  repositoryUrl: '',
  ref: '',
}

