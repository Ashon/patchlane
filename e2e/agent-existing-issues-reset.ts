import { DatabaseSync } from 'node:sqlite'

const apiBaseUrl = (
  process.env.PATCHLANE_EXISTING_ISSUES_API_BASE_URL || 'http://localhost:8787'
).replace(/\/+$/u, '')
const databaseFile =
  process.env.PATCHLANE_EXISTING_ISSUES_DB_FILE ||
  'apps/api/.data/patchlane.sqlite'
const projectCode = process.env.PATCHLANE_EXISTING_ISSUES_PROJECT_CODE || 'PLN'
const issueNumbers = (
  process.env.PATCHLANE_EXISTING_ISSUE_NUMBERS || '1,2,3'
)
  .split(',')
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter(Number.isFinite)
const requestTimeoutMs = Number.parseInt(
  process.env.PATCHLANE_EXISTING_ISSUES_TIMEOUT_MS || '900000',
  10,
)
const pollIntervalMs = Number.parseInt(
  process.env.PATCHLANE_EXISTING_ISSUES_POLL_INTERVAL_MS || '3000',
  10,
)
const maxWorkflowSteps = Number.parseInt(
  process.env.PATCHLANE_EXISTING_ISSUES_MAX_STEPS || '18',
  10,
)
const model = process.env.PATCHLANE_EXISTING_ISSUES_MODEL

type ProjectSnapshot = {
  code: string
  defaultEndpointId?: string
  id: string
  name: string
}

type IssueSnapshot = {
  comments: Array<{
    author: string
    body: string
    kind: string
    runId?: string
  }>
  id: string
  number: number
  projectId: string
  status: string
  subtasks: IssueTaskSnapshot[]
  title: string
}

type IssueTaskSnapshot = {
  agentRunId?: string
  id: string
  kind: string
  resultSummary?: string
  sequence: number
  status: string
  title: string
}

type AgentRunSnapshot = {
  id: string
  issueId?: string
  kind: string
  resultSummary?: string
  status: string
  subtaskId?: string
  title: string
}

type IssueSpec = {
  description: string
  number: number
}

type WorkflowSummary = {
  comments: number
  issueNumber: number
  ok: boolean
  runs: Array<{
    id: string
    kind: string
    status: string
    subtaskId?: string
    title: string
  }>
  status: string
  tasks: Array<{
    kind: string
    status: string
    title: string
  }>
  title: string
}

const issueSpecs: IssueSpec[] = [
  {
    number: 1,
    description: [
      'Improve the agent task chat UI so structured JSON tool input and output are easier to inspect.',
      '',
      'Current code areas to inspect:',
      '- apps/web/src/components/ui/tool.tsx',
      '- apps/web/src/components/chat/chat-tool-part.ts',
      '- apps/web/src/components/ui/code-block.tsx',
      '- apps/web/src/lib/agent-task-messages.ts',
      '',
      'Acceptance criteria:',
      '1. Detect JSON objects, arrays, and stringified JSON for tool input/output display.',
      '2. Keep collapsed tool rows compact and avoid dumping large one-line JSON in the preview.',
      '3. Show expanded JSON with readable indentation, stable scrolling/wrapping, and copy-friendly text.',
      '4. Preserve non-JSON output fallback behavior and the existing tool status affordances.',
      '5. Add focused web tests when parser or formatter helpers are introduced.',
      '6. Verify with pnpm --filter @patchlane/web typecheck and the relevant focused tests.',
      '',
      'Do not ask for clarification. Plan the work into issue tasks, execute the tasks, verify, add concise issue comments, and finish.',
    ].join('\n'),
  },
  {
    number: 2,
    description: [
      'Allow creating a project issue with only a title.',
      '',
      'Current code areas to inspect:',
      '- packages/shared/src/issues.ts',
      '- apps/api/src/issues/issueStore.ts',
      '- apps/web/src/components/issues/project-issues-view.tsx',
      '- apps/web/src/components/app/app-command-palette.tsx',
      '',
      'Acceptance criteria:',
      '1. The API accepts POST /api/issues with title and projectId only.',
      '2. Missing or blank description is normalized safely without breaking issue parsing or persistence.',
      '3. The project issue dialog does not require the Description field.',
      '4. The command palette quick issue flow does not require the Description field.',
      '5. Existing issue creation with a description remains supported.',
      '6. Add or update focused tests for title-only issue creation.',
      '7. Verify with pnpm --filter @patchlane/api test, pnpm --filter @patchlane/web typecheck, and any focused web tests if UI helpers change.',
      '',
      'Do not ask for clarification. Plan the work into issue tasks, execute the tasks, verify, add concise issue comments, and finish.',
    ].join('\n'),
  },
  {
    number: 3,
    description: [
      'Make running task badges visually explicit by showing a loader icon.',
      '',
      'Current code areas to inspect:',
      '- apps/web/src/components/issues/common.tsx',
      '- apps/web/src/components/issues/project-tasks-view.tsx',
      '- apps/web/src/pages/agent/agent-tasks-page.tsx',
      '',
      'Acceptance criteria:',
      '1. Running issue task status badges show a small Loader2 icon with animate-spin.',
      '2. Running agent run status badges keep a consistent icon/text layout where they are used in task lists.',
      '3. Completed, failed, pending, skipped, and awaiting_user visual states keep their current semantic tone.',
      '4. Icon size is stable so task rows do not shift when status changes.',
      '5. Verify with pnpm --filter @patchlane/web typecheck and focused tests if badge behavior is covered.',
      '',
      'Do not ask for clarification. Plan the work into issue tasks, execute the tasks, verify, add concise issue comments, and finish.',
    ].join('\n'),
  },
]

