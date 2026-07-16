import type { AgentRuntime, IssuePriority } from '@patchlane/shared'

export type ProjectDraft = {
  targetId: string | null
  code: string
  name: string
  description: string
  repositoryUrl: string
  repositoryRef: string
  workspaceId: string
  defaultEndpointId: string
  defaultAgentRuntime: AgentRuntime
  defaultAgentRuntimeConnectorId: string
  branchPrefix: string
  autopilot: boolean
}

export type IssueDraft = {
  title: string
  description: string
  endpointId: string
  priority: IssuePriority
}

export type ProjectDetailTab = 'issues' | 'tasks'
