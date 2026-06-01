import { randomUUID } from "node:crypto";
import type { AgentRun, AgentRunMessage, LlmEndpoint, SandboxSettings, SandboxWorkspace } from "@agent-fleet/shared";
import { createOpenAIClient } from "../llm/openaiClient";
import { executeSandboxCommand } from "../sandbox/sandboxExecutor";
import { getGitAuthEnv } from "../sandbox/gitSandbox";
import { listWorkspaceFiles, readWorkspaceFile, writeWorkspaceFile } from "../sandbox/workspaceFiles";
import { prepareAgentContext } from "./agentContext";
import type { AgentRunStore } from "./agentRunStore";
import { createPullRequest } from "./githubPr";

type AgentRuntimeOptions = {
  runStore: AgentRunStore;
  settings: SandboxSettings;
  contextTokenBudget?: number;
  getEndpoint: (id?: string) => Promise<LlmEndpoint>;
  getWorkspace: (id: string) => Promise<SandboxWorkspace>;
  getGitHubToken: () => Promise<string | undefined>;
};

type ToolContext = {
  settings: SandboxSettings;
  workspace: SandboxWorkspace;
  githubToken?: string;
};

type AgentToolResult = {
  content: string;
  completed?: boolean;
  awaitingUser?: boolean;
};

type AgentRuntimeStreamEvent =
  | {
      type: "run";
      run: AgentRun;
    }
  | {
      type: "assistant_delta";
      content: string;
    }
  | {
      type: "tool_start";
      toolName: string;
    }
  | {
      type: "tool_result";
      toolName: string;
      content: string;
    }
  | {
      type: "done";
      run: AgentRun;
    }
  | {
      type: "error";
      error: string;
      run?: AgentRun;
    };

type AgentRuntimeStreamEmit = (event: AgentRuntimeStreamEvent) => void;

const maxToolIterations = 8;

export class AgentRuntime {
  constructor(private readonly options: AgentRuntimeOptions) {}

  async continue(runId: string, endpointId?: string, model?: string) {
    let run = await this.options.runStore.get(runId);
    const endpoint = await this.options.getEndpoint(endpointId || run.endpointId);
    const workspace = await this.options.getWorkspace(run.workspaceId);
    const githubToken = await this.options.getGitHubToken();

    run = await this.options.runStore.setStatus(run.id, "running");

    try {
      const client = createOpenAIClient(endpoint);
      const preparedContext = prepareAgentContext({
        messages: run.messages,
        systemPrompt: getSystemPrompt(workspace),
        tokenBudget: this.options.contextTokenBudget
      });
      run = await this.options.runStore.setContext(run.id, preparedContext.context);
      const messages = [...preparedContext.messages];

      const pendingMessages: Array<Omit<AgentRunMessage, "id" | "createdAt">> = [];
      let completed = false;
      let awaitingUser = false;

      for (let iteration = 0; iteration < maxToolIterations; iteration += 1) {
        const completion = await client.chat.completions.create({
          model: model || run.model || endpoint.defaultModel,
          messages: messages as never,
          tools: agentTools as never,
          tool_choice: "auto",
          temperature: 0.2
        });

        const message = completion.choices[0]?.message as {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            function: {
              name: string;
              arguments: string;
            };
          }>;
        } | null;

        if (!message) {
          throw new Error("LLM returned an empty response");
        }

        messages.push({
          role: "assistant",
          content: message.content || "",
          tool_calls: message.tool_calls
        });

        if (!message.tool_calls?.length) {
          pendingMessages.push({
            role: "assistant",
            content: message.content || ""
          });
          awaitingUser = true;
          break;
        }

        for (const toolCall of message.tool_calls) {
          const result = await executeAgentTool(toolCall.function.name, toolCall.function.arguments, {
            settings: this.options.settings,
            workspace,
            githubToken
          });

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result.content
          });

          pendingMessages.push({
            role: "tool",
            toolName: toolCall.function.name,
            content: result.content
          });

          if (result.completed) {
            completed = true;
          }

          if (result.awaitingUser) {
            awaitingUser = true;
          }
        }

