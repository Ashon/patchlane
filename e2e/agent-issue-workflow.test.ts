import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const model = 'patchlane-e2e-model'

describe('agent issue workflow e2e', () => {
  it(
    'creates a project, registers an issue, and completes the coding task',
    { timeout: 120_000 },
    async () => {
      const tempDir = await mkdtemp(path.join(os.tmpdir(), 'patchlane-e2e-'))
      const mockLlm = await startMockLlmServer()
      let apiProcess: ReturnType<typeof spawn> | undefined

      try {
        const fixtureRepo = await createFixtureRepository(tempDir)
        const apiPort = await getFreePort()
        const apiBaseUrl = `http://127.0.0.1:${apiPort}`
        apiProcess = spawn('pnpm', ['--filter', '@patchlane/api', 'start'], {
          cwd: repoRoot,
          env: {
            ...process.env,
            AGENT_CONTEXT_TOKEN_BUDGET: '12000',
            AGENT_DURABILITY_MAX_RETRIES: '0',
            AGENT_OUTPUT_TOKEN_BUDGET: '2048',
            DATABASE_FILE: path.join(tempDir, 'patchlane.sqlite'),
            DEFAULT_LLM_BASE_URL: `${mockLlm.baseUrl}/v1`,
            DEFAULT_LLM_ENDPOINT_NAME: 'E2E Mock LLM',
            DEFAULT_LLM_MODEL: model,
            LLM_ENDPOINTS_FILE: path.join(tempDir, 'llm-endpoints.json'),
            PORT: String(apiPort),
            SANDBOX_DEFAULT_TIMEOUT_MS: '30000',
            SANDBOX_ROOT_DIR: path.join(tempDir, 'sandboxes'),
            SANDBOX_WORKSPACES_FILE: path.join(
              tempDir,
              'sandbox-workspaces.json',
            ),
            TOOL_SETTINGS_FILE: path.join(tempDir, 'tool-settings.json'),
            TSX_TSCONFIG_PATH: path.join(repoRoot, 'apps/api/tsconfig.json'),
            WEB_ORIGIN: '*',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        const getApiOutput = collectProcessOutput(apiProcess)

        await waitForApi(apiBaseUrl, apiProcess, getApiOutput)

        const projectResponse = await apiRequest<ProjectResponse>(
          apiBaseUrl,
          '/api/issues/projects',
          {
            method: 'POST',
            body: {
              branchPrefix: 'e2e',
              defaultEndpointId: 'local-default',
              description:
                'A small fixture project used by the E2E agent workflow.',
              name: 'Patchlane E2E Fixture',
              repositoryRef: 'main',
              repositoryUrl: pathToFileURL(fixtureRepo).href,
            },
          },
        )
        assert.equal(projectResponse.project.name, 'Patchlane E2E Fixture')
        assert.ok(projectResponse.project.workspaceId)

        const issueResponse = await apiRequest<IssueResponse>(
          apiBaseUrl,
          '/api/issues',
          {
            method: 'POST',
            body: {
              description:
                'Update README.md so the project says the E2E task is complete, then verify the file content.',
              endpointId: 'local-default',
              priority: 'medium',
              projectId: projectResponse.project.id,
              title: 'Update README status',
            },
          },
        )
        assert.equal(issueResponse.issue.status, 'backlog')

        const readyIssueResponse = await apiRequest<IssueResponse>(
          apiBaseUrl,
          `/api/issues/${issueResponse.issue.id}`,
          {
            method: 'PATCH',
            body: {
              analysis:
                'The task is ready. Update README.md and verify the expected text exists.',
              endpointId: 'local-default',
              planningRunId: 'e2e-planning-run',
              requirementRunId: 'e2e-requirements-run',
              status: 'ready',
              workspaceId: projectResponse.project.workspaceId,
            },
          },
        )
        assert.equal(readyIssueResponse.issue.status, 'ready')

        const startResponse = await apiRequest<StartIssueResponse>(
          apiBaseUrl,
          `/api/issues/${issueResponse.issue.id}/start`,
          {
            method: 'POST',
            body: {
              endpointId: 'local-default',
            },
          },
        )
        assert.ok(startResponse.run)
        assert.equal(startResponse.issue.status, 'running')
        assert.equal(startResponse.run.kind, 'coding')
        assert.equal(startResponse.run.issueId, issueResponse.issue.id)
        assert.equal(startResponse.run.status, 'idle')

        const continueResponse = await apiRequest<RunResponse>(
          apiBaseUrl,
          `/api/agent/runs/${startResponse.run.id}/continue`,
          {
            method: 'POST',
            body: {
              endpointId: 'local-default',
            },
          },
        )
        assert.equal(continueResponse.run.status, 'completed')
        assert.match(
          continueResponse.run.resultSummary ?? '',
          /README\.md was updated/u,
        )

        const toolNames = continueResponse.run.messages
          .filter((message) => message.role === 'tool')
          .map((message) => message.toolName)
        assert.deepEqual(toolNames, ['write_file', 'run_command', 'finish'])
        assert.ok(
          continueResponse.run.messages.some(
            (message) => message.metadata?.usage?.totalTokens,
          ),
        )

        const issuesResponse = await apiRequest<IssuesResponse>(
          apiBaseUrl,
          '/api/issues',
        )
        const completedIssue = issuesResponse.issues.find(
          (issue) => issue.id === issueResponse.issue.id,
        )
        assert.equal(completedIssue?.status, 'completed')
        assert.equal(completedIssue?.agentRunId, continueResponse.run.id)
        assert.equal(
          completedIssue?.workspaceId,
          continueResponse.run.workspaceId,
        )

        const workspacesResponse = await apiRequest<WorkspacesResponse>(
          apiBaseUrl,
          '/api/sandbox/workspaces',
        )
        const taskWorkspace = workspacesResponse.workspaces.find(
          (workspace) => workspace.id === continueResponse.run.workspaceId,
        )
        assert.ok(taskWorkspace)
        const readme = await readFile(
          path.join(taskWorkspace.path, 'README.md'),
          'utf8',
        )
        assert.match(readme, /Status: completed by Patchlane agent/u)
        assert.equal(mockLlm.agentToolCallCount(), 3)
      } finally {
        if (apiProcess) {
          await stopProcess(apiProcess)
        }

        await mockLlm.close()
        await rm(tempDir, { force: true, recursive: true })
      }
    },
  )
})

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
  messages: Array<{
    metadata?: {
      usage?: {
        totalTokens?: number
      }
    }
    role: string
    toolName?: string
  }>
  resultSummary?: string
  status: string
  workspaceId: string
}

type MockLlmServer = {
  agentToolCallCount: () => number
  baseUrl: string
  close: () => Promise<void>
}

const startMockLlmServer = async (): Promise<MockLlmServer> => {
  let agentToolCallCount = 0
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/v1/models') {
        sendJson(response, 200, {
          data: [{ id: model, object: 'model' }],
          object: 'list',
        })
        return
      }

      if (request.method === 'POST' && request.url === '/v1/chat/completions') {
        const body = await readJsonBody(request)
        const hasTools = Array.isArray(body.tools)

        if (!hasTools) {
          sendJson(response, 200, completionResponse('Update README status'))
          return
        }

        agentToolCallCount += 1

        if (agentToolCallCount === 1) {
          sendJson(
            response,
            200,
            completionResponse(
              '<think>Update the README with the requested status.</think>Editing README.md.',
              [
                toolCall('call_write_readme', 'write_file', {
                  content: [
                    '# E2E Fixture',
                    '',
                    'Status: completed by Patchlane agent.',
                    '',
                  ].join('\n'),
                  path: 'README.md',
                }),
              ],
            ),
          )
          return
        }

        if (agentToolCallCount === 2) {
          sendJson(
            response,
            200,
            completionResponse('Verifying the README update.', [
              toolCall('call_verify_readme', 'run_command', {
                args: [
                  '-e',
                  [
                    "const fs = require('node:fs')",
                    "const text = fs.readFileSync('README.md', 'utf8')",
                    "if (!text.includes('completed by Patchlane agent')) process.exit(1)",
                  ].join('; '),
                ],
                command: 'node',
              }),
            ]),
          )
          return
        }

        sendJson(
          response,
          200,
          completionResponse('Finishing the issue.', [
            toolCall('call_finish_issue', 'finish', {
              summary:
                'README.md was updated and verified with a node content check.',
            }),
          ]),
        )
      } else {
        sendJson(response, 404, { error: 'Not found' })
      }
    } catch (error) {
      sendJson(response, 500, { error: getErrorMessage(error) })
    }
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo

  return {
    agentToolCallCount: () => agentToolCallCount,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        })
      }),
  }
}