const main = async () => {
  if (issueNumbers.length === 0) {
    throw new Error('No issue numbers were provided')
  }

  await waitForApi()

  const { projects } = await apiRequest<{ projects: ProjectSnapshot[] }>(
    '/api/issues/projects',
  )
  const project = projects.find((item) => item.code === projectCode)

  if (!project) {
    throw new Error(`Project with code ${projectCode} was not found`)
  }

  const endpointId =
    process.env.PATCHLANE_EXISTING_ISSUES_ENDPOINT_ID ||
    project.defaultEndpointId ||
    (await getFirstEnabledEndpointId())

  const issues = await getProjectIssues(project.id)
  const targetIssues = issueNumbers.map((number) => {
    const issue = issues.find((item) => item.number === number)

    if (!issue) {
      throw new Error(`${projectCode}-${number} was not found`)
    }

    return issue
  })

  await deleteLinkedRuns(targetIssues)
  resetIssuesInDatabase(targetIssues, endpointId)

  const resetIssues = await getProjectIssues(project.id)
  console.log('Reset issues')
  for (const issue of targetIssues) {
    const resetIssue = resetIssues.find((item) => item.id === issue.id)
    console.log(
      `- ${projectCode}-${issue.number}: ${resetIssue?.status} / tasks=${resetIssue?.subtasks.length ?? 0}`,
    )
  }

  const summaries: WorkflowSummary[] = []
  for (const issue of targetIssues) {
    summaries.push(await runIssueWorkflow(projectCode, issue, endpointId))
  }

  console.log('\nExisting issue E2E summary')
  for (const summary of summaries) {
    console.log(
      `- ${projectCode}-${summary.issueNumber}: ok=${summary.ok} status=${summary.status} tasks=${summary.tasks.map((task) => task.status).join(',')}`,
    )
  }

  console.log(JSON.stringify({ summaries }, null, 2))

  if (summaries.some((summary) => !summary.ok)) {
    process.exitCode = 1
  }
}

const getProjectIssues = async (projectId: string) => {
  const { issues } = await apiRequest<{ issues: IssueSnapshot[] }>(
    '/api/issues',
  )

  return issues
    .filter((issue) => issue.projectId === projectId)
    .sort((left, right) => left.number - right.number)
}

const deleteLinkedRuns = async (issues: IssueSnapshot[]) => {
  const issueIds = new Set(issues.map((issue) => issue.id))
  const { runs } = await apiRequest<{ runs: AgentRunSnapshot[] }>(
    '/api/agent/runs',
  )
  const linkedRuns = runs.filter(
    (run) => run.issueId && issueIds.has(run.issueId),
  )

  console.log(`Deleting ${linkedRuns.length} linked runs`)
  for (const run of linkedRuns) {
    console.log(`- delete run ${run.id} (${run.status}) ${run.title}`)
    await apiRequest(`/api/agent/runs/${run.id}?cleanupWorkspace=true`, {
      method: 'DELETE',
    })
  }
}

