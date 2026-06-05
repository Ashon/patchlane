import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { promisify } from 'node:util'
import {
  agentRegressionCases,
  type AgentRegressionCase,
} from './agent-regression-cases'

const execFileAsync = promisify(execFile)
const defaultIssueNumbers = agentRegressionCases
  .map((regressionCase) => regressionCase.number)
  .join(',')

const apiBaseUrl = (
  process.env.PATCHLANE_EXISTING_ISSUES_API_BASE_URL || 'http://localhost:8787'
).replace(/\/+$/u, '')
const databaseFile =
  process.env.PATCHLANE_EXISTING_ISSUES_DB_FILE ||
  'apps/api/.data/patchlane.sqlite'
const projectCode = process.env.PATCHLANE_EXISTING_ISSUES_PROJECT_CODE || 'PLN'
const issueNumbers = (
  process.env.PATCHLANE_EXISTING_ISSUE_NUMBERS || defaultIssueNumbers
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
const reportFile =
  process.env.PATCHLANE_EXISTING_ISSUES_REPORT_FILE ||
  'apps/api/.data/e2e/agent-existing-issues-report.json'

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
  workspaceId?: string
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
  createdAt?: string
  id: string
  issueId?: string
  kind: string
  messages?: AgentRunMessageSnapshot[]
  resultSummary?: string
  status: string
  subtaskId?: string
  title: string
  updatedAt?: string
  workspaceId?: string
}

type AgentRunMessageSnapshot = {
  content: string
  metadata?: {
    durationMs?: number
    reasoning?: {
      estimatedTokens?: number
    }
    request?: {
      attempt?: number
      iteration?: number
      model?: string
    }
    tool?: {
      input?: {
        estimatedTokens?: number
      }
      output?: {
        estimatedTokens?: number
      }
    }
    usage?: {
      inputTokens?: number
      outputTokens?: number
      totalTokens?: number
    }
  }
  role: string
  toolName?: string
}

type WorkspaceSnapshot = {
  id: string
  path: string
}

type WorkflowMetrics = {
  assistantResponses: number
  blockedToolResults: number
  durationMs: number
  messages: number
  providerInputTokens: number
  providerOutputTokens: number
  providerRequests: number
  providerTotalTokens: number
  reasoningBlocks: number
  reasoningTokens: number
  toolInputTokens: number
  toolOutputTokens: number
  toolUses: number
}

type QualitySummary = {
  changedPaths: string[]
  ok: boolean
  requiredChangedPathPatterns: string[]
  violations: string[]
  workspacePath?: string
}

