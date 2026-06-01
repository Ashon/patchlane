import { Router } from "express";
import {
  analyzeIssueSchema,
  createAgentProjectSchema,
  createIssueSchema,
  type SandboxSettings,
  startIssueSchema,
  updateAgentProjectSchema,
  updateIssueSchema
} from "@agent-fleet/shared";
import type { AgentRunStore } from "../agent/agentRunStore";
import { asyncHandler } from "../http/asyncHandler";
import { badRequest } from "../http/errors";
import type { IssueStore } from "../issues/issueStore";
import type { LlmEndpointStore } from "../llm/endpointStore";
import { cloneRepositoryIntoSandbox } from "../sandbox/gitSandbox";
import type { SandboxWorkspaceStore } from "../sandbox/sandboxWorkspaceStore";
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
      const project = await issueStore.createProject(await prepareProjectInput(input));
      response.status(201).json({ project });
    })
  );

  router.patch(
    "/projects/:id",
    asyncHandler(async (request, response) => {
      const id = getRouteParam(request.params.id, "id");
      const current = await issueStore.getProject(id);
      const input = updateAgentProjectSchema.parse(request.body);
      const project = await issueStore.updateProject(id, await prepareProjectInput(input, current));
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
      const issue = await issueStore.analyzeIssue(getRouteParam(request.params.id, "id"), input.endpointId);
      response.json({ issue });
    })
  );

  router.post(
    "/:id/start",
    asyncHandler(async (request, response) => {
      const input = startIssueSchema.parse(request.body);
      const id = getRouteParam(request.params.id, "id");
      const currentIssue = await issueStore.getIssue(id);

      if (currentIssue.agentRunId && currentIssue.status === "running") {
        throw badRequest("This issue already has a running agent run");
      }

      const readyIssue =
        currentIssue.analysis && currentIssue.workspaceId
          ? currentIssue
          : await issueStore.analyzeIssue(id, input.endpointId);
      const project = await issueStore.getProject(readyIssue.projectId);
      const workspaceId = readyIssue.workspaceId ?? project.workspaceId;
      const endpointId = input.endpointId ?? readyIssue.endpointId ?? project.defaultEndpointId;

      if (!workspaceId) {
        throw badRequest("Configure a project repository before starting this issue");
      }

      await workspaceStore.get(workspaceId);

      if (endpointId) {
        await endpointStore.get(endpointId);
      }

      const run = await runStore.create({
        workspaceId,
        endpointId,
        title: readyIssue.title,
        task: buildRunTask({ issue: readyIssue, project })
      });
      const issue = await issueStore.markRunStarted(readyIssue.id, run.id, endpointId);

      response.status(201).json({ run, issue });
    })
  );

  return router;

  async function prepareProjectInput<TInput extends { name?: string; repositoryUrl?: string; repositoryRef?: string; workspaceId?: string }>(
    input: TInput,
    current?: Awaited<ReturnType<IssueStore["getProject"]>>
  ) {
    const repositoryUrl = input.repositoryUrl ?? current?.repositoryUrl;
    const repositoryRef = input.repositoryRef ?? current?.repositoryRef;
    const repositoryChanged = Boolean(input.repositoryUrl && input.repositoryUrl !== current?.repositoryUrl);
    const refChanged = Boolean(input.repositoryRef !== undefined && input.repositoryRef !== current?.repositoryRef);
    const needsWorkspace = Boolean(repositoryUrl && (!current?.workspaceId || repositoryChanged || refChanged));

    if (!repositoryUrl || !needsWorkspace) {
      return input;
    }

    const workspace = await workspaceStore.create({
      name: input.name ?? current?.name,
      repositoryUrl,
      ref: repositoryRef
    });

    try {
      const toolSettings = await toolSettingsStore.get();
      await cloneRepositoryIntoSandbox({
        repositoryUrl,
        ref: repositoryRef,
        settings: sandboxSettings,
        target: workspace,
        githubToken: toolSettings.github.enabled ? toolSettings.github.token : undefined
      });
    } catch (error) {
      const message = getErrorMessage(error);
      await workspaceStore.markError(workspace.id, message);
      throw badRequest(message);
    }

    return {
      ...input,
      workspaceId: workspace.id
    };
  }
};

const buildRunTask = ({
  issue,
  project
}: {
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
    issue.branchName ? `Branch/worktree target: ${issue.branchName}` : `Branch/worktree prefix: ${project.branchPrefix}`,
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
