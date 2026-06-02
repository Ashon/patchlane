import { Router } from "express";
import {
  type AgentProject,
  type AgentRun,
  analyzeIssueSchema,
  createAgentProjectSchema,
  createIssueSchema,
  type LlmEndpoint,
  type SandboxSettings,
  type SandboxWorkspace,
  startIssueSchema,
  updateAgentProjectSchema,
  updateIssueSchema
} from "@agent-fleet/shared";
import type { AgentRunStore } from "../agent/agentRunStore";
import { asyncHandler } from "../http/asyncHandler";
import { badRequest } from "../http/errors";
import { analyzeIssueRequirements, combineIssuePlanningAnalysis, planIssueWork } from "../issues/issueAnalysisAgent";
import { reconcileIssuePlanningState } from "../issues/issueReconciliation";
import type { IssueStore } from "../issues/issueStore";
import type { LlmEndpointStore } from "../llm/endpointStore";
import { createWorktreeFromCache, ensureRepositoryCache } from "../sandbox/gitSandbox";
import type { SandboxWorkspaceStore } from "../sandbox/sandboxWorkspaceStore";
import { listWorkspaceFiles } from "../sandbox/workspaceFiles";
import type { ToolSettingsStore } from "../tools/toolSettingsStore";

type IssuesRouterOptions = {
  endpointStore: LlmEndpointStore;
  issueStore: IssueStore;
  runStore: AgentRunStore;
  sandboxSettings: SandboxSettings;
  toolSettingsStore: ToolSettingsStore;
  workspaceStore: SandboxWorkspaceStore;
};

