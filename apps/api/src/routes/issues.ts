import { Router } from 'express'
import {
  type AgentProject,
  type AgentRun,
  type Issue,
  type IssueTask,
  createAgentProjectSchema,
  createIssueSchema,
  replaceIssueSubtasksSchema,
  type SandboxSettings,
  startIssueSchema,
  updateAgentProjectSchema,
  updateIssueSchema,
  updateIssueTaskSchema,
  updateIssueSubtaskSchema,
} from '@patchlane/shared'
import type { AgentRunStore } from '../agent/agentRunStore'
import { asyncHandler } from '../http/asyncHandler'
import { badRequest } from '../http/errors'
import { reconcileIssueTaskState } from '../issues/issueReconciliation'
import type { IssueStore } from '../issues/issueStore'
import {
  buildIssueRunTaskPrompt,
  buildIssueTaskRunTaskPrompt,
} from '../issues/issueTaskPrompts'
import {
  buildIssueTaskPlanningPrompt,
  parseIssueTaskPlan,
} from '../issues/issueSubtaskPlanning'
import {
  getIssueTaskRunKind,
  getNextIssueTask,
} from '../issues/issueSubtaskWorkflow'
import type { LlmEndpointStore } from '../llm/endpointStore'
import { createChatCompletion } from '../llm/openaiClient'
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

  router.put(
    '/:id/subtasks',
    asyncHandler(async (request, response) => {
      const issue = await issueStore.replaceIssueSubtasks(
        getRouteParam(request.params.id, 'id'),
        replaceIssueSubtasksSchema.parse(request.body),
      )

      response.json({ issue })
    }),
  )

  router.put(
    '/:id/tasks',
    asyncHandler(async (request, response) => {
      const issue = await issueStore.replaceIssueTasks(
        getRouteParam(request.params.id, 'id'),
        request.body,
      )

      response.json({ issue })
    }),
  )

  router.patch(
    '/:id/subtasks/:subtaskId',
    asyncHandler(async (request, response) => {
      const result = await issueStore.updateIssueSubtask(
        getRouteParam(request.params.id, 'id'),
        getRouteParam(request.params.subtaskId, 'subtaskId'),
        updateIssueSubtaskSchema.parse(request.body),
      )

      response.json(result)
    }),
  )

  router.patch(
    '/:id/tasks/:taskId',
    asyncHandler(async (request, response) => {
      const result = await issueStore.updateIssueTask(
        getRouteParam(request.params.id, 'id'),
        getRouteParam(request.params.taskId, 'taskId'),
        updateIssueTaskSchema.parse(request.body),
      )

      response.json({ issue: result.issue, task: result.subtask })
    }),
  )

  router.post(
    '/:id/plan',
    asyncHandler(async (request, response) => {
      const input = startIssueSchema.parse(request.body)
      const id = getRouteParam(request.params.id, 'id')
      const issue = await planIssueTasks(await issueStore.getIssue(id), {
        endpointId: input.endpointId,
      })

      response.status(201).json({ issue })
    }),
  )

  router.post(
    '/:id/tasks/:taskId/start',
    asyncHandler(async (request, response) => {
      const input = startIssueSchema.parse(request.body)
      const id = getRouteParam(request.params.id, 'id')
      const taskId = getRouteParam(request.params.taskId, 'taskId')
      const issue = await issueStore.getIssue(id)
      const task = issue.subtasks.find((item) => item.id === taskId)

      if (!task) {
        throw badRequest(`Issue task '${taskId}' was not found`)
      }

      if (task.status !== 'pending' && task.status !== 'awaiting_user') {
        throw badRequest(
          `Issue task '${taskId}' cannot be started from status ${task.status}`,
        )
      }

      const { issue: updatedIssue, run } = await startIssueTaskRun({
        endpointId: input.endpointId,
        issue,
        task,
      })

      response.status(201).json({ run, issue: updatedIssue, runs: [run] })
    }),
  )

  router.post(
    '/:id/subtasks/:subtaskId/start',
    asyncHandler(async (request, response) => {
      const input = startIssueSchema.parse(request.body)
      const id = getRouteParam(request.params.id, 'id')
      const subtaskId = getRouteParam(request.params.subtaskId, 'subtaskId')
      const issue = await issueStore.getIssue(id)
      const subtask = issue.subtasks.find((item) => item.id === subtaskId)

      if (!subtask) {
        throw badRequest(`Issue subtask '${subtaskId}' was not found`)
      }

      if (subtask.status !== 'pending' && subtask.status !== 'awaiting_user') {
        throw badRequest(
          `Issue subtask '${subtaskId}' cannot be started from status ${subtask.status}`,
        )
      }

      const { issue: updatedIssue, run } = await startIssueTaskRun({
        endpointId: input.endpointId,
        issue,
        task: subtask,
      })

      response.status(201).json({ run, issue: updatedIssue, runs: [run] })
    }),
  )

  router.post(
    '/:id/workflow/continue',
    asyncHandler(async (request, response) => {
      const input = startIssueSchema.parse(request.body)
      const id = getRouteParam(request.params.id, 'id')
      let { issue } = await reconcileIssueTaskState({
        issueId: id,
        issueStore,
        runStore,
      })

      if (issue.subtasks.length === 0) {
        issue = await planIssueTasks(issue, { endpointId: input.endpointId })
      }

      const activeRun = await findActiveIssueTaskRun(issue)

      if (activeRun) {
        response.json({ run: activeRun, issue, runs: [activeRun] })
        return
      }

      const task = getNextIssueTask(issue)

      if (!task) {
        response.json({ issue, runs: [] })
        return
      }

      const { issue: updatedIssue, run } = await startIssueTaskRun({
        endpointId: input.endpointId,
        issue,
        task,
      })

      response.status(201).json({ run, issue: updatedIssue, runs: [run] })
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

  async function planIssueTasks(
    issue: Issue,
    options: { endpointId?: string } = {},
  ) {
    const project = await issueStore.getProject(issue.projectId)
    const endpoint = options.endpointId
      ? await endpointStore.get(options.endpointId)
      : issue.endpointId
        ? await endpointStore.get(issue.endpointId)
        : project.defaultEndpointId
          ? await endpointStore.get(project.defaultEndpointId)
          : await endpointStore.getDefault()
    const completion = await createChatCompletion(endpoint, {
      maxTokens: 2048,
      messages: [
        {
          role: 'system',
          content: [
            'You create bounded execution plans for agentic coding issues.',
            'Return strict JSON only. Do not include markdown or commentary.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: buildIssueTaskPlanningPrompt({ issue, project }),
        },
      ],
      temperature: 0.2,
    })
    const content = completion.choices[0]?.message?.content

    if (!content) {
      throw badRequest('The planning model returned an empty task plan')
    }

    try {
      return await issueStore.replaceIssueTasks(
        issue.id,
        parseIssueTaskPlan(content),
      )
    } catch (error) {
      throw badRequest(`Failed to parse task plan: ${getErrorMessage(error)}`)
    }
  }

  async function findActiveIssueTaskRun(issue: Issue) {
    for (const task of issue.subtasks) {
      if (task.status !== 'running' && task.status !== 'awaiting_user') {
        continue
      }

      if (!task.agentRunId) {
        continue
      }

      const run = await runStore.find(task.agentRunId)

      if (run && isActiveRunStatus(run.status)) {
        return run
      }
    }

    return undefined
  }

  async function startIssueTaskRun({
    endpointId,
    issue,
    task,
  }: {
    endpointId?: string
    issue: Issue
    task: IssueTask
  }) {
    const { branchName, project, workspace } =
      await getOrCreateIssueTaskWorkspace(issue)
    const selectedEndpointId =
      endpointId ?? issue.endpointId ?? project.defaultEndpointId

    if (selectedEndpointId) {
      await endpointStore.get(selectedEndpointId)
    }

    const run = await runStore.create({
      workspaceId: workspace.id,
      endpointId: selectedEndpointId,
      kind: getIssueTaskRunKind(task.kind),
      projectId: project.id,
      issueId: issue.id,
      subtaskId: task.id,
      branchName,
      title: `${issue.title}: ${task.title}`.slice(0, 120),
      task: buildIssueTaskRunTaskPrompt({
        branchName,
        issue,
        project,
        task,
      }),
    })
    await workspaceStore.linkAgentRun(workspace.id, run.id)
    const startedIssue = await issueStore.markRunStarted(issue.id, run.id, {
      branchName,
      endpointId: selectedEndpointId,
      workspaceId: workspace.id,
    })
    const { issue: updatedIssue } = await issueStore.markTaskRunStarted(
      startedIssue.id,
      task.id,
      run.id,
    )

    return { issue: updatedIssue, run }
  }

  async function getOrCreateIssueTaskWorkspace(issue: Issue) {
    const { project, workspace: repositoryCache } =
      await getRepositoryCacheForProject(
        await issueStore.getProject(issue.projectId),
      )
    const existingWorkspace = issue.workspaceId
      ? await workspaceStore.get(issue.workspaceId).catch(() => undefined)
      : undefined

    if (existingWorkspace?.kind === 'task_worktree') {
      return {
        branchName:
          existingWorkspace.branchName ??
          issue.branchName ??
          buildTaskBranchName(project.branchPrefix, issue.title, issue.id),
        project,
        workspace: existingWorkspace,
      }
    }

    const branchName = buildTaskBranchName(
      project.branchPrefix,
      issue.title,
      issue.id,
    )
    const taskWorkspace = await workspaceStore.createTaskWorktree({
      baseRef: project.repositoryRef,
      branchName,
      issueId: issue.id,
      name: `${project.name} ${issue.title}`.slice(0, 80),
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

    return { branchName, project, workspace: taskWorkspace }
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
