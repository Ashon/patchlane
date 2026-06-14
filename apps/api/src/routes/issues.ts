import { Router } from 'express'
import {
  type AgentProject,
  type AgentRun,
  type AgentRuntimeConnectorType,
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
import { buildIssueArtifactManifest } from '../issues/issueArtifacts'
import { reconcileIssueTaskState } from '../issues/issueReconciliation'
import type { IssueStore } from '../issues/issueStore'
import { getRequestLogger } from '../logging/accessLog'
import { createChildLogger } from '../logging/logger'
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
  const workflowLogger = createChildLogger({ component: 'workflow' })

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
    '/:id/finalize',
    asyncHandler(async (request, response) => {
      const id = getRouteParam(request.params.id, 'id')
      const { issue } = await reconcileIssueTaskState({
        issueId: id,
        issueStore,
        runStore,
      })
      const manifest = await buildIssueArtifactManifest({
        issue,
        runStore,
        workspaceStore,
      })
      const finalizedIssue = await issueStore.finalizeIssue(issue.id, manifest)

      response.json({ issue: finalizedIssue, manifest })
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

  router.get(
    '/:id/tasks/:taskId/executions',
    asyncHandler(async (request, response) => {
      const issueId = getRouteParam(request.params.id, 'id')
      const taskId = getRouteParam(request.params.taskId, 'taskId')
      const issue = await issueStore.getIssue(issueId)

      if (!issue.subtasks.some((task) => task.id === taskId)) {
        throw badRequest(`Issue task '${taskId}' was not found`)
      }

      response.json({
        executions: await runStore.listForIssueTask(issueId, taskId),
      })
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
      getRequestLogger(response).info(
        {
          component: 'workflow',
          event: 'workflow.issue.planned',
          issueId: issue.id,
          projectId: issue.projectId,
          taskCount: issue.subtasks.length,
          endpointId: input.endpointId,
        },
        'Issue workflow planned',
      )

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

      if (
        task.status !== 'pending' &&
        task.status !== 'awaiting_user' &&
        task.status !== 'failed'
      ) {
        throw badRequest(
          `Issue task '${taskId}' cannot be started from status ${task.status}`,
        )
      }

      const { issue: updatedIssue, run } = await startIssueTaskRun({
        agentRuntime: input.agentRuntime,
        agentRuntimeConnectorId: input.agentRuntimeConnectorId,
        endpointId: input.endpointId,
        issue,
        task,
      })
      getRequestLogger(response).info(
        {
          component: 'workflow',
          event: 'workflow.task.started',
          issueId: updatedIssue.id,
          taskId: task.id,
          runId: run.id,
          agentRuntime: run.agentRuntime,
          runKind: run.kind,
          workspaceId: run.workspaceId,
        },
        'Issue task run started',
      )

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

      if (
        subtask.status !== 'pending' &&
        subtask.status !== 'awaiting_user' &&
        subtask.status !== 'failed'
      ) {
        throw badRequest(
          `Issue subtask '${subtaskId}' cannot be started from status ${subtask.status}`,
        )
      }

      const { issue: updatedIssue, run } = await startIssueTaskRun({
        agentRuntime: input.agentRuntime,
        agentRuntimeConnectorId: input.agentRuntimeConnectorId,
        endpointId: input.endpointId,
        issue,
        task: subtask,
      })
      getRequestLogger(response).info(
        {
          component: 'workflow',
          event: 'workflow.task.started',
          issueId: updatedIssue.id,
          taskId: subtask.id,
          runId: run.id,
          agentRuntime: run.agentRuntime,
          runKind: run.kind,
          workspaceId: run.workspaceId,
        },
        'Issue subtask run started',
      )

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
      const requestLogger = getRequestLogger(response)
      requestLogger.info(
        {
          component: 'workflow',
          event: 'workflow.continue.requested',
          issueId: issue.id,
          status: issue.status,
          taskCount: issue.subtasks.length,
        },
        'Issue workflow continuation requested',
      )

      if (issue.subtasks.length === 0) {
        issue = await planIssueTasks(issue, { endpointId: input.endpointId })
      }

      const activeRun = await findActiveIssueTaskRun(issue)

      if (activeRun) {
        requestLogger.info(
          {
            component: 'workflow',
            event: 'workflow.active_run_reused',
            issueId: issue.id,
            runId: activeRun.id,
            status: activeRun.status,
          },
          'Issue workflow reused active run',
        )
        response.json({ run: activeRun, issue, runs: [activeRun] })
        return
      }

      const task = getNextIssueTask(issue)

      if (!task) {
        requestLogger.info(
          {
            component: 'workflow',
            event: 'workflow.no_runnable_task',
            issueId: issue.id,
            status: issue.status,
          },
          'Issue workflow has no runnable task',
        )
        response.json({ issue, runs: [] })
        return
      }

      const { issue: updatedIssue, run } = await startIssueTaskRun({
        agentRuntime: input.agentRuntime,
        agentRuntimeConnectorId: input.agentRuntimeConnectorId,
        endpointId: input.endpointId,
        issue,
        task,
      })
      requestLogger.info(
        {
          component: 'workflow',
          event: 'workflow.task.started',
          issueId: updatedIssue.id,
          taskId: task.id,
          runId: run.id,
          agentRuntime: run.agentRuntime,
          runKind: run.kind,
          workspaceId: run.workspaceId,
        },
        'Issue workflow started next task',
      )

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
      const agentRuntime = input.agentRuntime ?? project.defaultAgentRuntime
      const runtimeConnectorId =
        input.agentRuntimeConnectorId ??
        project.defaultAgentRuntimeConnectorId ??
        (agentRuntime === 'patchlane' ? endpointId : undefined)

      if (agentRuntime === 'patchlane' && endpointId) {
        await endpointStore.get(endpointId)
      }

      if (runtimeConnectorId) {
        const connector = await endpointStore.get(runtimeConnectorId)

        validateAgentRuntimeConnector(agentRuntime, connector.runtimeType)
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
        endpointId: runtimeConnectorId ?? endpointId,
        agentRuntime,
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
      getRequestLogger(response).info(
        {
          component: 'workflow',
          event: 'workflow.issue_run.started',
          issueId: issue.id,
          runId: run.id,
          agentRuntime: run.agentRuntime,
          runKind: run.kind,
          workspaceId: run.workspaceId,
          branchName,
        },
        'Issue coding run started',
      )

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
    const startedAt = Date.now()
    const project = await issueStore.getProject(issue.projectId)
    const endpoint = options.endpointId
      ? await endpointStore.get(options.endpointId)
      : issue.endpointId
        ? await endpointStore.get(issue.endpointId)
        : project.defaultEndpointId
          ? await endpointStore.get(project.defaultEndpointId)
          : await endpointStore.getDefault()
    workflowLogger.info(
      {
        event: 'workflow.plan.started',
        issueId: issue.id,
        projectId: project.id,
        endpointId: endpoint.id,
      },
      'Issue workflow planning started',
    )
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
      const plannedIssue = await issueStore.replaceIssueTasks(
        issue.id,
        parseIssueTaskPlan(content),
      )
      workflowLogger.info(
        {
          event: 'workflow.plan.completed',
          issueId: plannedIssue.id,
          projectId: project.id,
          endpointId: endpoint.id,
          taskCount: plannedIssue.subtasks.length,
          durationMs: Date.now() - startedAt,
        },
        'Issue workflow planning completed',
      )

      return plannedIssue
    } catch (error) {
      workflowLogger.warn(
        {
          event: 'workflow.plan.failed',
          issueId: issue.id,
          projectId: project.id,
          endpointId: endpoint.id,
          durationMs: Date.now() - startedAt,
          err: error,
        },
        'Issue workflow planning failed',
      )
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
    agentRuntime,
    agentRuntimeConnectorId,
    endpointId,
    issue,
    task,
  }: {
    agentRuntime?: AgentRun['agentRuntime']
    agentRuntimeConnectorId?: string
    endpointId?: string
    issue: Issue
    task: IssueTask
  }) {
    const startedAt = Date.now()
    const activeRun = await runStore.findActiveForIssueTask(issue.id, task.id)

    if (activeRun) {
      const { issue: updatedIssue } = await issueStore.markTaskRunStarted(
        issue.id,
        task.id,
        activeRun.id,
      )
      workflowLogger.info(
        {
          event: 'workflow.task_run.reused',
          issueId: updatedIssue.id,
          taskId: task.id,
          runId: activeRun.id,
          status: activeRun.status,
          durationMs: Date.now() - startedAt,
        },
        'Issue task reused active agent run',
      )

      return { issue: updatedIssue, run: activeRun }
    }

    const { branchName, project, workspace } =
      await getOrCreateIssueTaskWorkspace(issue)
    const selectedEndpointId =
      endpointId ?? issue.endpointId ?? project.defaultEndpointId
    const selectedAgentRuntime = agentRuntime ?? project.defaultAgentRuntime
    const selectedRuntimeConnectorId =
      agentRuntimeConnectorId ??
      project.defaultAgentRuntimeConnectorId ??
      (selectedAgentRuntime === 'patchlane' ? selectedEndpointId : undefined)

    if (selectedAgentRuntime === 'patchlane' && selectedEndpointId) {
      await endpointStore.get(selectedEndpointId)
    }

    if (selectedRuntimeConnectorId) {
      const connector = await endpointStore.get(selectedRuntimeConnectorId)

      validateAgentRuntimeConnector(selectedAgentRuntime, connector.runtimeType)
    }

    const run = await runStore.create({
      workspaceId: workspace.id,
      endpointId: selectedRuntimeConnectorId ?? selectedEndpointId,
      agentRuntime: selectedAgentRuntime,
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
    workflowLogger.info(
      {
        event: 'workflow.task_run.created',
        issueId: updatedIssue.id,
        projectId: project.id,
        taskId: task.id,
        taskKind: task.kind,
        runId: run.id,
        runKind: run.kind,
        agentRuntime: run.agentRuntime,
        endpointId: run.endpointId,
        workspaceId: workspace.id,
        branchName,
        durationMs: Date.now() - startedAt,
      },
      'Issue task agent run created',
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
      workflowLogger.info(
        {
          event: 'workflow.workspace.reused',
          issueId: issue.id,
          projectId: project.id,
          workspaceId: existingWorkspace.id,
          branchName: existingWorkspace.branchName ?? issue.branchName,
        },
        'Issue task workspace reused',
      )
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
      workflowLogger.warn(
        {
          event: 'workflow.workspace.failed',
          issueId: issue.id,
          projectId: project.id,
          workspaceId: taskWorkspace.id,
          branchName,
          err: error,
        },
        'Issue task workspace creation failed',
      )
      throw badRequest(message)
    }
    workflowLogger.info(
      {
        event: 'workflow.workspace.created',
        issueId: issue.id,
        projectId: project.id,
        workspaceId: taskWorkspace.id,
        branchName,
      },
      'Issue task workspace created',
    )

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

const validateAgentRuntimeConnector = (
  agentRuntime: AgentRun['agentRuntime'],
  connectorType: AgentRuntimeConnectorType,
) => {
  if (agentRuntime === 'opencode' && connectorType !== 'opencode_cli') {
    throw badRequest('Select an OpenCode CLI runtime connector')
  }

  if (agentRuntime === 'codex' && connectorType !== 'codex_cli') {
    throw badRequest('Select a Codex CLI runtime connector')
  }

  if (agentRuntime === 'patchlane' && connectorType !== 'openai_compatible') {
    throw badRequest('Select an OpenAI-compatible runtime connector')
  }
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown project repository error'
}