export const createIssuesRouter = ({
  endpointStore,
  issueStore,
  runStore,
  sandboxSettings,
  toolSettingsStore,
  workspaceStore
}: IssuesRouterOptions) => {
  const router = Router();

  router.get(
    "/projects",
    asyncHandler(async (_request, response) => {
      response.json({ projects: await issueStore.listProjects() });
    })
  );

  router.post(
    "/projects",
    asyncHandler(async (request, response) => {
      const input = createAgentProjectSchema.parse(request.body);
      const project = await ensureProjectRepositoryCache(await issueStore.createProject(input));
      response.status(201).json({ project });
    })
  );

  router.patch(
    "/projects/:id",
    asyncHandler(async (request, response) => {
      const id = getRouteParam(request.params.id, "id");
      const input = updateAgentProjectSchema.parse(request.body);
      const project = await ensureProjectRepositoryCache(await issueStore.updateProject(id, input));
      response.json({ project });
    })
  );

  router.delete(
    "/projects/:id",
    asyncHandler(async (request, response) => {
      await issueStore.removeProject(getRouteParam(request.params.id, "id"));
      response.status(204).send();
    })
  );

  router.get(
    "/",
    asyncHandler(async (_request, response) => {
      response.json({ issues: await issueStore.listIssues() });
    })
  );

  router.post(
    "/",
    asyncHandler(async (request, response) => {
      const issue = await issueStore.createIssue(createIssueSchema.parse(request.body));
      response.status(201).json({ issue });
    })
  );

  router.patch(
    "/:id",
    asyncHandler(async (request, response) => {
      const issue = await issueStore.updateIssue(getRouteParam(request.params.id, "id"), updateIssueSchema.parse(request.body));
      response.json({ issue });
    })
  );

  router.post(
    "/:id/analyze",
    asyncHandler(async (request, response) => {
      const input = analyzeIssueSchema.parse(request.body);
      response.status(202).json(await analyzeIssueWithAgent(getRouteParam(request.params.id, "id"), input.endpointId));
    })
  );

  router.post(
    "/:id/start",
    asyncHandler(async (request, response) => {
      const input = startIssueSchema.parse(request.body);
      const id = getRouteParam(request.params.id, "id");
      const { issue: currentIssue, runs: reconciledRuns } = await reconcileIssuePlanningState({
        issueId: id,
        issueStore,
        runStore
      });

      if (await hasActiveCodingRun(currentIssue.agentRunId)) {
        throw badRequest("This issue already has a running agent run");
      }

      if (!isIssueAnalysisReady(currentIssue)) {
        const analysisResult = await analyzeIssueWithAgent(id, input.endpointId);
        response.status(202).json({ issue: analysisResult.issue, runs: [...reconciledRuns, ...analysisResult.runs] });
        return;
      }

      const readyIssue = currentIssue;
      const { project, workspace: repositoryCache } = await getRepositoryCacheForProject(
        await issueStore.getProject(readyIssue.projectId)
      );
      const endpointId = input.endpointId ?? readyIssue.endpointId ?? project.defaultEndpointId;

      if (endpointId) {
        await endpointStore.get(endpointId);
      }

      const branchName = buildTaskBranchName(project.branchPrefix, readyIssue.title, readyIssue.id);
      const taskWorkspace = await workspaceStore.createTaskWorktree({
        baseRef: project.repositoryRef,
        branchName,
        issueId: readyIssue.id,
        name: `${project.name} ${readyIssue.title}`.slice(0, 80),
        parentWorkspaceId: repositoryCache.id,
        projectId: project.id,
        repositoryUrl: project.repositoryUrl ?? repositoryCache.repositoryUrl ?? "",
        ref: project.repositoryRef
      });

      try {
        await createWorktreeFromCache({
          baseRef: project.repositoryRef,
          branchName,
          cache: repositoryCache,
          settings: sandboxSettings,
          target: taskWorkspace,
          githubToken: await getGitHubToken()
        });
      } catch (error) {
        const message = getErrorMessage(error);
        await workspaceStore.markError(taskWorkspace.id, message);
        throw badRequest(message);
      }

      const run = await runStore.create({
        workspaceId: taskWorkspace.id,
        endpointId,
        kind: "coding",
        projectId: project.id,
        issueId: readyIssue.id,
        branchName,
        title: readyIssue.title,
        task: buildRunTask({ branchName, issue: readyIssue, project })
      });
      await workspaceStore.linkAgentRun(taskWorkspace.id, run.id);
      const issue = await issueStore.markRunStarted(readyIssue.id, run.id, {
        branchName,
        endpointId,
        workspaceId: taskWorkspace.id
      });

      response.status(201).json({ run, issue, runs: [run] });
    })
  );

  return router;

  async function analyzeIssueWithAgent(id: string, requestedEndpointId?: string) {
    const reconciled = await reconcileIssuePlanningState({
      issueId: id,
      issueStore,
      runStore
    });

    if (isIssueAnalysisReady(reconciled.issue)) {
      return {
        issue: reconciled.issue,
        runs: reconciled.runs.length ? reconciled.runs : await getPlanningRuns(reconciled.issue)
      };
    }

    const context = await issueStore.getIssueAnalysisContext(id, requestedEndpointId);
    const endpoint = context.endpointId ? await endpointStore.get(context.endpointId) : await endpointStore.getDefault();
    const workspace = context.workspaceId ? await workspaceStore.get(context.workspaceId) : undefined;

    if (!workspace) {
      throw badRequest("Connect a repository or sandbox workspace before creating analysis agent tasks");
    }

    const existingRuns = await getActivePlanningRuns(context.issue);

    if (existingRuns) {
      return {
        issue: context.issue,
        runs: existingRuns
      };
    }

    const requirementRun = await createAgentTask({
      endpointId: endpoint.id,
      issueId: context.issue.id,
      kind: "requirements",
      projectId: context.project.id,
      task: buildRequirementTaskPrompt({
        branchName: context.branchName,
        issue: context.issue,
        projectName: context.project.name
      }),
      title: `Requirements: ${context.issue.title}`,
      workspaceId: workspace.id
    });
    const planningRun = await createAgentTask({
      endpointId: endpoint.id,
      issueId: context.issue.id,
      kind: "planning",
      projectId: context.project.id,
      task: buildPlanningTaskPrompt({
        branchName: context.branchName,
        issue: context.issue,
        projectName: context.project.name,
        requirementRunId: requirementRun.id
      }),
      title: `Work plan: ${context.issue.title}`,
      workspaceId: workspace.id
    });
    const issue = await issueStore.markPlanningStarted(id, {
      branchName: context.branchName,
      endpointId: endpoint.id,
      eventMessage: `Requirement and planning tasks started for ${context.branchName}.`,
      planningRunId: planningRun.id,
      requirementRunId: requirementRun.id,
      workspaceId: workspace.id
    });

    void completeIssuePlanning({
      branchName: context.branchName,
      endpoint,
      issueId: context.issue.id,
      planningRun,
      project: context.project,
      requirementRun,
      workspace
    }).catch((error) => {
      console.error(`Issue planning background task crashed for ${context.issue.id}: ${getErrorMessage(error)}`);
    });

    return {
      issue,
      runs: [requirementRun, planningRun]
    };
  }

  async function createAgentTask({
    endpointId,
    issueId,
    kind,
    projectId,
    task,
    title,
    workspaceId
  }: {
    endpointId: string;
    issueId: string;
    kind: "requirements" | "planning";
    projectId: string;
    task: string;
    title: string;
    workspaceId: string;
  }) {
    const run = await runStore.create({
      endpointId,
      issueId,
      kind,
      projectId,
      task,
      title: title.slice(0, 120),
      workspaceId
    });

    return runStore.setStatus(run.id, "running");
  }

  async function completeIssuePlanning({
    branchName,
    endpoint,
    issueId,
    planningRun,
    project,
    requirementRun,
    workspace
  }: {
    branchName: string;
    endpoint: LlmEndpoint;
    issueId: string;
    planningRun: AgentRun;
    project: AgentProject;
    requirementRun: AgentRun;
    workspace: SandboxWorkspace;
  }) {
    let requirementCompleted = false;
    let planningCompleted = false;

    try {
      const issue = await issueStore.getIssue(issueId);
      const fileEntries = workspace.status === "ready" ? await listWorkspaceFiles(workspace).catch(() => []) : [];
      const input = {
        branchName,
        endpoint,
        fileEntries,
        issue,
        project,
        workspace
      };
      const requirementAnalysis = await analyzeIssueRequirements(input);
      const requirementWithResult = await runStore.appendMessage(requirementRun.id, {
        role: "assistant",
        content: requirementAnalysis
      });
      await runStore.setStatus(requirementWithResult.id, "completed");
      requirementCompleted = true;

      const workPlan = await planIssueWork(input, requirementAnalysis);
      const planningWithResult = await runStore.appendMessage(planningRun.id, {
        role: "assistant",
        content: workPlan
      });
      await runStore.setStatus(planningWithResult.id, "completed");
      planningCompleted = true;

      const analysis = combineIssuePlanningAnalysis(requirementAnalysis, workPlan);
      await issueStore.analyzeIssue(issueId, {
        analysis: analysis.combinedAnalysis,
        endpointId: endpoint.id,
        eventMessage: `Requirement and planning tasks completed for ${branchName}.`,
        planningRunId: planningRun.id,
        requirementRunId: requirementRun.id
      });
    } catch (error) {
      const message = getErrorMessage(error);
      console.error(`Issue planning failed for ${issueId}: ${message}`);

      if (!requirementCompleted) {
        await failAgentTask(requirementRun.id, message);
      }

      if (!planningCompleted) {
        await failAgentTask(planningRun.id, message);
      }

      await issueStore.updateIssue(issueId, { status: "failed" }, `Planning failed: ${message}`);
    }
  }

  async function failAgentTask(runId: string, message: string) {
    try {
      const withError = await runStore.appendMessage(runId, {
        role: "assistant",
        content: `Planning failed.\n\n${message}`
      });

      return runStore.setStatus(withError.id, "failed", message);
    } catch (error) {
      console.error(`Could not mark agent task ${runId} as failed: ${getErrorMessage(error)}`);
      return undefined;
    }
  }

  async function getActivePlanningRuns(issue: Awaited<ReturnType<IssueStore["getIssue"]>>) {
    if (issue.analysis || !issue.requirementRunId || !issue.planningRunId) {
      return undefined;
    }

    const runs = await getPlanningRuns(issue);

    return runs.some((run) => run.status === "running" || run.status === "idle") ? runs : undefined;
  }

  async function getPlanningRuns(issue: Awaited<ReturnType<IssueStore["getIssue"]>>) {
    const runIds = [issue.requirementRunId, issue.planningRunId].filter((runId): runId is string => Boolean(runId));
    const runs: AgentRun[] = [];

    for (const runId of runIds) {
      try {
        runs.push(await runStore.get(runId));
      } catch {
        // Missing linked tasks should not block creating a fresh plan.
      }
    }

    return runs;
  }

  async function hasActiveCodingRun(runId?: string) {
    if (!runId) {
      return false;
    }

    const run = await runStore.find(runId);

    return Boolean(run && isActiveRunStatus(run.status));
  }

  async function ensureProjectRepositoryCache(project: AgentProject) {
    if (!project.repositoryUrl) {
      return project;
    }

    let workspace = await workspaceStore.createProjectCache({
      name: project.name,
      projectId: project.id,
      repositoryUrl: project.repositoryUrl,
      ref: project.repositoryRef
    });

    workspace = await workspaceStore.updateRepositorySource(workspace.id, {
      baseRef: project.repositoryRef,
      name: `${project.name} cache`.slice(0, 80),
      repositoryUrl: project.repositoryUrl,
      ref: project.repositoryRef
    });

    try {
      await ensureRepositoryCache({
        repositoryUrl: project.repositoryUrl,
        ref: project.repositoryRef,
        settings: sandboxSettings,
        target: workspace,
        githubToken: await getGitHubToken()
      });
    } catch (error) {
      const message = getErrorMessage(error);
      await workspaceStore.markError(workspace.id, message);
      throw badRequest(message);
    }

    if (project.workspaceId === workspace.id) {
      return project;
    }

    return issueStore.updateProject(project.id, { workspaceId: workspace.id });
  }

  async function getRepositoryCacheForProject(project: AgentProject) {
    const updatedProject = await ensureProjectRepositoryCache(project);

    if (!updatedProject.repositoryUrl) {
      throw badRequest("Configure a project repository before starting this issue");
    }

    if (!updatedProject.workspaceId) {
      throw badRequest("Configure a project repository before starting this issue");
    }

    return {
      project: updatedProject,
      workspace: await workspaceStore.get(updatedProject.workspaceId)
    };
  }

  async function getGitHubToken() {
    const toolSettings = await toolSettingsStore.get();
    return toolSettings.github.enabled ? toolSettings.github.token : undefined;
  }
};

