import type { IssueDraft, ProjectDraft } from './types'

export const emptyProjectDraft: ProjectDraft = {
  targetId: null,
  code: '',
  name: '',
  description: '',
  repositoryUrl: '',
  repositoryRef: '',
  workspaceId: '',
  defaultEndpointId: '',
  defaultAgentRuntime: 'patchlane',
  defaultAgentRuntimeConnectorId: '',
  branchPrefix: 'agent',
}

export const emptyIssueDraft: IssueDraft = {
  title: '',
  description: '',
  endpointId: '',
  priority: 'medium',
}

export const NO_WORKSPACE_VALUE = '__none__'
