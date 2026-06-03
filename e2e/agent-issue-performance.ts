import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const expectedMarker = 'Status: completed by Patchlane live model.'

type Endpoint = {
  id: string
  name: string
  baseUrl: string
  defaultModel: string
  enabled: boolean
}

type ProjectResponse = {
  project: {
    id: string
    name: string
    workspaceId?: string
  }
}

type IssueResponse = {
  issue: IssueSnapshot
}

type IssuesResponse = {
  issues: IssueSnapshot[]
}

type StartIssueResponse = {
  issue: IssueSnapshot
  run?: AgentRunSnapshot
}

type RunResponse = {
  run: AgentRunSnapshot
}

type WorkspacesResponse = {
  workspaces: Array<{
    id: string
    path: string
  }>
}

type IssueSnapshot = {
  agentRunId?: string
  id: string
  status: string
  workspaceId?: string
}

type AgentRunSnapshot = {
  id: string
  issueId?: string
  kind: string
  messages: AgentRunMessageSnapshot[]
  resultSummary?: string
  status: string
  workspaceId: string
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
      cachedInputTokens?: number
      inputTokens?: number
      outputTokens?: number
      reasoningTokens?: number
      totalTokens?: number
    }
  }
  role: string
  toolName?: string
}

type PerfSummary = {
  apiBaseUrl: string
  endpoint: {
    id: string
    model: string
    name: string
  }
  issue: {
    id: string
    status?: string
  }
  result: {
    ok: boolean
    readmeUpdated: boolean
    runStatus: string
  }
  run: {
    id: string
    resultSummary?: string
    toolNames: string[]
  }
  timingsMs: {
    continue: number
    setup: number
    start: number
    total: number
  }
  usage: {
    cachedInputTokens: number
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
}

const main = async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'patchlane-perf-'))
  const keepArtifacts = process.env.PATCHLANE_PERF_KEEP_ARTIFACTS === 'true'
  let apiProcess: ReturnType<typeof spawn> | undefined
  const totalStartedAt = performance.now()

  try {
    const api = await createApiTarget(tempDir)
    apiProcess = api.process

    const endpoint = await selectEndpoint(api.baseUrl)
    const fixtureRepo = await createFixtureRepository(tempDir)

    const setupStartedAt = performance.now()
    const projectResponse = await apiRequest<ProjectResponse>(
      api.baseUrl,
      '/api/issues/projects',
      {
        method: 'POST',
        body: {
          branchPrefix: 'perf',
          defaultEndpointId: endpoint.id,
          description:
            'A small fixture project used to benchmark live coding model behavior.',
          name: `Patchlane Perf Fixture ${new Date().toISOString()}`,
          repositoryRef: 'main',
          repositoryUrl: pathToFileURL(fixtureRepo).href,
        },
      },
    )
    const issueResponse = await apiRequest<IssueResponse>(
      api.baseUrl,
      '/api/issues',
      {
        method: 'POST',
        body: {
          description: [
            'Update README.md so it contains this exact line:',
            expectedMarker,
            '',
            'Then verify the content with a command and finish the task.',
            'Do not ask for clarification.',
          ].join('\n'),
          endpointId: endpoint.id,
          priority: 'medium',
          projectId: projectResponse.project.id,
          title: 'Benchmark README update',
        },
      },
    )

    if (!projectResponse.project.workspaceId) {
      throw new Error('Project repository cache workspace was not created')
    }

    const readyIssueResponse = await apiRequest<IssueResponse>(
      api.baseUrl,
      `/api/issues/${issueResponse.issue.id}`,
      {
        method: 'PATCH',
        body: {
          analysis: [
            'The issue is ready to run.',
            `Required README marker: ${expectedMarker}`,
            'Expected workflow: inspect, edit, verify, finish.',
          ].join('\n'),
          endpointId: endpoint.id,
          planningRunId: `perf-planning-${Date.now()}`,
          requirementRunId: `perf-requirements-${Date.now()}`,
          status: 'ready',
          workspaceId: projectResponse.project.workspaceId,
        },
      },
    )
    const setupMs = performance.now() - setupStartedAt

    const startStartedAt = performance.now()
    const startResponse = await apiRequest<StartIssueResponse>(
      api.baseUrl,
      `/api/issues/${readyIssueResponse.issue.id}/start`,
      {
        method: 'POST',
        body: {
          endpointId: endpoint.id,
          model: process.env.PATCHLANE_PERF_MODEL || undefined,
        },
      },
    )
    const startMs = performance.now() - startStartedAt

    if (!startResponse.run) {
      throw new Error('Issue start did not create a coding run')
    }

    const continueStartedAt = performance.now()
    const continueResponse = await apiRequest<RunResponse>(
      api.baseUrl,
      `/api/agent/runs/${startResponse.run.id}/continue`,
      {
        method: 'POST',
        body: {
          endpointId: endpoint.id,
          model: process.env.PATCHLANE_PERF_MODEL || undefined,
        },
      },
    )
    const continueMs = performance.now() - continueStartedAt

    const [issuesResponse, workspacesResponse] = await Promise.all([
      apiRequest<IssuesResponse>(api.baseUrl, '/api/issues'),
      apiRequest<WorkspacesResponse>(api.baseUrl, '/api/sandbox/workspaces'),
    ])
    const completedIssue = issuesResponse.issues.find(
      (issue) => issue.id === issueResponse.issue.id,
    )
    const taskWorkspace = workspacesResponse.workspaces.find(
      (workspace) => workspace.id === continueResponse.run.workspaceId,
    )

    if (!taskWorkspace) {
      throw new Error('Task workspace was not found after run completion')
    }

    const readme = await readFile(
      path.join(taskWorkspace.path, 'README.md'),
      'utf8',
    )
    const readmeUpdated = readme.includes(expectedMarker)
    const usage = summarizeUsage(continueResponse.run.messages)
    const runStatus = continueResponse.run.status
    const issueStatus = completedIssue?.status
    const ok =
      readmeUpdated &&
      runStatus === 'completed' &&
      (issueStatus === 'completed' || issueStatus === 'review')
    const summary: PerfSummary = {
      apiBaseUrl: api.baseUrl,
      endpoint: {
        id: endpoint.id,
        model: process.env.PATCHLANE_PERF_MODEL || endpoint.defaultModel,
        name: endpoint.name,
      },
      issue: {
        id: issueResponse.issue.id,
        status: issueStatus,
      },
      result: {
        ok,
        readmeUpdated,
        runStatus,
      },
      run: {
        id: continueResponse.run.id,
        resultSummary: continueResponse.run.resultSummary,
        toolNames: continueResponse.run.messages
          .filter((message) => message.role === 'tool')
          .map((message) => message.toolName || 'unknown'),
      },
      timingsMs: {
        continue: Math.round(continueMs),
        setup: Math.round(setupMs),
        start: Math.round(startMs),
        total: Math.round(performance.now() - totalStartedAt),
      },
      usage,
    }

    printSummary(summary)

    if (!ok) {
      process.exitCode = 1
    }
  } finally {
    if (apiProcess) {
      await stopProcess(apiProcess)
    }

    if (keepArtifacts) {
      console.log(`Artifacts kept at ${tempDir}`)
    } else {
      await rm(tempDir, { force: true, recursive: true })
    }
  }
}