const resetIssuesInDatabase = (
  issues: IssueSnapshot[],
  endpointId: string | undefined,
) => {
  const specsByNumber = new Map(issueSpecs.map((spec) => [spec.number, spec]))
  const now = new Date().toISOString()
  const db = new DatabaseSync(databaseFile)

  db.exec('PRAGMA busy_timeout = 5000')
  db.exec('BEGIN IMMEDIATE')

  try {
    const deleteSubtasks = db.prepare(
      'DELETE FROM issue_subtasks WHERE issue_id = ?',
    )
    const deleteComments = db.prepare(
      'DELETE FROM issue_comments WHERE issue_id = ?',
    )
    const deleteEvents = db.prepare('DELETE FROM issue_events WHERE issue_id = ?')
    const updateIssue = db.prepare(`
      UPDATE issues
      SET description = ?, workspace_id = NULL, endpoint_id = ?,
        requirement_run_id = NULL, planning_run_id = NULL, agent_run_id = NULL,
        status = 'backlog', priority = 'medium', analysis = NULL,
        branch_name = NULL, pr_url = NULL, updated_at = ?
      WHERE id = ?
    `)

    for (const issue of issues) {
      const spec = specsByNumber.get(issue.number)

      if (!spec) {
        throw new Error(`Missing spec for issue number ${issue.number}`)
      }

      deleteSubtasks.run(issue.id)
      deleteComments.run(issue.id)
      deleteEvents.run(issue.id)
      updateIssue.run(spec.description, endpointId ?? null, now, issue.id)
    }

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    db.close()
  }
}

const runIssueWorkflow = async (
  projectCodeValue: string,
  initialIssue: IssueSnapshot,
  endpointId: string | undefined,
): Promise<WorkflowSummary> => {
  const runs: WorkflowSummary['runs'] = []
  let issue = initialIssue

  console.log(`\nRunning ${projectCodeValue}-${issue.number}: ${issue.title}`)

  for (let step = 1; step <= maxWorkflowSteps; step += 1) {
    issue = await getIssue(issue.id)

    if (issue.status === 'completed') {
      break
    }

    const workflow = await apiRequest<{
      issue: IssueSnapshot
      run?: AgentRunSnapshot
      runs?: AgentRunSnapshot[]
    }>(`/api/issues/${issue.id}/workflow/continue`, {
      method: 'POST',
      body: {
        endpointId,
      },
    })

    issue = workflow.issue

    if (!workflow.run) {
      console.log(
        `- step ${step}: no runnable task; issue status=${issue.status}`,
      )
      break
    }

    let run = workflow.run
    console.log(
      `- step ${step}: run ${run.id} status=${run.status} kind=${run.kind} subtask=${run.subtaskId ?? 'none'}`,
    )

    if (run.status === 'idle' || run.status === 'running') {
      run = await continueRunAndPoll(run.id, issue.id, endpointId)
      console.log(`  completed request -> ${run.status}`)
    }

    runs.push({
      id: run.id,
      kind: run.kind,
      status: run.status,
      subtaskId: run.subtaskId,
      title: run.title,
    })

    issue = await getIssue(issue.id)
    console.log(
      `  issue -> ${issue.status}; tasks=${issue.subtasks.map((task) => `${task.sequence + 1}:${task.status}`).join(' ')}`,
    )

    if (run.status === 'failed' || run.status === 'awaiting_user') {
      break
    }
  }

  issue = await getIssue(issue.id)
  const ok =
    issue.status === 'completed' &&
    issue.subtasks.length > 0 &&
    issue.subtasks.every(
      (task) => task.status === 'completed' || task.status === 'skipped',
    )

  return {
    comments: issue.comments.length,
    issueNumber: issue.number,
    ok,
    runs,
    status: issue.status,
    tasks: issue.subtasks.map((task) => ({
      kind: task.kind,
      status: task.status,
      title: task.title,
    })),
    title: issue.title,
  }
}

const getIssue = async (id: string) => {
  const { issues } = await apiRequest<{ issues: IssueSnapshot[] }>(
    '/api/issues',
  )
  const issue = issues.find((item) => item.id === id)

  if (!issue) {
    throw new Error(`Issue ${id} was not found`)
  }

  return issue
}

const getAgentRun = async (id: string) => {
  const { run } = await apiRequest<{ run: AgentRunSnapshot }>(
    `/api/agent/runs/${id}`,
  )

  return run
}