const completionResponse = (content: string, toolCalls?: ToolCall[]) => ({
  choices: [
    {
      finish_reason: toolCalls?.length ? 'tool_calls' : 'stop',
      index: 0,
      message: {
        content,
        role: 'assistant',
        tool_calls: toolCalls,
      },
    },
  ],
  created: Math.floor(Date.now() / 1000),
  id: `chatcmpl-${Math.random().toString(36).slice(2)}`,
  model,
  object: 'chat.completion',
  usage: {
    completion_tokens: 37,
    completion_tokens_details: {
      reasoning_tokens: 5,
    },
    prompt_tokens: 211,
    prompt_tokens_details: {
      cached_tokens: 0,
    },
    total_tokens: 248,
  },
})

type ToolCall = {
  function: {
    arguments: string
    name: string
  }
  id: string
  type: 'function'
}

const toolCall = (
  id: string,
  name: string,
  args: Record<string, unknown>,
): ToolCall => ({
  function: {
    arguments: JSON.stringify(args),
    name,
  },
  id,
  type: 'function',
})

const createFixtureRepository = async (tempDir: string) => {
  const repoPath = path.join(tempDir, 'fixture-repo')

  await mkdir(repoPath)
  await runCommand('git', ['init', '--initial-branch=main'], repoPath)
  await runCommand(
    'git',
    ['config', 'user.email', 'e2e@patchlane.local'],
    repoPath,
  )
  await runCommand('git', ['config', 'user.name', 'Patchlane E2E'], repoPath)
  await writeFile(
    path.join(repoPath, 'README.md'),
    ['# E2E Fixture', '', 'Status: pending.', ''].join('\n'),
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
    body: options.body ? JSON.stringify(options.body) : undefined,
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

const waitForApi = async (
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

const readJsonBody = async (
  request: http.IncomingMessage,
): Promise<Record<string, unknown>> => {
  let raw = ''

  for await (const chunk of request) {
    raw += chunk.toString()
  }

  return JSON.parse(raw) as Record<string, unknown>
}

const sendJson = (
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown,
) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
  })
  response.end(JSON.stringify(payload))
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
