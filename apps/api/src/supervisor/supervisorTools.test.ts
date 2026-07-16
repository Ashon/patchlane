import { afterEach, describe, expect, it } from '@jest/globals'
import {
  supervisorToolDefinitions,
  supervisorToolMap,
  type SupervisorToolContext,
} from './supervisorTools'

type FetchCall = { url: string; method: string; body: unknown }

const context: SupervisorToolContext = { baseUrl: 'http://127.0.0.1:9999' }

const originalFetch = globalThis.fetch
let calls: FetchCall[] = []

const stubFetch = (
  handler: (call: FetchCall) => { status?: number; body: unknown },
) => {
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const call: FetchCall = {
      url: String(input),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
    }
    calls.push(call)
    const { status = 200, body } = handler(call)
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
}

const run = (name: string, args: Record<string, unknown>) => {
  const tool = supervisorToolMap.get(name)
  if (!tool) {
    throw new Error(`missing tool ${name}`)
  }
  return tool.execute(args, context)
}

afterEach(() => {
  globalThis.fetch = originalFetch
  calls = []
})

describe('Given supervisor orchestration tools', () => {
  it('when tool definitions are inspected, then all are unique function tools without a delete tool', () => {
    const names = supervisorToolDefinitions.map((tool) => tool.function.name)

    expect(
      supervisorToolDefinitions.every((tool) => tool.type === 'function'),
    ).toBe(true)
    expect(new Set(names).size).toBe(names.length)
    expect(names.some((name) => name.includes('delete'))).toBe(false)
    expect(supervisorToolMap.size).toBe(supervisorToolDefinitions.length)
  })

  it('when create_project runs, then it posts a trimmed body and returns a trimmed project', async () => {
    stubFetch(() => ({
      status: 201,
      body: {
        project: {
          id: 'p1',
          code: 'PLN',
          name: 'Patchlane',
          description: 'x'.repeat(1000),
          branchPrefix: 'agent',
          secret: 'should-not-leak',
        },
      },
    }))

    const result = (await run('create_project', {
      name: 'Patchlane',
      description: 'Coordinate work',
    })) as { project: Record<string, unknown> }

    expect(calls[0]).toMatchObject({
      url: 'http://127.0.0.1:9999/api/issues/projects',
      method: 'POST',
      body: { name: 'Patchlane', description: 'Coordinate work' },
    })
    expect(result.project.id).toBe('p1')
    expect(result.project).not.toHaveProperty('secret')
    expect(String(result.project.description).endsWith('…')).toBe(true)
  })

  it('when list_issues runs with a status filter, then it filters the fetched issues', async () => {
    stubFetch(() => ({
      body: {
        issues: [
          { id: 'i1', number: 1, title: 'A', status: 'ready', projectId: 'p1' },
          {
            id: 'i2',
            number: 2,
            title: 'B',
            status: 'backlog',
            projectId: 'p1',
          },
          {
            id: 'i3',
            number: 3,
            title: 'C',
            status: 'ready',
            projectId: 'p2',
          },
        ],
      },
    }))

    const result = (await run('list_issues', {
      projectId: 'p1',
      status: 'ready',
    })) as { issues: Array<{ id: string }> }

    expect(calls[0]?.url).toBe('http://127.0.0.1:9999/api/issues')
    expect(result.issues.map((issue) => issue.id)).toEqual(['i1'])
  })

  it('when get_issue targets a missing issue, then it throws not found', async () => {
    stubFetch(() => ({ body: { issues: [{ id: 'i1' }] } }))

    await expect(run('get_issue', { issueId: 'nope' })).rejects.toThrow(
      /was not found/,
    )
  })

  it('when the API responds with an error, then the tool surfaces the message', async () => {
    stubFetch(() => ({ status: 400, body: { error: 'Validation failed' } }))

    await expect(
      run('create_issue', {
        projectId: 'p1',
        title: 'T',
        description: 'D',
      }),
    ).rejects.toThrow('Validation failed')
  })

  it('when start_issue runs, then it calls the workflow continue endpoint', async () => {
    stubFetch(() => ({
      status: 201,
      body: {
        issue: { id: 'i1', number: 1, title: 'A', status: 'running' },
        run: { id: 'r1', status: 'running', title: 'A', branchName: 'agent/a' },
      },
    }))

    const result = (await run('start_issue', { issueId: 'i1' })) as {
      run: { id: string } | null
    }

    expect(calls[0]).toMatchObject({
      url: 'http://127.0.0.1:9999/api/issues/i1/workflow/continue',
      method: 'POST',
    })
    expect(result.run?.id).toBe('r1')
  })
})
