import type OpenAI from 'openai'
import type { LlmEndpoint, SupervisorChatRequest } from '@patchlane/shared'
import { createOpenAIClient } from '../llm/openaiClient'
import {
  supervisorToolDefinitions,
  supervisorToolMap,
  type SupervisorToolContext,
} from './supervisorTools'

export type SupervisorStreamEvent =
  | { type: 'tool_call'; id: string; name: string; arguments: string }
  | {
      type: 'tool_result'
      id: string
      name: string
      ok: boolean
      result: string
    }
  | { type: 'delta'; content: string }
  | { type: 'finish'; finishReason: string }
  | { type: 'error'; error: string }

type RunSupervisorChatOptions = {
  endpoint: LlmEndpoint
  request: SupervisorChatRequest
  baseUrl: string
  signal?: AbortSignal
  maxIterations?: number
  onEvent: (event: SupervisorStreamEvent) => void
}

const SUPERVISOR_SYSTEM_PROMPT = [
  'You are the Patchlane Supervisor. You orchestrate the workspace by calling tools.',
  'Use the provided tools to inspect and manage projects, issues, and coding runs — do not ask the user to click around the UI when a tool can do it.',
  'Guidelines:',
  '- Discover ids with list_projects / list_issues before mutating; never invent ids.',
  '- To create work: create_project, then create_issue. To assign/kick off work: plan_issue then start_issue (start_issue plans automatically if needed).',
  '- start_issue needs the project to have a repository configured; if it fails for that reason, tell the user to add a repository URL.',
  '- There are no destructive tools (no delete). If the user asks to delete something, explain it must be done from the UI.',
  '- Keep tool calls minimal and purposeful, then summarize what you did and the resulting ids/status in the final message.',
].join('\n')

const MAX_TOOL_RESULT_CHARS = 6_000

const truncateResult = (value: string) =>
  value.length > MAX_TOOL_RESULT_CHARS
    ? `${value.slice(0, MAX_TOOL_RESULT_CHARS)}… (truncated)`
    : value

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown supervisor error'

export const runSupervisorChat = async ({
  endpoint,
  request,
  baseUrl,
  signal,
  maxIterations = 8,
  onEvent,
}: RunSupervisorChatOptions): Promise<void> => {
  const client = createOpenAIClient(endpoint)
  const model = request.model || endpoint.defaultModel
  const toolContext: SupervisorToolContext = { baseUrl, signal }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: SUPERVISOR_SYSTEM_PROMPT },
    ...request.messages.map(
      (message) =>
        ({
          role: message.role,
          content: message.content,
        }) as OpenAI.Chat.Completions.ChatCompletionMessageParam,
    ),
  ]

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    if (signal?.aborted) {
      return
    }

    const completion = await client.chat.completions.create(
      {
        model,
        messages,
        tools: supervisorToolDefinitions,
        tool_choice: 'auto',
        temperature: 0,
      },
      { signal },
    )

    const choice = completion.choices[0]
    const message = choice?.message

    if (!message) {
      onEvent({ type: 'finish', finishReason: 'stop' })
      return
    }

    const toolCalls = message.tool_calls ?? []

    if (toolCalls.length === 0) {
      const content = message.content ?? ''
      if (content) {
        onEvent({ type: 'delta', content })
      }
      onEvent({ type: 'finish', finishReason: choice?.finish_reason ?? 'stop' })
      return
    }

    messages.push(message)

    for (const toolCall of toolCalls) {
      if (toolCall.type !== 'function') {
        continue
      }

      const { id, function: fn } = toolCall
      onEvent({
        type: 'tool_call',
        id,
        name: fn.name,
        arguments: fn.arguments || '{}',
      })

      let ok = true
      let resultText: string

      try {
        const tool = supervisorToolMap.get(fn.name)
        if (!tool) {
          throw new Error(`Unknown tool '${fn.name}'`)
        }

        const parsedArgs = fn.arguments
          ? (JSON.parse(fn.arguments) as Record<string, unknown>)
          : {}
        const result = await tool.execute(parsedArgs, toolContext)
        resultText = JSON.stringify(result ?? null)
      } catch (error) {
        ok = false
        resultText = JSON.stringify({ error: getErrorMessage(error) })
      }

      onEvent({
        type: 'tool_result',
        id,
        name: fn.name,
        ok,
        result: truncateResult(resultText),
      })

      messages.push({
        role: 'tool',
        tool_call_id: id,
        content: truncateResult(resultText),
      })
    }
  }

  onEvent({
    type: 'delta',
    content:
      'Reached the maximum number of tool steps before finishing. Please narrow the request and try again.',
  })
  onEvent({ type: 'finish', finishReason: 'length' })
}
