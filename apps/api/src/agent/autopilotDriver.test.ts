import { describe, expect, it } from '@jest/globals'
import type { AgentRun, Issue } from '@patchlane/shared'
import type { IssueStore } from '../issues/issueStore'
import { AutopilotDriver } from './autopilotDriver'

type FetchCall = { url: string; method: string }

const flush = async () => {
  for (let index = 0; index < 5; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

const baseIssue = (overrides: Partial<Issue> = {}): Issue =>
  ({
    id: 'issue-1',
    number: 1,
    title: 'Demo',
    description: 'Demo issue',
    projectId: 'project-1',
    status: 'backlog',
    priority: 'medium',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    events: [],
    comments: [],
    subtasks: [],
    ...overrides,
  }) as Issue

const run = (overrides: Partial<AgentRun> = {}): AgentRun =>
  ({
    id: 'run-1',
    workspaceId: 'ws-1',
    agentRuntime: 'patchlane',
    title: 'Run',
    kind: 'coding',
    issueId: 'issue-1',
    status: 'completed',
    messages: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  }) as AgentRun

type Harness = {
  driver: AutopilotDriver
  calls: FetchCall[]
  comments: Array<{ kind?: string; body: string }>
}

const makeHarness = (options: {
  autopilot: boolean
  issue: Issue
  continueResponse?: { status?: number; body: unknown }
}): Harness => {
  const calls: FetchCall[] = []
  const comments: Array<{ kind?: string; body: string }> = []

  const fetchImpl = (async (input: string, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' })

    if (String(input).includes('/workflow/continue')) {
      const { status = 200, body = {} } = options.continueResponse ?? {}
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ run: run({ status: 'completed' }) }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  const issueStore = {
    getIssue: async () => options.issue,
    getProject: async () => ({ autopilot: options.autopilot }),
    addIssueComment: async (
      _issueId: string,
      input: { kind?: string; body: string },
    ) => {
      comments.push({ kind: input.kind, body: input.body })
      return { comment: input, issue: options.issue }
    },
  } as unknown as IssueStore

  const driver = new AutopilotDriver({
    issueStore,
    baseUrl: 'http://127.0.0.1:9999',
    fetchImpl,
  })

  return { driver, calls, comments }
}

describe('Given the autopilot driver', () => {
  it('when the project is not on autopilot, then nothing is triggered', async () => {
    const harness = makeHarness({ autopilot: false, issue: baseIssue() })
    harness.driver.handleIssueCreated(baseIssue())
    await flush()
    expect(harness.calls).toHaveLength(0)
  })

  it('when an autopilot issue starts and a task run is created, then it advances and executes the run', async () => {
    const harness = makeHarness({
      autopilot: true,
      issue: baseIssue(),
      continueResponse: {
        status: 201,
        body: { run: { id: 'run-1', status: 'idle' } },
      },
    })
    harness.driver.handleIssueCreated(baseIssue())
    await flush()

    const urls = harness.calls.map((call) => call.url)
    expect(
      urls.some((url) => url.endsWith('/api/issues/issue-1/workflow/continue')),
    ).toBe(true)
    expect(
      urls.some((url) => url.endsWith('/api/agent/runs/run-1/continue')),
    ).toBe(true)
  })

  it('when the workflow has nothing to start, then it advances but does not execute a run', async () => {
    const harness = makeHarness({
      autopilot: true,
      issue: baseIssue(),
      continueResponse: { status: 200, body: { runs: [] } },
    })
    harness.driver.handleIssueCreated(baseIssue())
    await flush()

    const urls = harness.calls.map((call) => call.url)
    expect(urls.some((url) => url.includes('/workflow/continue'))).toBe(true)
    expect(urls.some((url) => url.includes('/agent/runs/'))).toBe(false)
  })

  it('when a run finishes failed, then autopilot pauses with a comment and does not advance', async () => {
    const harness = makeHarness({
      autopilot: true,
      issue: baseIssue({ status: 'failed' }),
    })
    harness.driver.handleRunFinished(run({ status: 'failed' }))
    await flush()

    expect(
      harness.calls.some((call) => call.url.includes('/workflow/continue')),
    ).toBe(false)
    expect(
      harness.comments.some((comment) => /paused/i.test(comment.body)),
    ).toBe(true)
  })

  it('when a run finishes awaiting the user, then autopilot pauses and does not advance', async () => {
    const harness = makeHarness({
      autopilot: true,
      issue: baseIssue({ status: 'awaiting_user' }),
    })
    harness.driver.handleRunFinished(run({ status: 'awaiting_user' }))
    await flush()

    expect(
      harness.calls.some((call) => call.url.includes('/workflow/continue')),
    ).toBe(false)
    expect(
      harness.comments.some((comment) => /awaiting/i.test(comment.body)),
    ).toBe(true)
  })

  it('when the workflow is already complete, then autopilot stops without advancing', async () => {
    const completedIssue = baseIssue({
      status: 'completed',
      subtasks: [
        { id: 't1', status: 'completed' } as Issue['subtasks'][number],
        { id: 't2', status: 'skipped' } as Issue['subtasks'][number],
      ],
    })
    const harness = makeHarness({ autopilot: true, issue: completedIssue })
    harness.driver.handleRunFinished(run({ status: 'completed' }))
    await flush()

    expect(harness.calls).toHaveLength(0)
  })
})
