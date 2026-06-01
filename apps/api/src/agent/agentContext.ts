import type { AgentRunContext, AgentRunMessage } from "@agent-fleet/shared";

type ChatMessage = Record<string, unknown>;

const defaultContextTokenBudget = 24_000;
const responseReserveTokens = 4_096;
const messageOverheadTokens = 8;
const summaryMaxChars = 8_000;
const retainedMessageMaxChars = 12_000;
const toolMessageMaxChars = 6_000;
const minRetainedMessages = 6;

export type PreparedAgentContext = {
  context: AgentRunContext;
  messages: ChatMessage[];
};

export const prepareAgentContext = ({
  messages,
  systemPrompt,
  tokenBudget = defaultContextTokenBudget
}: {
  messages: AgentRunMessage[];
  systemPrompt: string;
  tokenBudget?: number;
}): PreparedAgentContext => {
  const now = new Date().toISOString();
  const inputBudget = Math.max(4_000, tokenBudget - responseReserveTokens);
  const normalizedMessages = messages.map(toPromptMessage);
  const systemMessage = {
    role: "system",
    content: systemPrompt
  };
  const fullPromptMessages = [systemMessage, ...normalizedMessages];
  const fullEstimate = estimateChatTokens(fullPromptMessages);

  if (fullEstimate <= inputBudget) {
    return {
      context: {
        strategy: "full",
        tokenBudget: inputBudget,
        estimatedTokens: fullEstimate,
        retainedMessages: messages.length,
        summarizedMessages: 0,
        updatedAt: now
      },
      messages: fullPromptMessages
    };
  }

  const retainedMessages: ChatMessage[] = [];
  let retainedTokens = estimateChatTokens([systemMessage]);

  for (let index = normalizedMessages.length - 1; index >= 0; index -= 1) {
    const candidate = normalizedMessages[index]!;
    const candidateTokens = estimateChatTokens([candidate]);
    const shouldKeepMinimum = retainedMessages.length < minRetainedMessages;

    if (!shouldKeepMinimum && retainedTokens + candidateTokens > inputBudget * 0.7) {
      break;
    }

    retainedMessages.unshift(candidate);
    retainedTokens += candidateTokens;
  }

  let retainedStartIndex = Math.max(0, messages.length - retainedMessages.length);
  let compactedPrompt = buildCompactedPrompt({
    messages,
    normalizedMessages,
    retainedStartIndex,
    systemMessage
  });

  while (compactedPrompt.promptMessages.length > 3 && estimateChatTokens(compactedPrompt.promptMessages) > inputBudget) {
    retainedStartIndex += 1;
    compactedPrompt = buildCompactedPrompt({
      messages,
      normalizedMessages,
      retainedStartIndex,
      systemMessage
    });
  }

  const estimatedTokens = estimateChatTokens(compactedPrompt.promptMessages);

  return {
    context: {
      strategy: "compacted",
      tokenBudget: inputBudget,
      estimatedTokens,
      retainedMessages: compactedPrompt.retainedMessages,
      summarizedMessages: compactedPrompt.summarizedMessages,
      summary: compactedPrompt.summary,
      updatedAt: now
    },
    messages: compactedPrompt.promptMessages
  };
};

const toPromptMessage = (message: AgentRunMessage): ChatMessage => {
  const content =
    message.role === "tool" ? `[tool:${message.toolName || "unknown"}]\n${message.content}` : message.content;

  return {
    role: message.role === "user" ? "user" : "assistant",
    content: truncateForPrompt(content, message.role === "tool" ? toolMessageMaxChars : retainedMessageMaxChars)
  };
};

const buildContextSummary = (messages: AgentRunMessage[]) => {
  if (!messages.length) {
    return "No older messages were compacted.";
  }

  const lines = messages.map((message, index) => {
    const label = message.role === "tool" ? `tool:${message.toolName || "unknown"}` : message.role;
    return `${index + 1}. ${label}: ${singleLine(truncateForPrompt(message.content, 700))}`;
  });

  return truncateForPrompt(
    [`${messages.length} older message(s) were compacted before this turn.`, ...lines].join("\n"),
    summaryMaxChars
  );
};

const buildCompactedPrompt = ({
  messages,
  normalizedMessages,
  retainedStartIndex,
  systemMessage
}: {
  messages: AgentRunMessage[];
  normalizedMessages: ChatMessage[];
  retainedStartIndex: number;
  systemMessage: ChatMessage;
}) => {
  const safeRetainedStartIndex = Math.min(Math.max(0, retainedStartIndex), messages.length);
  const summarizedMessages = safeRetainedStartIndex;
  const summary = buildContextSummary(messages.slice(0, summarizedMessages));
  const summaryMessage = {
    role: "system",
    content: [
      "Context memory:",
      summary,
      "",
      "Use this compressed memory as background. Prefer live recent messages when they conflict with this memory."
    ].join("\n")
  };
  const retainedPromptMessages = normalizedMessages.slice(safeRetainedStartIndex);

  return {
    promptMessages: [systemMessage, summaryMessage, ...retainedPromptMessages],
    retainedMessages: retainedPromptMessages.length,
    summarizedMessages,
    summary
  };
};

const estimateChatTokens = (messages: ChatMessage[]) => {
  return messages.reduce(
    (total, message) => total + messageOverheadTokens + estimateTextTokens(String(message.content ?? "")),
    0
  );
};

const estimateTextTokens = (value: string) => {
  return Math.ceil(Array.from(value).length / 3);
};

const truncateForPrompt = (value: string, maxChars: number) => {
  if (value.length <= maxChars) {
    return value;
  }

  const omittedChars = value.length - maxChars;
  return `${value.slice(0, maxChars)}\n\n[truncated ${omittedChars} characters for context budget]`;
};

const singleLine = (value: string) => {
  return value.replace(/\s+/gu, " ").trim();
};
