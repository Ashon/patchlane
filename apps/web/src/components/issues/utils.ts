import type {
  AgentProject,
  AgentRun,
  CreateAgentProjectInput,
  CreateIssueInput,
  Issue,
  IssueStatus,
  UpdateAgentProjectInput,
} from '@patchlane/shared'
import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-client'
import { emptyProjectDraft } from './constants'
import type { IssueDraft, ProjectDraft } from './types'

export const normalizeProjectDraft = (
  draft: ProjectDraft,
): CreateAgentProjectInput | UpdateAgentProjectInput => ({
  branchPrefix: draft.branchPrefix.trim() || 'agent',
  defaultEndpointId: draft.defaultEndpointId || undefined,
  description: draft.description.trim(),
  name: draft.name.trim(),
  repositoryRef: draft.repositoryRef.trim() || undefined,
  repositoryUrl: draft.repositoryUrl.trim() || undefined,
  workspaceId: draft.workspaceId || undefined,
})

export const toProjectDraft = (
  project: AgentProject | null,
  fallbackEndpointId = '',
): ProjectDraft =>
  project
    ? {
        targetId: project.id,
        branchPrefix: project.branchPrefix,
        defaultEndpointId: project.defaultEndpointId ?? '',
        description: project.description,
        name: project.name,
        repositoryRef: project.repositoryRef ?? '',
        repositoryUrl: project.repositoryUrl ?? '',
        workspaceId: project.workspaceId ?? '',
      }
    : {
        ...emptyProjectDraft,
        defaultEndpointId: fallbackEndpointId,
      }

export const normalizeIssueDraft = (
  draft: IssueDraft,
  projectId: string,
  endpointId?: string,
): CreateIssueInput => ({
  description: draft.description.trim(),
  endpointId: endpointId || undefined,
  priority: draft.priority,
  projectId,
  title: draft.title.trim(),
})

export const countStatus = (issues: Issue[], status: IssueStatus) =>
  issues.filter((issue) => issue.status === status).length

export const hasActiveIssueTask = (runs: Array<AgentRun | undefined>) => {
  return runs.some((run) => run && isActiveRunStatus(run.status))
}

const isActiveRunStatus = (status: AgentRun['status']) => {
  return status === 'running' || status === 'idle' || status === 'awaiting_user'
}

export const getProjectLinkedRunIds = (issues: Issue[]) => {
  const runIds = new Set<string>()

  for (const issue of issues) {
    for (const runId of [
      issue.requirementRunId,
      issue.planningRunId,
      issue.agentRunId,
    ]) {
      if (runId) {
        runIds.add(runId)
      }
    }
  }

  return runIds
}

export const upsertProject = (
  queryClient: QueryClient,
  project: AgentProject,
) => {
  queryClient.setQueryData<{ projects: AgentProject[] }>(
    queryKeys.projects,
    (current) => ({
      projects: [
        project,
        ...(current?.projects ?? []).filter((item) => item.id !== project.id),
      ],
    }),
  )
}

export const upsertIssue = (queryClient: QueryClient, issue: Issue) => {
  queryClient.setQueryData<{ issues: Issue[] }>(
    queryKeys.issues,
    (current) => ({
      issues: [
        issue,
        ...(current?.issues ?? []).filter((item) => item.id !== issue.id),
      ],
    }),
  )
}

export const upsertAgentRuns = (
  queryClient: QueryClient,
  runs?: AgentRun[],
) => {
  if (!runs?.length) {
    return
  }

  queryClient.setQueryData<{ runs: AgentRun[] }>(
    queryKeys.agentRuns,
    (current) => ({
      runs: [
        ...runs,
        ...(current?.runs ?? []).filter(
          (run) => !runs.some((item) => item.id === run.id),
        ),
      ],
    }),
  )
}

export const formatDateTime = (value: string) =>
  new Date(value).toLocaleString()

export const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown error'
}
