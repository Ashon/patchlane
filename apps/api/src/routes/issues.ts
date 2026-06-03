import { Router } from 'express'
import {
  type AgentProject,
  type AgentRun,
  createAgentProjectSchema,
  createIssueSchema,
  type SandboxSettings,
  startIssueSchema,
  updateAgentProjectSchema,
  updateIssueSchema,
} from '@patchlane/shared'
import type { AgentRunStore } from '../agent/agentRunStore'
import { asyncHandler } from '../http/asyncHandler'
import { badRequest } from '../http/errors'
import { reconcileIssueTaskState } from '../issues/issueReconciliation'
import type { IssueStore } from '../issues/issueStore'
import { buildIssueRunTaskPrompt } from '../issues/issueTaskPrompts'
import type { LlmEndpointStore } from '../llm/endpointStore'
import {
  createWorktreeFromCache,
  ensureRepositoryCache,
} from '../sandbox/gitSandbox'
import type { SandboxWorkspaceStore } from '../sandbox/sandboxWorkspaceStore'
import type { ToolSettingsStore } from '../tools/toolSettingsStore'

type IssuesRouterOptions = {
  endpointStore: LlmEndpointStore
  issueStore: IssueStore
  runStore: AgentRunStore
  sandboxSettings: SandboxSettings
  toolSettingsStore: ToolSettingsStore
  workspaceStore: SandboxWorkspaceStore
}