type WorkflowSummary = {
  comments: number
  description: string
  issueNumber: number
  metrics: WorkflowMetrics
  ok: boolean
  quality: QualitySummary
  runs: Array<{
    id: string
    kind: string
    metrics: WorkflowMetrics
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
  workflowOk: boolean
}

type RegressionReport = {
  apiBaseUrl: string
  endpointId?: string
  generatedAt: string
  issueNumbers: number[]
  model?: string
  projectCode: string
  summaries: WorkflowSummary[]
}

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
  const casesByNumber = new Map(
    agentRegressionCases.map((regressionCase) => [
      regressionCase.number,
      regressionCase,
    ]),
  )

  const issues = await getProjectIssues(project.id)
  const targetIssues = issueNumbers.map((number) => {
    const issue = issues.find((item) => item.number === number)

    if (!issue) {
      throw new Error(`${projectCode}-${number} was not found`)
    }

    if (!casesByNumber.has(number)) {
      throw new Error(`${projectCode}-${number} has no regression case`)
    }

    return issue
  })

  await deleteLinkedRuns(targetIssues)
  resetIssuesInDatabase(targetIssues, endpointId, casesByNumber)

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
    const regressionCase = casesByNumber.get(issue.number)

    if (!regressionCase) {
      throw new Error(`${projectCode}-${issue.number} has no regression case`)
    }

    summaries.push(
      await runIssueWorkflow(projectCode, issue, endpointId, regressionCase),
    )
  }

  console.log('\nExisting issue E2E summary')
  for (const summary of summaries) {
    console.log(
      `- ${projectCode}-${summary.issueNumber}: ok=${summary.ok} status=${summary.status} tasks=${summary.tasks.map((task) => task.status).join(',')}`,
    )
    for (const violation of summary.quality.violations) {
      console.log(`  quality: ${violation}`)
    }
  }

  const report: RegressionReport = {
    apiBaseUrl,
    endpointId,
    generatedAt: new Date().toISOString(),
    issueNumbers,
    model,
    projectCode,
    summaries,
  }

  await writeRegressionReport(report)
  console.log(`\nRegression report written to ${reportFile}`)
  console.log(JSON.stringify(report, null, 2))

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
  casesByNumber: Map<number, AgentRegressionCase>,
) => {
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
    const deleteEvents = db.prepare(
      'DELETE FROM issue_events WHERE issue_id = ?',
    )
    const updateIssue = db.prepare(`
      UPDATE issues
      SET description = ?, workspace_id = NULL, endpoint_id = ?,
        requirement_run_id = NULL, planning_run_id = NULL, agent_run_id = NULL,
        status = 'backlog', priority = 'medium', analysis = NULL,
        branch_name = NULL, pr_url = NULL, updated_at = ?
      WHERE id = ?
    `)

    for (const issue of issues) {
      const regressionCase = casesByNumber.get(issue.number)

      if (!regressionCase) {
        throw new Error(
          `Missing regression case for issue number ${issue.number}`,
        )
      }

      deleteSubtasks.run(issue.id)
      deleteComments.run(issue.id)
      deleteEvents.run(issue.id)
      updateIssue.run(
        regressionCase.description,
        endpointId ?? null,
        now,
        issue.id,
      )
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
  regressionCase: AgentRegressionCase,
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

    const persistedRun = await getAgentRun(run.id)
    const runMetrics = collectRunMetrics([persistedRun])

    runs.push({
      id: run.id,
      kind: run.kind,
      metrics: runMetrics,
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
  const runSnapshots = await Promise.all(runs.map((run) => getAgentRun(run.id)))
  const metrics = collectRunMetrics(runSnapshots)
  const workspacePath = await getIssueWorkspacePath(issue, runSnapshots)
  const changedPaths = workspacePath
    ? await collectChangedPaths(workspacePath)
    : []
  const quality = evaluateQuality({
    changedPaths,
    metrics,
    regressionCase,
    workspacePath,
  })
  const workflowOk =
    issue.status === 'completed' &&
    issue.subtasks.length > 0 &&
    issue.subtasks.every(
      (task) => task.status === 'completed' || task.status === 'skipped',
    )
  const ok = workflowOk && quality.ok

  return {
    comments: issue.comments.length,
    description: regressionCase.description,
    issueNumber: issue.number,
    metrics,
    ok,
    quality,
    runs,
    status: issue.status,
    tasks: issue.subtasks.map((task) => ({
      kind: task.kind,
      status: task.status,
      title: task.title,
    })),
    title: issue.title,
    workflowOk,
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

const getIssueWorkspacePath = async (
  issue: IssueSnapshot,
  runs: AgentRunSnapshot[],
) => {
  const workspaceId =
    issue.workspaceId ??
    [...runs]
      .reverse()
      .map((run) => run.workspaceId)
      .find((value): value is string => Boolean(value))

  if (!workspaceId) {
    return undefined
  }

  const { workspaces } = await apiRequest<{ workspaces: WorkspaceSnapshot[] }>(
    '/api/sandbox/workspaces',
  )

  return workspaces.find((workspace) => workspace.id === workspaceId)?.path
}

const collectChangedPaths = async (workspacePath: string) => {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', workspacePath, 'status', '--short', '--untracked-files=all'],
    {
      maxBuffer: 1024 * 1024 * 8,
    },
  )

  return stdout
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => normalizeGitStatusPath(line))
    .sort((left, right) => left.localeCompare(right))
}

const normalizeGitStatusPath = (line: string) => {
  const pathText = line.slice(3).trim()
  const renamedPath = pathText.includes(' -> ')
    ? (pathText.split(' -> ').at(-1) ?? pathText)
    : pathText

  return renamedPath.replace(/^"|"$/gu, '')
}

const collectRunMetrics = (runs: AgentRunSnapshot[]): WorkflowMetrics => {
  const requestKeys = new Set<string>()
  const metrics = createEmptyMetrics()

  for (const run of runs) {
    for (const message of run.messages ?? []) {
      const metadata = message.metadata

      metrics.messages += 1

      if (message.role === 'assistant') {
        metrics.assistantResponses += 1
      }

      if (metadata?.durationMs) {
        metrics.durationMs += metadata.durationMs
      }

      if (metadata?.reasoning?.estimatedTokens) {
        metrics.reasoningBlocks += 1
        metrics.reasoningTokens += metadata.reasoning.estimatedTokens
      }

      if (metadata?.usage && metadata.request) {
        const requestKey = [
          run.id,
          metadata.request.model ?? 'unknown',
          metadata.request.attempt ?? 'unknown',
          metadata.request.iteration ?? 'unknown',
        ].join(':')

        if (!requestKeys.has(requestKey)) {
          requestKeys.add(requestKey)
          metrics.providerRequests += 1
          metrics.providerInputTokens += metadata.usage.inputTokens ?? 0
          metrics.providerOutputTokens += metadata.usage.outputTokens ?? 0
          metrics.providerTotalTokens += metadata.usage.totalTokens ?? 0
        }
      }

      if (message.role === 'tool') {
        metrics.toolUses += 1
        metrics.toolInputTokens += metadata?.tool?.input?.estimatedTokens ?? 0
        metrics.toolOutputTokens += metadata?.tool?.output?.estimatedTokens ?? 0

        if (isBlockedToolResult(message)) {
          metrics.blockedToolResults += 1
        }
      }
    }
  }

  return metrics
}

const createEmptyMetrics = (): WorkflowMetrics => ({
  assistantResponses: 0,
  blockedToolResults: 0,
  durationMs: 0,
  messages: 0,
  providerInputTokens: 0,
  providerOutputTokens: 0,
  providerRequests: 0,
  providerTotalTokens: 0,
  reasoningBlocks: 0,
  reasoningTokens: 0,
  toolInputTokens: 0,
  toolOutputTokens: 0,
  toolUses: 0,
})

const isBlockedToolResult = (message: AgentRunMessageSnapshot) => {
  const content = message.content.trim()
  const lowerContent = content.toLowerCase()

  if (
    lowerContent.includes('blocked') ||
    lowerContent.includes('rejected') ||
    lowerContent.includes('timed out')
  ) {
    return true
  }

  try {
    const parsed = JSON.parse(content) as {
      blocked?: unknown
      error?: unknown
      exitCode?: unknown
      ok?: unknown
      timedOut?: unknown
    }

    return (
      parsed.ok === false ||
      parsed.blocked === true ||
      Boolean(parsed.error) ||
      parsed.timedOut === true ||
      (typeof parsed.exitCode === 'number' && parsed.exitCode !== 0)
    )
  } catch {
    return false
  }
}

const evaluateQuality = ({
  changedPaths,
  metrics,
  regressionCase,
  workspacePath,
}: {
  changedPaths: string[]
  metrics: WorkflowMetrics
  regressionCase: AgentRegressionCase
  workspacePath?: string
}): QualitySummary => {
  const violations: string[] = []
  const requiredChangedPathPatterns =
    regressionCase.quality.requiredChangedPathPatterns ?? []
  const forbiddenChangedPathPatterns =
    regressionCase.quality.forbiddenChangedPathPatterns ?? []

  if (!workspacePath) {
    violations.push('workspace path was not available for artifact checks')
  }

  for (const pattern of requiredChangedPathPatterns) {
    const regex = new RegExp(pattern, 'u')

    if (!changedPaths.some((changedPath) => regex.test(changedPath))) {
      violations.push(`required changed path pattern was missing: ${pattern}`)
    }
  }

  for (const pattern of forbiddenChangedPathPatterns) {
    const regex = new RegExp(pattern, 'u')
    const matchedPaths = changedPaths.filter((changedPath) =>
      regex.test(changedPath),
    )

    if (matchedPaths.length > 0) {
      violations.push(
        `forbidden changed path pattern matched ${pattern}: ${matchedPaths.join(', ')}`,
      )
    }
  }

  if (
    typeof regressionCase.quality.maxBlockedToolResults === 'number' &&
    metrics.blockedToolResults > regressionCase.quality.maxBlockedToolResults
  ) {
    violations.push(
      `blocked or failed tool results exceeded ${regressionCase.quality.maxBlockedToolResults}: ${metrics.blockedToolResults}`,
    )
  }

  return {
    changedPaths,
    ok: violations.length === 0,
    requiredChangedPathPatterns,
    violations,
    workspacePath,
  }
}

const writeRegressionReport = async (report: RegressionReport) => {
  await mkdir(path.dirname(reportFile), { recursive: true })
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
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