const buildRunTask = ({
  branchName,
  issue,
  project
}: {
  branchName: string;
  issue: Awaited<ReturnType<IssueStore["getIssue"]>>;
  project: Awaited<ReturnType<IssueStore["getProject"]>>;
}) => {
  return [
    `Issue: ${issue.title}`,
    `Priority: ${issue.priority}`,
    `Project: ${project.name}`,
    project.repositoryUrl ? `Repository: ${project.repositoryUrl}` : "Repository: not configured",
    project.repositoryRef ? `Repository ref: ${project.repositoryRef}` : "Repository ref: default",
    `Project policy: ${project.description}`,
    `Branch/worktree target: ${branchName}`,
    "",
    "Issue description:",
    issue.description,
    "",
    issue.analysis ? `Current analysis:\n${issue.analysis}` : "Current analysis: not available",
    "",
    "Execution policy:",
    "- Inspect the workspace before editing.",
    "- Keep work isolated to this issue branch/worktree context.",
    "- Implement the requested change when the issue is actionable.",
    "- Run relevant verification and summarize outcomes.",
    "- If the issue is blocked, stop and explain exactly what input is needed."
  ].join("\n");
};

const buildRequirementTaskPrompt = ({
  branchName,
  issue,
  projectName
}: {
  branchName: string;
  issue: Awaited<ReturnType<IssueStore["getIssue"]>>;
  projectName: string;
}) => {
  return [
    "Analyze requirements for this issue. This task is generated from the Projects planning flow.",
    "",
    `Project: ${projectName}`,
    `Issue: ${issue.title}`,
    `Priority: ${issue.priority}`,
    `Target branch/worktree: ${branchName}`,
    "",
    "Issue description:",
    issue.description
  ].join("\n");
};

