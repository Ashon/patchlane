import type {
  AgentProject,
  AgentRun,
  Issue,
  IssuePriority,
  LlmEndpoint,
  SandboxWorkspace,
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

export type ProjectsListPageProps = {
  endpoints: LlmEndpoint[]
  error?: string | null
  issues: Issue[]
  loading: boolean
  onOpenProject: (id: string) => void
  projects: AgentProject[]
  selectedEndpoint: LlmEndpoint | null
  workspaces: SandboxWorkspace[]
}

export type ProjectDetailPageProps = {
  agentRuns: AgentRun[]
  endpoints: LlmEndpoint[]
  error?: string | null
  issues: Issue[]
  loading: boolean
  onBack: () => void
  onNavigateTab: (tab: ProjectDetailTab) => void
  onOpenRun: (runId: string) => void
  onSelectIssue: (id: string | null) => void
  onStartIssueRun: (issue: Issue) => Promise<void>
  projectId: string
  projects: AgentProject[]
  selectedEndpoint: LlmEndpoint | null
  selectedIssueId: string | null
  tab: ProjectDetailTab
  workspaces: SandboxWorkspace[]
}
