import type { AgentRuntimeConnectorType } from '@patchlane/shared'

export type EndpointDraft = {
  runtimeType: AgentRuntimeConnectorType
  name: string
  baseUrl: string
  defaultModel: string
  apiKeyEnvVar: string
  opencodeCommand: string
  opencodeCommandArgs: string
  opencodeDangerouslySkipPermissions: boolean
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

export type AppView =
  | 'projects'
  | 'workspaces'
  | 'sandbox'
  | 'settings'
  | 'stats'
export type ThemeMode = 'light' | 'dark' | 'system'

export const emptyEndpointDraft: EndpointDraft = {
  runtimeType: 'openai_compatible',
  name: '',
  baseUrl: 'http://localhost:11434/v1',
  defaultModel: '',
  apiKeyEnvVar: '',
  opencodeCommand: 'opencode',
  opencodeCommandArgs: '',
  opencodeDangerouslySkipPermissions: false,
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