        if (completed || awaitingUser) {
          break;
        }
      }

      if (!completed && !awaitingUser) {
        pendingMessages.push({
          role: "assistant",
          content: "Tool iteration limit reached. Review the current changes and continue the run."
        });
        awaitingUser = true;
      }

      if (pendingMessages.length > 0) {
        await this.options.runStore.appendMessages(run.id, pendingMessages);
      }

      return this.options.runStore.setStatus(run.id, completed ? "completed" : "awaiting_user");
    } catch (error) {
      const message = getErrorMessage(error);
      await this.options.runStore.appendMessage(run.id, {
        role: "system",
        content: message
      });
      return this.options.runStore.setStatus(run.id, "failed", message);
    }
  }

  async continueStream(runId: string, endpointId: string | undefined, model: string | undefined, emit: AgentRuntimeStreamEmit) {
    let run = await this.options.runStore.get(runId);
    const endpoint = await this.options.getEndpoint(endpointId || run.endpointId);
    const workspace = await this.options.getWorkspace(run.workspaceId);
    const githubToken = await this.options.getGitHubToken();

    run = await this.options.runStore.setStatus(run.id, "running");
    emit({ type: "run", run });

    try {
      const client = createOpenAIClient(endpoint);
      const preparedContext = prepareAgentContext({
        messages: run.messages,
        systemPrompt: getSystemPrompt(workspace),
        tokenBudget: this.options.contextTokenBudget
      });
      run = await this.options.runStore.setContext(run.id, preparedContext.context);
      emit({ type: "run", run });
      const messages = [...preparedContext.messages];

      let completed = false;
      let awaitingUser = false;

      for (let iteration = 0; iteration < maxToolIterations; iteration += 1) {
        let assistantContent = "";
        const toolCallsByIndex = new Map<number, PendingToolCall>();
        const stream = await client.chat.completions.create({
          model: model || run.model || endpoint.defaultModel,
          messages: messages as never,
          tools: agentTools as never,
          tool_choice: "auto",
          temperature: 0.2,
          stream: true
        });

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta as StreamDelta | undefined;
          const content = typeof delta?.content === "string" ? delta.content : "";

          if (content) {
            assistantContent += content;
            emit({ type: "assistant_delta", content });
          }

          for (const toolCallDelta of delta?.tool_calls || []) {
            mergeToolCallDelta(toolCallsByIndex, toolCallDelta);
          }
        }

        const toolCalls = Array.from(toolCallsByIndex.entries())
          .sort(([left], [right]) => left - right)
          .map(([, toolCall]) => ({
            id: toolCall.id || `call_${randomUUID().replace(/-/gu, "")}`,
            type: "function",
            function: {
              name: toolCall.function.name || "",
              arguments: toolCall.function.arguments
            }
          }));

        messages.push({
          role: "assistant",
          content: assistantContent,
          tool_calls: toolCalls.length ? toolCalls : undefined
        });

        if (assistantContent.trim()) {
          run = await this.options.runStore.appendMessage(run.id, {
            role: "assistant",
            content: assistantContent
          });
          emit({ type: "run", run });
        }

        if (!toolCalls.length) {
          if (!assistantContent.trim()) {
            run = await this.options.runStore.appendMessage(run.id, {
              role: "assistant",
              content: "I need more context before I can continue."
            });
            emit({ type: "run", run });
          }

          awaitingUser = true;
          break;
        }

        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name;
          emit({ type: "tool_start", toolName });

          const result = await executeAgentTool(toolName, toolCall.function.arguments, {
            settings: this.options.settings,
            workspace,
            githubToken
          });

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result.content
          });

          run = await this.options.runStore.appendMessage(run.id, {
            role: "tool",
            toolName,
            content: result.content
          });

          emit({ type: "tool_result", toolName, content: result.content });
          emit({ type: "run", run });

          if (result.completed) {
            completed = true;
          }

          if (result.awaitingUser) {
            awaitingUser = true;
          }
        }

        if (completed || awaitingUser) {
          break;
        }
      }

      if (!completed && !awaitingUser) {
        run = await this.options.runStore.appendMessage(run.id, {
          role: "assistant",
          content: "Tool iteration limit reached. Review the current changes and continue the run."
        });
        emit({ type: "run", run });
        awaitingUser = true;
      }

      run = await this.options.runStore.setStatus(run.id, completed ? "completed" : "awaiting_user");
      emit({ type: "done", run });
      return run;
    } catch (error) {
      const message = getErrorMessage(error);
      await this.options.runStore.appendMessage(run.id, {
        role: "system",
        content: message
      });
      const failedRun = await this.options.runStore.setStatus(run.id, "failed", message);
      emit({ type: "error", error: message, run: failedRun });
      return failedRun;
    }
  }
}

type StreamDelta = {
  content?: unknown;
  tool_calls?: StreamToolCallDelta[];
};