const continueRunAndPoll = async (
  runId: string,
  issueId: string,
  endpointId: string | undefined,
) => {
  let continueAttempt = 0
  let continueAbortController: AbortController | undefined
  let continueRequest: Promise<AgentRunSnapshot | undefined> | undefined
  let finished = false
  let lastContinueError = ''
  let lastPollError = ''
  let lastRunStatus = ''
  let lastTaskStatus = ''
  let lastContinueStartedAt = 0
  const startedAt = Date.now()

  const startContinue = () => {
    continueAttempt += 1
    lastContinueStartedAt = Date.now()
    continueAbortController = new AbortController()
    console.log(`  continue attempt ${continueAttempt}`)
    continueRequest = apiRequest<{ run: AgentRunSnapshot }>(
      `/api/agent/runs/${runId}/continue`,
      {
        method: 'POST',
        body: {
          endpointId,
          model,
        },
        signal: continueAbortController.signal,
      },
    )
      .then(({ run }) => run)
      .catch((error: unknown) => {
        if (finished) {
          return undefined
        }

        const message = getErrorMessage(error)

        if (message !== lastContinueError) {
          console.log(`  continue retryable error: ${message}`)
          lastContinueError = message
        }

        continueRequest = undefined
        return undefined
      })
  }

  startContinue()

  while (Date.now() - startedAt < requestTimeoutMs) {
    let run: AgentRunSnapshot
    let issue: IssueSnapshot

    try {
      ;[run, issue] = await Promise.all([getAgentRun(runId), getIssue(issueId)])
    } catch (error) {
      const message = getErrorMessage(error)

      if (message !== lastPollError) {
        console.log(`  poll retry: ${message}`)
        lastPollError = message
      }

      await sleep(pollIntervalMs)
      continue
    }

    lastPollError = ''
    const taskStatus = issue.subtasks
      .map((task) => `${task.sequence + 1}:${task.status}`)
      .join(' ')

    if (run.status !== lastRunStatus || taskStatus !== lastTaskStatus) {
      console.log(
        `  poll -> run=${run.status}; issue=${issue.status}; tasks=${taskStatus}`,
      )
      lastRunStatus = run.status
      lastTaskStatus = taskStatus
    }

    if (isTerminalRunStatus(run.status)) {
      const continued = await Promise.race([
        continueRequest ?? Promise.resolve(undefined),
        sleep(Math.min(pollIntervalMs, 3_000)).then(() => undefined),
      ])
      finished = true
      continueAbortController?.abort()

      if (continued) {
        return continued
      }

      return run
    }

    if (
      !continueRequest &&
      Date.now() - lastContinueStartedAt >= pollIntervalMs
    ) {
      startContinue()
    }

    await sleep(pollIntervalMs)
  }

  finished = true
  continueAbortController?.abort()
  throw new Error(`Run ${runId} did not finish within ${requestTimeoutMs}ms`)
}

const isTerminalRunStatus = (status: string) => {
  return status !== 'idle' && status !== 'running'
}

const getFirstEnabledEndpointId = async () => {
  const { endpoints } = await apiRequest<{
    endpoints: Array<{ enabled: boolean; id: string }>
  }>('/api/llm/endpoints')
  const endpoint = endpoints.find((item) => item.enabled)

  if (!endpoint) {
    throw new Error('No enabled endpoint was found')
  }

  return endpoint.id
}

const waitForApi = async () => {
  const response = await fetch(`${apiBaseUrl}/health`, {
    signal: AbortSignal.timeout(2_000),
  }).catch((error: unknown) => {
    throw new Error(
      `Patchlane API is not reachable at ${apiBaseUrl}: ${getErrorMessage(error)}`,
    )
  })

  if (!response.ok) {
    throw new Error(`Patchlane API health check failed with ${response.status}`)
  }
}

const apiRequest = async <ResponseBody>(
  urlPath: string,
  options: {
    body?: Record<string, unknown>
    method?: string
    signal?: AbortSignal
  } = {},
): Promise<ResponseBody> => {
  const response = await fetch(`${apiBaseUrl}${urlPath}`, {
    body: options.body
      ? JSON.stringify(removeUndefined(options.body))
      : undefined,
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    method: options.method ?? 'GET',
    signal: options.signal ?? AbortSignal.timeout(requestTimeoutMs),
  })
  const text = await response.text()

  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${urlPath} failed with ${response.status}: ${text}`,
    )
  }

  return (text ? JSON.parse(text) : undefined) as ResponseBody
}

const removeUndefined = (value: Record<string, unknown>) => {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  )
}

const sleep = async (durationMs: number) => {
  await new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown error'
}

main().catch((error: unknown) => {
  console.error(getErrorMessage(error))
  process.exitCode = 1
})
