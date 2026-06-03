import type {
  IssuePriority,
} from '@agent-fleet/shared'

export type ProjectDraft = {
  targetId: string | null
  name: string
  description: string
  repositoryUrl: string
  repositoryRef: string
  workspaceId: string
  defaultEndpointId: string
  branchPrefix: string
}

export type IssueDraft = {
  title: string
  description: string
  endpointId: string
  priority: IssuePriority
}

export type ProjectDetailTab = 'issues' | 'tasks'