const buildPlanningTaskPrompt = ({
  branchName,
  issue,
  projectName,
  requirementRunId
}: {
  branchName: string;
  issue: Awaited<ReturnType<IssueStore["getIssue"]>>;
  projectName: string;
  requirementRunId: string;
}) => {
  return [
    "Create a concrete work plan for the coding agent. This task is generated from the Projects planning flow.",
    "",
    `Project: ${projectName}`,
    `Issue: ${issue.title}`,
    `Priority: ${issue.priority}`,
    `Target branch/worktree: ${branchName}`,
    `Requirement analysis task: ${requirementRunId}`,
    "",
    "Issue description:",
    issue.description
  ].join("\n");
};

const isIssueAnalysisReady = (issue: Awaited<ReturnType<IssueStore["getIssue"]>>) => {
  return Boolean(issue.analysis && issue.workspaceId && issue.requirementRunId && issue.planningRunId);
};

const isActiveRunStatus = (status: AgentRun["status"]) => {
  return status === "running" || status === "idle" || status === "awaiting_user";
};

const buildTaskBranchName = (prefix: string, title: string, issueId: string) => {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60);
  const suffix = Date.now().toString(36);

  return `${prefix}/${slug || "issue"}-${issueId.slice(0, 8)}-${suffix}`;
};

const getRouteParam = (value: string | string[] | undefined, name: string) => {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw badRequest(`Route parameter '${name}' is required`);
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown project repository error";
};