export const createIssuesRouter = ({
  endpointStore,
  issueStore,
  runStore,
  sandboxSettings,
  toolSettingsStore,
  workspaceStore,
}: IssuesRouterOptions) => {
  const router = Router()

  router.get(
    '/projects',
    asyncHandler(async (_request, response) => {
      response.json({ projects: await issueStore.listProjects() })
    }),
  )

  router.post(
    '/projects',
    asyncHandler(async (request, response) => {
      const input = createAgentProjectSchema.parse(request.body)
      const project = await ensureProjectRepositoryCache(
        await issueStore.createProject(input),
      )
      response.status(201).json({ project })
    }),
  )

  router.patch(
    '/projects/:id',
    asyncHandler(async (request, response) => {
      const id = getRouteParam(request.params.id, 'id')
      const input = updateAgentProjectSchema.parse(request.body)
      const project = await ensureProjectRepositoryCache(
        await issueStore.updateProject(id, input),
      )
      response.json({ project })
    }),
  )

  router.delete(
    '/projects/:id',
    asyncHandler(async (request, response) => {
      await issueStore.removeProject(getRouteParam(request.params.id, 'id'))
      response.status(204).send()
    }),
  )

  router.get(
    '/',
    asyncHandler(async (_request, response) => {
      response.json({ issues: await issueStore.listIssues() })
    }),
  )

  router.post(
    '/',
    asyncHandler(async (request, response) => {
      const issue = await issueStore.createIssue(
        createIssueSchema.parse(request.body),
      )
      response.status(201).json({ issue })
    }),
  )

  router.patch(
    '/:id',
    asyncHandler(async (request, response) => {
      const issue = await issueStore.updateIssue(
        getRouteParam(request.params.id, 'id'),
        updateIssueSchema.parse(request.body),
      )
      response.json({ issue })
    }),
  )

  router.post(
    '/:id/start',
    asyncHandler(async (request, response) => {
      const input = startIssueSchema.parse(request.body)
      const id = getRouteParam(request.params.id, 'id')
      const { issue: currentIssue } = await reconcileIssueTaskState({
        issueId: id,
        issueStore,
        runStore,
      })

      if (await hasActiveCodingRun(currentIssue.agentRunId)) {
        throw badRequest('This issue already has a running agent run')
      }

      const runnableIssue = currentIssue
      const { project, workspace: repositoryCache } =
        await getRepositoryCacheForProject(
          await issueStore.getProject(runnableIssue.projectId),
        )
      const endpointId =
        input.endpointId ??
        runnableIssue.endpointId ??
        project.defaultEndpointId

      if (endpointId) {
        await endpointStore.get(endpointId)
      }

      const branchName = buildTaskBranchName(
        project.branchPrefix,
        runnableIssue.title,
        runnableIssue.id,
      )
      const taskWorkspace = await workspaceStore.createTaskWorktree({
        baseRef: project.repositoryRef,
        branchName,
        issueId: runnableIssue.id,
        name: `${project.name} ${runnableIssue.title}`.slice(0, 80),
        parentWorkspaceId: repositoryCache.id,
        projectId: project.id,
        repositoryUrl:
          project.repositoryUrl ?? repositoryCache.repositoryUrl ?? '',
        ref: project.repositoryRef,
      })

      try {
        await createWorktreeFromCache({
          baseRef: project.repositoryRef,
          branchName,
          cache: repositoryCache,
          settings: sandboxSettings,
          target: taskWorkspace,
          githubToken: await getGitHubToken(),
        })
      } catch (error) {
        const message = getErrorMessage(error)
        await workspaceStore.markError(taskWorkspace.id, message)
        throw badRequest(message)
      }

      const run = await runStore.create({
        workspaceId: taskWorkspace.id,
        endpointId,
        kind: 'coding',
        projectId: project.id,
        issueId: runnableIssue.id,
        branchName,
        title: runnableIssue.title,
        task: buildIssueRunTaskPrompt({
          branchName,
          issue: runnableIssue,
          project,
        }),
      })
      await workspaceStore.linkAgentRun(taskWorkspace.id, run.id)
      const issue = await issueStore.markRunStarted(runnableIssue.id, run.id, {
        branchName,
        endpointId,
        workspaceId: taskWorkspace.id,
      })

      response.status(201).json({ run, issue, runs: [run] })
    }),
  )

  return router

  async function hasActiveCodingRun(runId?: string) {
    if (!runId) {
      return false
    }

    const run = await runStore.find(runId)

    return Boolean(run && isActiveRunStatus(run.status))
  }

  async function ensureProjectRepositoryCache(project: AgentProject) {
    if (!project.repositoryUrl) {
      return project
    }

    let workspace = await workspaceStore.createProjectCache({
      name: project.name,
      projectId: project.id,
      repositoryUrl: project.repositoryUrl,
      ref: project.repositoryRef,
    })

    workspace = await workspaceStore.updateRepositorySource(workspace.id, {
      baseRef: project.repositoryRef,
      name: `${project.name} cache`.slice(0, 80),
      repositoryUrl: project.repositoryUrl,
      ref: project.repositoryRef,
    })

    try {
      await ensureRepositoryCache({
        repositoryUrl: project.repositoryUrl,
        ref: project.repositoryRef,
        settings: sandboxSettings,
        target: workspace,
        githubToken: await getGitHubToken(),
      })
    } catch (error) {
      const message = getErrorMessage(error)
      await workspaceStore.markError(workspace.id, message)
      throw badRequest(message)
    }

    if (project.workspaceId === workspace.id) {
      return project
    }

    return issueStore.updateProject(project.id, { workspaceId: workspace.id })
  }

  async function getRepositoryCacheForProject(project: AgentProject) {
    const updatedProject = await ensureProjectRepositoryCache(project)

    if (!updatedProject.repositoryUrl) {
      throw badRequest(
        'Configure a project repository before starting this issue',
      )
    }

    if (!updatedProject.workspaceId) {
      throw badRequest(
        'Configure a project repository before starting this issue',
      )
    }

    return {
      project: updatedProject,
      workspace: await workspaceStore.get(updatedProject.workspaceId),
    }
  }

  async function getGitHubToken() {
    const toolSettings = await toolSettingsStore.get()
    return toolSettings.github.enabled ? toolSettings.github.token : undefined
  }
}

const isActiveRunStatus = (status: AgentRun['status']) => {
  return status === 'running' || status === 'idle' || status === 'awaiting_user'
}

const buildTaskBranchName = (
  prefix: string,
  title: string,
  issueId: string,
) => {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 60)
  const suffix = Date.now().toString(36)

  return `${prefix}/${slug || 'issue'}-${issueId.slice(0, 8)}-${suffix}`
}

const getRouteParam = (value: string | string[] | undefined, name: string) => {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  throw badRequest(`Route parameter '${name}' is required`)
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown project repository error'
}
