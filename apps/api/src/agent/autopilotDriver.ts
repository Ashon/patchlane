import type { AgentRun, Issue } from '@patchlane/shared'
import type { IssueStore } from '../issues/issueStore'

/**
 * Server-side autopilot for projects that opt in.
 *
 * When an issue is created in an autopilot project (or a task run finishes), the
 * driver advances the issue workflow autonomously: it calls the app's own HTTP
 * API to plan the issue and start the next pending task, then executes that run
 * in the background. When the run finishes, agentRuntime's onRunFinished hook
 * calls back here and the next task is started — a self-sustaining chain that
 * needs no browser open.
 *
 * It deliberately reuses the existing HTTP endpoints (same pattern as the
 * supervisor tools) rather than duplicating the workflow logic, and it stops on
 * completion, awaiting_user, failure, or blocked so it never runs past a point
 * that needs a human.
 */

type AutopilotDriverDeps = {
  issueStore: IssueStore
  /** Internal API origin the driver calls back into, e.g. http://127.0.0.1:8787 */
  baseUrl: string
  fetchImpl?: typeof fetch
  maxStepsPerIssue?: number
  log?: (message: string) => void
}

type WorkflowContinueResponse = {
  run?: Pick<AgentRun, 'id' | 'status'> | null
}

const PAUSED_ISSUE_STATUSES = new Set<Issue['status']>([
  'awaiting_user',
  'failed',
  'blocked',
])
const PAUSED_TASK_STATUSES = new Set(['awaiting_user', 'failed'])

const getMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown autopilot error'

export class AutopilotDriver {
  private readonly advancing = new Set<string>()
  private readonly steps = new Map<string, number>()
  private readonly maxSteps: number

  constructor(private readonly deps: AutopilotDriverDeps) {
    this.maxSteps = deps.maxStepsPerIssue ?? 100
  }

  /** Called after an issue is created; kicks off autopilot when the project opts in. */
  handleIssueCreated(issue: Issue): void {
    void this.maybeAdvance(issue.id)
  }

  /** Called from agentRuntime.onRunFinished; chains to the next task when appropriate. */
  handleRunFinished(run: AgentRun): void {
    if (!run.issueId) {
      return
    }

    void this.maybeAdvance(run.issueId, run)
  }

  private async maybeAdvance(
    issueId: string,
    finishedRun?: AgentRun,
  ): Promise<void> {
    try {
      const issue = await this.deps.issueStore
        .getIssue(issueId)
        .catch(() => null)

      if (!issue) {
        return
      }

      const project = await this.deps.issueStore
        .getProject(issue.projectId)
        .catch(() => null)

      if (!project?.autopilot) {
        return
      }

      if (finishedRun?.status === 'failed') {
        await this.pause(
          issueId,
          'Autopilot paused: the last task run failed. Review the run and resume manually.',
        )
        this.steps.delete(issueId)
        return
      }

      if (finishedRun?.status === 'awaiting_user') {
        await this.pause(
          issueId,
          'Autopilot paused: the agent is awaiting your input on this task.',
        )
        this.steps.delete(issueId)
        return
      }

      if (PAUSED_ISSUE_STATUSES.has(issue.status)) {
        this.steps.delete(issueId)
        return
      }

      if (
        issue.subtasks.some((task) => PAUSED_TASK_STATUSES.has(task.status))
      ) {
        this.steps.delete(issueId)
        return
      }

      const workflowComplete =
        issue.subtasks.length > 0 &&
        issue.subtasks.every(
          (task) => task.status === 'completed' || task.status === 'skipped',
        )

      if (workflowComplete) {
        // Stop before review; a human finalizes / opens the PR.
        this.steps.delete(issueId)
        return
      }

      await this.advance(issueId)
    } catch (error) {
      this.deps.log?.(
        `autopilot advance failed for ${issueId}: ${getMessage(error)}`,
      )
    }
  }

  private async advance(issueId: string): Promise<void> {
    if (this.advancing.has(issueId)) {
      return
    }

    const steps = this.steps.get(issueId) ?? 0

    if (steps >= this.maxSteps) {
      await this.pause(
        issueId,
        'Autopilot stopped: reached the maximum number of automatic steps.',
      )
      return
    }

    this.advancing.add(issueId)
    this.steps.set(issueId, steps + 1)

    try {
      const result = await this.postJson<WorkflowContinueResponse>(
        `/api/issues/${encodeURIComponent(issueId)}/workflow/continue`,
      )
      const run = result?.run

      // A freshly created run is 'idle' until it executes. Only then do we run
      // it; an already-active run means work is in flight and will chain on its
      // own completion, and no run means the workflow has nothing left to start.
      if (run && run.status === 'idle') {
        void this.execute(run.id)
      }
    } catch (error) {
      await this.pause(issueId, `Autopilot paused: ${getMessage(error)}`)
    } finally {
      this.advancing.delete(issueId)
    }
  }

  private async execute(runId: string): Promise<void> {
    try {
      // Runs the agent loop to completion server-side; agentRuntime fires
      // onRunFinished when done, which chains the next task via handleRunFinished.
      await this.postJson(
        `/api/agent/runs/${encodeURIComponent(runId)}/continue`,
      )
    } catch (error) {
      this.deps.log?.(`autopilot run ${runId} failed: ${getMessage(error)}`)
    }
  }

  private async pause(issueId: string, message: string): Promise<void> {
    await this.deps.issueStore
      .addIssueComment(issueId, {
        author: 'system',
        kind: 'blocked',
        body: message,
      })
      .catch(() => undefined)
  }

  private async postJson<T = unknown>(path: string): Promise<T | undefined> {
    const fetchImpl = this.deps.fetchImpl ?? fetch
    const response = await fetchImpl(`${this.deps.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    const text = await response.text()
    const data = text ? (safeParse(text) as T) : undefined

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
}

const safeParse = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
