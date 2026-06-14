import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { AgentRunStore } from '../agent/agentRunStore'
import { AppDatabase } from '../db/database'
import { HttpError } from '../http/errors'
import { createExecutionsRouter } from './executions'

describe('Given executions routes', () => {
  it('lists executions filtered by issue and task', async () => {
    const database = new AppDatabase(':memory:')
    const store = new AgentRunStore(database)
    const server = await startExecutionsServer(store)

    try {
      const first = await store.create({
        workspaceId: 'workspace-1',
        agentRuntime: 'codex',
        projectId: 'project-1',
        issueId: 'issue-1',
        subtaskId: 'task-1',
        title: 'First task attempt',
        task: 'Run the first task.',
      })
      const second = await store.create({
        workspaceId: 'workspace-1',
        agentRuntime: 'codex',
        projectId: 'project-1',
        issueId: 'issue-1',
        subtaskId: 'task-1',
        title: 'Second task attempt',
        task: 'Retry the first task.',
      })
      await store.create({
        workspaceId: 'workspace-1',
        agentRuntime: 'codex',
        projectId: 'project-1',
        issueId: 'issue-1',
        subtaskId: 'task-2',
        title: 'Other task',
        task: 'Run another task.',
      })

      const response = await fetch(
        `${server.baseUrl}/api/executions?projectId=project-1&issueId=issue-1&taskId=task-1`,
      )
      const body = (await response.json()) as {
        executions: Array<{ attempt: number; id: string; subtaskId?: string }>
      }

      expect(response.status).toBe(200)
      expect(body.executions.map((execution) => execution.id).sort()).toEqual(
        [first.id, second.id].sort(),
      )
      expect(
        body.executions.map((execution) => execution.attempt).sort(),
      ).toEqual([1, 2])
      expect(
        body.executions.every((execution) => execution.subtaskId === 'task-1'),
      ).toBe(true)
    } finally {
      await server.close()
      database.sqlite.close()
    }
  })

  it('returns a single execution and its event history', async () => {
    const database = new AppDatabase(':memory:')
    const store = new AgentRunStore(database)
    const server = await startExecutionsServer(store)

    try {
      const run = await store.create({
        workspaceId: 'workspace-1',
        agentRuntime: 'codex',
        title: 'Execution detail',
        task: 'Capture execution events.',
      })
      await store.appendEvent(run.id, {
        source: 'codex_jsonl',
        eventType: 'item.started',
        itemType: 'command_execution',
        itemId: 'item-1',
        payload: { type: 'item.started' },
      })

      const executionResponse = await fetch(
        `${server.baseUrl}/api/executions/${run.id}`,
      )
      const eventResponse = await fetch(
        `${server.baseUrl}/api/executions/${run.id}/events`,
      )
      const executionBody = (await executionResponse.json()) as {
        execution: { id: string }
      }
      const eventBody = (await eventResponse.json()) as {
        events: Array<{
          eventType?: string
          itemId?: string
          sequence: number
          source: string
        }>
      }

      expect(executionResponse.status).toBe(200)
      expect(eventResponse.status).toBe(200)
      expect(executionBody.execution.id).toBe(run.id)
      expect(eventBody.events).toMatchObject([
        {
          eventType: 'item.started',
          itemId: 'item-1',
          sequence: 0,
          source: 'codex_jsonl',
        },
      ])
    } finally {
      await server.close()
      database.sqlite.close()
    }
  })
})

const startExecutionsServer = async (store: AgentRunStore) => {
  const app = express()

  app.use('/api/executions', createExecutionsRouter({ runStore: store }))
  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof HttpError) {
        response.status(error.status).json({ error: error.message })
        return
      }

      response.status(500).json({ error: 'Internal server error' })
    },
  )

  const server = await new Promise<Server>((resolve) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => {
      resolve(listeningServer)
    })
  })
  const address = server.address() as AddressInfo

  return {
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
