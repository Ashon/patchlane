import type OpenAI from 'openai'

/**
 * Supervisor orchestration tools.
 *
 * Each tool is a thin wrapper over Patchlane's own HTTP API, called back against
 * the server's own origin. This deliberately reuses the exact validation,
 * cascade, repository-cache, and agent-spawning logic behind the routes instead
 * of duplicating it. Only non-destructive endpoints are exposed — there is no
 * delete tool, so the supervisor cannot remove projects, issues, or runs.
 */

export type SupervisorToolContext = {
  baseUrl: string
  signal?: AbortSignal
}

export type SupervisorTool = {
  definition: OpenAI.Chat.Completions.ChatCompletionFunctionTool
  execute: (
    args: Record<string, unknown>,
    context: SupervisorToolContext,
  ) => Promise<unknown>
}

const safeJsonParse = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const callApi = async (
  context: SupervisorToolContext,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> => {
  const response = await fetch(`${context.baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: context.signal,
  })
  const text = await response.text()
  const data = text ? safeJsonParse(text) : undefined

  if (!response.ok) {
    const message =
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed with status ${response.status}`
    throw new Error(message)
  }

  return data
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined

const truncate = (value: unknown, max = 400): unknown => {
  if (typeof value !== 'string') {
    return value
  }

  return value.length > max ? `${value.slice(0, max)}…` : value
}

type UnknownRecord = Record<string, unknown>

const trimProject = (project: UnknownRecord) => ({
  id: project.id,
  code: project.code,
  name: project.name,
  description: truncate(project.description),
  repositoryUrl: project.repositoryUrl,
  repositoryRef: project.repositoryRef,
  branchPrefix: project.branchPrefix,
  workspaceId: project.workspaceId,
  defaultEndpointId: project.defaultEndpointId,
  defaultAgentRuntime: project.defaultAgentRuntime,
})

const trimIssueSummary = (issue: UnknownRecord) => ({
  id: issue.id,
  number: issue.number,
  title: issue.title,
  status: issue.status,
  priority: issue.priority,
  projectId: issue.projectId,
  taskCount: Array.isArray(issue.subtasks) ? issue.subtasks.length : 0,
})

const trimSubtask = (subtask: UnknownRecord) => ({
  id: subtask.id,
  title: subtask.title,
  status: subtask.status,
  kind: subtask.kind,
  sequence: subtask.sequence,
})

const trimIssueDetail = (issue: UnknownRecord) => ({
  ...trimIssueSummary(issue),
  description: truncate(issue.description, 800),
  branchName: issue.branchName,
  prUrl: issue.prUrl,
  subtasks: Array.isArray(issue.subtasks)
    ? issue.subtasks.map((subtask) => trimSubtask(subtask as UnknownRecord))
    : [],
})

const trimEndpoint = (endpoint: UnknownRecord) => ({
  id: endpoint.id,
  name: endpoint.name,
  runtimeType: endpoint.runtimeType,
  defaultModel: endpoint.defaultModel,
  enabled: endpoint.enabled,
})

const trimWorkspace = (workspace: UnknownRecord) => ({
  id: workspace.id,
  name: workspace.name,
  status: workspace.status,
  repositoryUrl: workspace.repositoryUrl,
  ref: workspace.ref,
})

const listIssues = async (context: SupervisorToolContext) => {
  const data = (await callApi(context, 'GET', '/api/issues')) as {
    issues?: UnknownRecord[]
  }
  return data.issues ?? []
}

const findIssue = async (context: SupervisorToolContext, issueId: string) => {
  const issues = await listIssues(context)
  const issue = issues.find((item) => item.id === issueId)

  if (!issue) {
    throw new Error(`Issue '${issueId}' was not found`)
  }

  return issue
}

const issueStatusValues = [
  'backlog',
  'planning',
  'ready',
  'running',
  'awaiting_user',
  'review',
  'completed',
  'finalized',
  'blocked',
  'failed',
]
const issuePriorityValues = ['low', 'medium', 'high', 'urgent']

export const supervisorTools: SupervisorTool[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_projects',
        description:
          'List all Patchlane projects with their ids, codes, repositories, and defaults.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    },
    execute: async (_args, context) => {
      const data = (await callApi(context, 'GET', '/api/issues/projects')) as {
        projects?: UnknownRecord[]
      }
      return { projects: (data.projects ?? []).map(trimProject) }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'create_project',
        description:
          'Create a new project. A repository URL is optional but required later before coding runs can start.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Human-readable project name.',
            },
            description: {
              type: 'string',
              description: 'What the project is for.',
            },
            code: {
              type: 'string',
              description:
                'Optional 2-8 char uppercase code (e.g. PLN). Auto-generated from the name when omitted.',
            },
            repositoryUrl: {
              type: 'string',
              description: 'Optional Git repository URL to attach.',
            },
            repositoryRef: {
              type: 'string',
              description: 'Optional default branch/ref (e.g. main).',
            },
            branchPrefix: {
              type: 'string',
              description:
                'Optional branch prefix for agent branches (default: agent).',
            },
          },
          required: ['name', 'description'],
          additionalProperties: false,
        },
      },
    },
    execute: async (args, context) => {
      const data = (await callApi(context, 'POST', '/api/issues/projects', {
        name: asString(args.name),
        description: asString(args.description),
        code: asString(args.code),
        repositoryUrl: asString(args.repositoryUrl),
        repositoryRef: asString(args.repositoryRef),
        branchPrefix: asString(args.branchPrefix),
      })) as { project?: UnknownRecord }
      return { project: data.project ? trimProject(data.project) : null }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'update_project',
        description: 'Update fields on an existing project.',
        parameters: {
          type: 'object',
          properties: {
            projectId: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            repositoryUrl: { type: 'string' },
            repositoryRef: { type: 'string' },
            branchPrefix: { type: 'string' },
          },
          required: ['projectId'],
          additionalProperties: false,
        },
      },
    },
    execute: async (args, context) => {
      const projectId = asString(args.projectId)

      if (!projectId) {
        throw new Error('projectId is required')
      }

      const body: UnknownRecord = {}
      for (const key of [
        'name',
        'description',
        'repositoryUrl',
        'repositoryRef',
        'branchPrefix',
      ]) {
        const value = asString(args[key])
        if (value !== undefined) {
          body[key] = value
        }
      }

      const data = (await callApi(
        context,
        'PATCH',
        `/api/issues/projects/${encodeURIComponent(projectId)}`,
        body,
      )) as { project?: UnknownRecord }
      return { project: data.project ? trimProject(data.project) : null }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_issues',
        description:
          'List issues, optionally filtered by project and/or status. Returns compact summaries.',
        parameters: {
          type: 'object',
          properties: {
            projectId: { type: 'string' },
            status: { type: 'string', enum: issueStatusValues },
          },
          additionalProperties: false,
        },
      },
    },
    execute: async (args, context) => {
      const projectId = asString(args.projectId)
      const status = asString(args.status)
      let issues = await listIssues(context)

      if (projectId) {
        issues = issues.filter((issue) => issue.projectId === projectId)
      }

      if (status) {
        issues = issues.filter((issue) => issue.status === status)
      }

      return { issues: issues.map(trimIssueSummary) }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_issue',
        description:
          'Get one issue in detail, including its tasks, status, branch, and PR link.',
        parameters: {
          type: 'object',
          properties: { issueId: { type: 'string' } },
          required: ['issueId'],
          additionalProperties: false,
        },
      },
    },
    execute: async (args, context) => {
      const issueId = asString(args.issueId)

      if (!issueId) {
        throw new Error('issueId is required')
      }

      return { issue: trimIssueDetail(await findIssue(context, issueId)) }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'create_issue',
        description: 'Create an issue inside a project.',
        parameters: {
          type: 'object',
          properties: {
            projectId: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            priority: { type: 'string', enum: issuePriorityValues },
          },
          required: ['projectId', 'title', 'description'],
          additionalProperties: false,
        },
      },
    },
    execute: async (args, context) => {
      const data = (await callApi(context, 'POST', '/api/issues', {
        projectId: asString(args.projectId),
        title: asString(args.title),
        description: asString(args.description),
        priority: asString(args.priority),
      })) as { issue?: UnknownRecord }
      return { issue: data.issue ? trimIssueDetail(data.issue) : null }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'update_issue',
        description:
          'Update an issue. Use status to triage (e.g. set to "ready") or re-prioritize.',
        parameters: {
          type: 'object',
          properties: {
            issueId: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: issueStatusValues },
            priority: { type: 'string', enum: issuePriorityValues },
          },
          required: ['issueId'],
          additionalProperties: false,
        },
      },
    },
    execute: async (args, context) => {
      const issueId = asString(args.issueId)

      if (!issueId) {
        throw new Error('issueId is required')
      }

      const body: UnknownRecord = {}
      for (const key of ['title', 'description', 'status', 'priority']) {
        const value = asString(args[key])
        if (value !== undefined) {
          body[key] = value
        }
      }

      const data = (await callApi(
        context,
        'PATCH',
        `/api/issues/${encodeURIComponent(issueId)}`,
        body,
      )) as { issue?: UnknownRecord }
      return { issue: data.issue ? trimIssueDetail(data.issue) : null }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'plan_issue',
        description:
          'Generate an ordered task plan for an issue using the planning model. Use before starting work when the issue has no tasks.',
        parameters: {
          type: 'object',
          properties: {
            issueId: { type: 'string' },
            endpointId: {
              type: 'string',
              description:
                'Optional planning endpoint id; falls back to project default.',
            },
          },
          required: ['issueId'],
          additionalProperties: false,
        },
      },
    },
    execute: async (args, context) => {
      const issueId = asString(args.issueId)

      if (!issueId) {
        throw new Error('issueId is required')
      }

      const data = (await callApi(
        context,
        'POST',
        `/api/issues/${encodeURIComponent(issueId)}/plan`,
        { endpointId: asString(args.endpointId) },
      )) as { issue?: UnknownRecord }
      return { issue: data.issue ? trimIssueDetail(data.issue) : null }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'start_issue',
        description:
          'Assign work by advancing the issue workflow: plans the issue if needed and starts the next task as a coding run. Requires the project to have a repository configured.',
        parameters: {
          type: 'object',
          properties: {
            issueId: { type: 'string' },
            endpointId: { type: 'string' },
          },
          required: ['issueId'],
          additionalProperties: false,
        },
      },
    },
    execute: async (args, context) => {
      const issueId = asString(args.issueId)

      if (!issueId) {
        throw new Error('issueId is required')
      }

      const data = (await callApi(
        context,
        'POST',
        `/api/issues/${encodeURIComponent(issueId)}/workflow/continue`,
        { endpointId: asString(args.endpointId) },
      )) as { issue?: UnknownRecord; run?: UnknownRecord }
      return {
        issue: data.issue ? trimIssueDetail(data.issue) : null,
        run: data.run
          ? {
              id: data.run.id,
              status: data.run.status,
              title: data.run.title,
              branchName: data.run.branchName,
            }
          : null,
      }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_endpoints',
        description:
          'List configured LLM/agent runtime endpoints (for choosing an endpointId).',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    },
    execute: async (_args, context) => {
      const data = (await callApi(context, 'GET', '/api/llm/endpoints')) as {
        endpoints?: UnknownRecord[]
      }
      return { endpoints: (data.endpoints ?? []).map(trimEndpoint) }
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_workspaces',
        description: 'List sandbox workspaces and their status.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    },
    execute: async (_args, context) => {
      const data = (await callApi(
        context,
        'GET',
        '/api/sandbox/workspaces',
      )) as {
        workspaces?: UnknownRecord[]
      }
      return { workspaces: (data.workspaces ?? []).map(trimWorkspace) }
    },
  },
]

export const supervisorToolMap = new Map(
  supervisorTools.map((tool) => [tool.definition.function.name, tool]),
)

export const supervisorToolDefinitions = supervisorTools.map(
  (tool) => tool.definition,
)