type StreamToolCallDelta = {
  index?: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

type PendingToolCall = {
  id?: string;
  function: {
    name?: string;
    arguments: string;
  };
};

const mergeToolCallDelta = (toolCallsByIndex: Map<number, PendingToolCall>, delta: StreamToolCallDelta) => {
  const index = delta.index ?? 0;
  const current = toolCallsByIndex.get(index) || {
    function: {
      arguments: ""
    }
  };

  if (delta.id) {
    current.id = delta.id;
  }

  if (delta.function?.name) {
    current.function.name = delta.function.name;
  }

  if (delta.function?.arguments) {
    current.function.arguments += delta.function.arguments;
  }

  toolCallsByIndex.set(index, current);
};

const agentTools = [
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files and directories in the sandbox workspace.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative directory path. Defaults to workspace root." }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a UTF-8 source file from the sandbox workspace.",
      parameters: {
        type: "object",
        required: ["path"],
        properties: {
          path: { type: "string" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write a UTF-8 source file in the sandbox workspace.",
      parameters: {
        type: "object",
        required: ["path", "content"],
        properties: {
          path: { type: "string" },
          content: { type: "string" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run an allowlisted command in the sandbox workspace without shell expansion.",
      parameters: {
        type: "object",
        required: ["command"],
        properties: {
          command: { type: "string" },
          args: { type: "array", items: { type: "string" } },
          cwd: { type: "string" },
          timeoutMs: { type: "number" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "git_status",
      description: "Return git status for the sandbox workspace.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "git_diff",
      description: "Return git diff for the sandbox workspace.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "create_pull_request",
      description: "Create a GitHub pull request after changes are committed and pushed.",
      parameters: {
        type: "object",
        required: ["title", "body", "head", "base"],
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          head: { type: "string", description: "Pushed branch name, for example agent/my-change" },
          base: { type: "string", description: "Base branch, for example main" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "request_user_input",
      description: "Ask the user a blocking clarification question.",
      parameters: {
        type: "object",
        required: ["question"],
        properties: {
          question: { type: "string" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "finish",
      description: "Mark the agent run completed with a concise final summary.",
      parameters: {
        type: "object",
        required: ["summary"],
        properties: {
          summary: { type: "string" }
        }
      }
    }
  }
];

const executeAgentTool = async (name: string, rawArguments: string, context: ToolContext): Promise<AgentToolResult> => {
  const args = parseToolArguments(rawArguments);

  try {
    if (name === "list_files") {
      const entries = await listWorkspaceFiles(context.workspace, getString(args.path) || ".");
      return toolResult({ entries });
    }

    if (name === "read_file") {
      return toolResult(await readWorkspaceFile(context.workspace, requireString(args.path, "path")));
    }

    if (name === "write_file") {
      return toolResult(
        await writeWorkspaceFile(context.workspace, requireString(args.path, "path"), requireString(args.content, "content"))
      );
    }

    if (name === "run_command") {
      const command = requireString(args.command, "command");
      const extraEnv = command === "git" ? getGitAuthEnv(context.workspace.repositoryUrl || "", context.githubToken) : {};
      return toolResult(
        await executeSandboxCommand(
          context.settings,
          context.workspace,
          {
            command,
            args: Array.isArray(args.args) ? args.args.map(String) : [],
            cwd: getString(args.cwd),
            timeoutMs: typeof args.timeoutMs === "number" ? args.timeoutMs : undefined
          },
          extraEnv
        )
      );
    }

    if (name === "git_status") {
      return toolResult(
        await executeSandboxCommand(context.settings, context.workspace, {
          command: "git",
          args: ["status", "--short", "--branch"]
        })
      );
    }

    if (name === "git_diff") {
      return toolResult(
        await executeSandboxCommand(context.settings, context.workspace, {
          command: "git",
          args: ["diff", "--stat"]
        })
      );
    }

    if (name === "create_pull_request") {
      const token = context.githubToken;

      if (!token) {
        throw new Error("GitHub PAT is not configured");
      }

      const url = await createPullRequest({
        workspace: context.workspace,
        token,
        title: requireString(args.title, "title"),
        body: requireString(args.body, "body"),
        head: requireString(args.head, "head"),
        base: requireString(args.base, "base")
      });

      return toolResult({ url });
    }

    if (name === "request_user_input") {
      return {
        content: requireString(args.question, "question"),
        awaitingUser: true
      };
    }

    if (name === "finish") {
      return {
        content: requireString(args.summary, "summary"),
        completed: true
      };
    }

    throw new Error(`Unknown agent tool '${name}'`);
  } catch (error) {
    return toolResult({
      error: getErrorMessage(error)
    });
  }
};

const toolResult = (value: unknown): AgentToolResult => ({
  content: JSON.stringify(value, null, 2)
});

const parseToolArguments = (value: string) => {
  if (!value) {
    return {} as Record<string, unknown>;
  }

  return JSON.parse(value) as Record<string, unknown>;
};

const requireString = (value: unknown, name: string) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Tool argument '${name}' is required`);
  }

  return value;
};

const getString = (value: unknown) => {
  return typeof value === "string" && value.trim() ? value : undefined;
};

const getSystemPrompt = (workspace: SandboxWorkspace) => {
  return [
    "You are a coding agent running inside an isolated sandbox workspace.",
    "Communicate with the user through the run thread. Ask for clarification only when blocked.",
    "Use tools to inspect files, edit files, run tests/builds, inspect git diff, commit, push, and create a pull request when requested.",
    "Do not claim that work is complete until you have inspected relevant files and run reasonable verification.",
    "Use command tools with explicit command and args only. Never rely on shell metacharacters.",
    `Workspace path: ${workspace.path}`,
    workspace.repositoryUrl ? `Repository: ${workspace.repositoryUrl}` : "Repository: not configured"
  ].join("\n");
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown agent runtime error";
};
