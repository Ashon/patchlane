import type { IssueDraft, ProjectDraft } from './types'

export const emptyProjectDraft: ProjectDraft = {
  targetId: null,
  name: '',
  description: '',
  repositoryUrl: '',
  repositoryRef: '',
  workspaceId: '',
  defaultEndpointId: '',
  branchPrefix: 'agent',
}

export const emptyIssueDraft: IssueDraft = {
  title: '',
  description: '',
  endpointId: '',
  priority: 'medium',
}

export const NO_WORKSPACE_VALUE = '__none__'