const createApiTarget = async (tempDir: string) => {
  const existingApiBaseUrl = (
    process.env.PATCHLANE_PERF_API_BASE_URL || 'http://localhost:8787'
  ).replace(/\/+$/, '')

  if (process.env.PATCHLANE_PERF_START_API !== 'true') {
    await waitForExternalApi(existingApiBaseUrl)

    return {
      baseUrl: existingApiBaseUrl,
      process: undefined,
    }
  }

  const llmBaseUrl = process.env.PATCHLANE_PERF_LLM_BASE_URL
  const llmModel = process.env.PATCHLANE_PERF_MODEL

  if (!llmBaseUrl || !llmModel) {
    throw new Error(
      'PATCHLANE_PERF_START_API=true requires PATCHLANE_PERF_LLM_BASE_URL and PATCHLANE_PERF_MODEL',
    )
  }

  const apiPort = await getFreePort()
  const baseUrl = `http://127.0.0.1:${apiPort}`
  const apiProcess = spawn('pnpm', ['--filter', '@patchlane/api', 'start'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATABASE_FILE: path.join(tempDir, 'patchlane.sqlite'),
      DEFAULT_LLM_BASE_URL: llmBaseUrl,
      DEFAULT_LLM_ENDPOINT_NAME: 'Perf LLM',
      DEFAULT_LLM_MODEL: llmModel,
      LLM_ENDPOINTS_FILE: path.join(tempDir, 'llm-endpoints.json'),
      PORT: String(apiPort),
      SANDBOX_DEFAULT_TIMEOUT_MS: '120000',
      SANDBOX_ROOT_DIR: path.join(tempDir, 'sandboxes'),
      SANDBOX_WORKSPACES_FILE: path.join(tempDir, 'sandbox-workspaces.json'),
      TOOL_SETTINGS_FILE: path.join(tempDir, 'tool-settings.json'),
      TSX_TSCONFIG_PATH: path.join(repoRoot, 'apps/api/tsconfig.json'),
      WEB_ORIGIN: '*',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const getOutput = collectProcessOutput(apiProcess)

  await waitForSpawnedApi(baseUrl, apiProcess, getOutput)

  return {
    baseUrl,
    process: apiProcess,
  }
}

const selectEndpoint = async (apiBaseUrl: string) => {
  const endpointsResponse = await apiRequest<{ endpoints: Endpoint[] }>(
    apiBaseUrl,
    '/api/llm/endpoints',
  )
  const requestedId = process.env.PATCHLANE_PERF_ENDPOINT_ID
  const endpoint = requestedId
    ? endpointsResponse.endpoints.find((item) => item.id === requestedId)
    : endpointsResponse.endpoints.find((item) => item.enabled)

  if (!endpoint) {
    throw new Error(
      requestedId
        ? `LLM endpoint '${requestedId}' was not found`
        : 'No enabled LLM endpoint was found',
    )
  }

  if (!endpoint.enabled) {
    throw new Error(`LLM endpoint '${endpoint.id}' is disabled`)
  }

  return endpoint
}

const summarizeUsage = (messages: AgentRunMessageSnapshot[]) => {
  const requestKeys = new Set<string>()
  const usage = {
    cachedInputTokens: 0,
    providerInputTokens: 0,
    providerOutputTokens: 0,
    providerRequests: 0,
    providerTotalTokens: 0,
    reasoningBlocks: 0,
    reasoningTokens: 0,
    toolInputTokens: 0,
    toolOutputTokens: 0,
    toolUses: 0,
  }

  for (const message of messages) {
    const metadata = message.metadata

    if (!metadata) {
      continue
    }

    if (metadata.usage && metadata.request) {
      const key = [
        metadata.request.model,
        metadata.request.attempt,
        metadata.request.iteration,
      ].join(':')

      if (!requestKeys.has(key)) {
        requestKeys.add(key)
        usage.providerRequests += 1
        usage.providerInputTokens += metadata.usage.inputTokens ?? 0
        usage.providerOutputTokens += metadata.usage.outputTokens ?? 0
        usage.providerTotalTokens += metadata.usage.totalTokens ?? 0
        usage.cachedInputTokens += metadata.usage.cachedInputTokens ?? 0
        usage.reasoningTokens += metadata.usage.reasoningTokens ?? 0
      }
    }

    if (metadata.reasoning?.estimatedTokens) {
      usage.reasoningBlocks += 1
      usage.reasoningTokens += metadata.reasoning.estimatedTokens
    }

    if (message.role === 'tool') {
      usage.toolUses += 1
      usage.toolInputTokens += metadata.tool?.input?.estimatedTokens ?? 0
      usage.toolOutputTokens += metadata.tool?.output?.estimatedTokens ?? 0
    }
  }

  return usage
}

const printSummary = (summary: PerfSummary) => {
  console.log('\nPatchlane live E2E performance result')
  console.log(`- ok: ${summary.result.ok}`)
  console.log(`- api: ${summary.apiBaseUrl}`)
  console.log(
    `- endpoint: ${summary.endpoint.name} (${summary.endpoint.id}) / ${summary.endpoint.model}`,
  )
  console.log(
    `- run: ${summary.run.id} status=${summary.result.runStatus} issue=${summary.issue.status}`,
  )
  console.log(`- readme updated: ${summary.result.readmeUpdated}`)
  console.log(`- tools: ${summary.run.toolNames.join(' -> ') || 'none'}`)
  console.log(
    `- timings: setup=${summary.timingsMs.setup}ms start=${summary.timingsMs.start}ms continue=${summary.timingsMs.continue}ms total=${summary.timingsMs.total}ms`,
  )
  console.log(
    `- provider: ${summary.usage.providerRequests} req, ${summary.usage.providerInputTokens} in / ${summary.usage.providerOutputTokens} out / ${summary.usage.providerTotalTokens} total tok`,
  )
  console.log(
    `- tool I/O estimate: ${summary.usage.toolInputTokens} in / ${summary.usage.toolOutputTokens} out tok`,
  )

  if (summary.run.resultSummary) {
    console.log(`- result: ${summary.run.resultSummary}`)
  }

  console.log(`\n${JSON.stringify(summary, null, 2)}`)
}

const createFixtureRepository = async (tempDir: string) => {
  const repoPath = path.join(tempDir, 'fixture-repo')

  await mkdir(repoPath)
  await runCommand('git', ['init', '--initial-branch=main'], repoPath)
  await runCommand(
    'git',
    ['config', 'user.email', 'perf@patchlane.local'],
    repoPath,
  )
  await runCommand('git', ['config', 'user.name', 'Patchlane Perf'], repoPath)
  await writeFile(
    path.join(repoPath, 'README.md'),
    ['# Live Model Perf Fixture', '', 'Status: pending.', ''].join('\n'),
    'utf8',
  )
  await runCommand('git', ['add', 'README.md'], repoPath)
  await runCommand('git', ['commit', '-m', 'Initial fixture'], repoPath)

  return repoPath
}

const apiRequest = async <ResponseBody>(
  baseUrl: string,
  urlPath: string,
  options: {
    body?: Record<string, unknown>
    method?: string
  } = {},
): Promise<ResponseBody> => {
  const response = await fetch(`${baseUrl}${urlPath}`, {
    body: options.body
      ? JSON.stringify(removeUndefined(options.body))
      : undefined,
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    method: options.method ?? 'GET',
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

const waitForExternalApi = async (baseUrl: string) => {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(2_000),
    })

    if (!response.ok) {
      throw new Error(`Health check failed with ${response.status}`)
    }
  } catch (error) {
    throw new Error(
      `Patchlane API is not reachable at ${baseUrl}. Start the dev API or set PATCHLANE_PERF_API_BASE_URL. ${getErrorMessage(error)}`,
      {
        cause: error,
      },
    )
  }
}

const waitForSpawnedApi = async (
  baseUrl: string,
  process: ReturnType<typeof spawn>,
  getOutput: () => string,
) => {
  const startedAt = Date.now()

  while (Date.now() - startedAt < 30_000) {
    if (process.exitCode !== null) {
      throw new Error(`API exited before ready.\n${getOutput()}`)
    }

    try {
      const response = await fetch(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(500),
      })

      if (response.ok) {
        return
      }
    } catch {
      await delay(200)
    }
  }

  throw new Error(`Timed out waiting for API.\n${getOutput()}`)
}

const collectProcessOutput = (process: ReturnType<typeof spawn>) => {
  let output = ''

  process.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8')
  })
  process.stderr?.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8')
  })

  return () => output
}

const stopProcess = async (process: ReturnType<typeof spawn>) => {
  if (process.exitCode !== null) {
    return
  }

  process.kill('SIGTERM')

  const timeout = setTimeout(() => {
    process.kill('SIGKILL')
  }, 5_000)

  await once(process, 'exit').catch(() => undefined)
  clearTimeout(timeout)
}

const runCommand = async (
  command: string,
  args: string[],
  cwd: string,
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    execFile(command, args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(
            `${command} ${args.join(' ')} failed\n${stdout}\n${stderr}`,
          ),
        )
        return
      }

      resolve()
    })
  })
}

const getFreePort = async () => {
  const server = net.createServer()

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = (server.address() as AddressInfo).port

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })

  return port
}

const delay = (durationMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs)
  })

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
