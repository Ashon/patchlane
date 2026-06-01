import { useMemo, useRef, useState } from "react";
import type { LlmChatMessage, LlmEndpoint } from "@agent-fleet/shared";
import { Check, Copy, Cpu, Loader2, MessageSquare, Send, Sparkles, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatContainerContent, ChatContainerRoot, ChatContainerScrollAnchor } from "@/components/ui/chat-container";
import { Message, MessageAction, MessageActions, MessageAvatar, MessageContent } from "@/components/ui/message";
import { PromptInput, PromptInputAction, PromptInputActions, PromptInputTextarea } from "@/components/ui/prompt-input";
import { PromptSuggestion } from "@/components/ui/prompt-suggestion";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ui/reasoning";
import { ScrollButton } from "@/components/ui/scroll-button";
import { SystemMessage } from "@/components/ui/system-message";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type ChatPanelProps = {
  endpoint: LlmEndpoint | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning: string;
  status?: "streaming" | "done" | "error" | "stopped";
  finishReason?: string;
};

const suggestions = [
  "현재 모델의 장단점을 Markdown 표로 정리해줘.",
  "TypeScript Express SSE 예제를 코드 블록으로 보여줘.",
  "이 프로젝트에서 agent fleet 기능을 어떻게 확장할지 제안해줘."
];

export const ChatPanel = ({ endpoint }: ChatPanelProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState<Record<string, boolean>>({});
  const abortRef = useRef<AbortController | null>(null);

  const canChat = Boolean(endpoint?.enabled);

  const apiMessages = useMemo<LlmChatMessage[]>(
    () =>
      messages
        .filter((message) => message.role === "user" || (message.role === "assistant" && message.status === "done"))
        .map((message) => ({
          role: message.role,
          content: message.content
        })),
    [messages]
  );

  const sendMessage = async (value = input) => {
    const prompt = value.trim();

    if (!endpoint || !canChat || !prompt || isStreaming) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      reasoning: "",
      status: "done"
    };
    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      reasoning: "",
      status: "streaming"
    };
    const controller = new AbortController();

    abortRef.current = controller;
    setInput("");
    setError(null);
    setIsStreaming(true);
    setReasoningOpen((current) => ({ ...current, [assistantId]: true }));
    setMessages((current) => [...current, userMessage, assistantMessage]);

    try {
      let rawContent = "";
      let rawReasoning = "";

      await api.streamChat(
        {
          endpointId: endpoint.id,
          maxTokens: 2048,
          messages: [...apiMessages, { role: "user", content: prompt }],
          model: endpoint.defaultModel,
          temperature: 0.2
        },
        {
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === "delta") {
              rawContent += event.content || "";
              rawReasoning += event.reasoning || "";
              const parsed = splitThinking(rawContent, rawReasoning);

              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId
                    ? {
                        ...message,
                        content: parsed.content,
                        reasoning: parsed.reasoning,
                        status: "streaming"
                      }
                    : message
                )
              );
            }

            if (event.type === "finish") {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId ? { ...message, finishReason: event.finishReason } : message
                )
              );
            }

            if (event.type === "error") {
              throw new Error(event.error);
            }
          }
        }
      );

      setMessages((current) =>
        current.map((message) => (message.id === assistantId ? { ...message, status: "done" } : message))
      );
    } catch (streamError) {
      if (isAbortError(streamError)) {
        setMessages((current) =>
          current.map((message) => (message.id === assistantId ? { ...message, status: "stopped" } : message))
        );
      } else {
        const message = getErrorMessage(streamError);
        setError(message);
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId
              ? {
                  ...item,
                  content: message,
                  status: "error"
                }
              : item
          )
        );
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  const clearChat = () => {
    stopStreaming();
    setMessages([]);
    setError(null);
  };

  return (
    <section className="flex min-h-[calc(100vh-112px)] flex-col overflow-hidden rounded-lg border bg-background shadow-sm">
      <header className="flex flex-col gap-3 border-b bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">Agent Chat</h2>
            <p className="truncate text-sm text-muted-foreground">
              {endpoint ? `${endpoint.name} / ${endpoint.defaultModel}` : "No endpoint selected"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            className={cn(
              "gap-1",
              canChat
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50"
            )}
            variant="outline"
          >
            <Cpu className="h-3.5 w-3.5" />
            {canChat ? "Ready" : "Unavailable"}
          </Badge>
          {isStreaming ? <Badge variant="secondary">Streaming</Badge> : null}
          <Button disabled={!messages.length && !error} onClick={clearChat} type="button" variant="outline">
            Clear
          </Button>
        </div>
      </header>

      {error ? (
        <SystemMessage className="mx-4 mt-4" fill variant="error">
          {error}
        </SystemMessage>
      ) : null}

      <div className="min-h-0 flex-1">
        <ChatContainerRoot className="relative h-full">
          <ChatContainerContent className="mx-auto w-full max-w-4xl gap-4 px-4 py-5">
            {messages.length === 0 ? (
              <div className="flex min-h-[42vh] flex-col items-center justify-center gap-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-card text-primary shadow-sm">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold">Start a conversation</h3>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Streaming responses, reasoning panels, Markdown, tables, and code blocks are enabled.
                  </p>
                </div>
                <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                  {suggestions.map((suggestion) => (
                    <PromptSuggestion
                      disabled={!canChat || isStreaming}
                      key={suggestion}
                      onClick={() => void sendMessage(suggestion)}
                      type="button"
                    >
                      {suggestion}
                    </PromptSuggestion>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => {
                const isAssistant = message.role === "assistant";

                return (
                  <Message className={cn("group", message.role === "user" && "justify-end")} key={message.id}>
                    {isAssistant ? <MessageAvatar alt="Assistant" fallback="AI" src="" /> : null}
                    <div className={cn("min-w-0 space-y-2", message.role === "user" && "flex max-w-[760px] flex-col items-end")}>
                      {isAssistant && message.reasoning ? (
                        <Reasoning
                          isStreaming={message.status === "streaming"}
                          onOpenChange={(open) => setReasoningOpen((current) => ({ ...current, [message.id]: open }))}
                          open={reasoningOpen[message.id] ?? message.status === "streaming"}
                        >
                          <ReasoningTrigger className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                            {message.status === "streaming" ? "Thinking" : "Thinking trace"}
                          </ReasoningTrigger>
                          <ReasoningContent
                            className="rounded-md border border-t-0 bg-muted/20 px-3"
                            contentClassName="py-3"
                            markdown
                          >
                            {message.reasoning}
                          </ReasoningContent>
                        </Reasoning>
                      ) : null}
                      {isAssistant && message.status === "streaming" && !message.content ? (
                        <SystemMessage fill icon={<Loader2 className="size-4 animate-spin" />}>
                          Thinking
                        </SystemMessage>
                      ) : null}
                      {message.content ? (
                        <MessageContent
                          className={cn(
                            "max-w-[min(760px,100%)] rounded-lg px-4 py-3 text-sm leading-6",
                            message.role === "user" && "bg-primary text-primary-foreground prose-invert"
                          )}
                          id={message.id}
                          markdown={isAssistant}
                        >
                          {message.content}
                        </MessageContent>
                      ) : null}
                      <MessageActions className={cn("opacity-0 transition-opacity group-hover:opacity-100", message.role === "user" && "justify-end")}>
                        {message.finishReason ? <Badge variant="secondary">finish: {message.finishReason}</Badge> : null}
                        {message.status === "error" ? <Badge variant="destructive">error</Badge> : null}
                        {message.status === "stopped" ? (
                          <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50" variant="outline">
                            stopped
                          </Badge>
                        ) : null}
                        {message.content ? <CopyAction value={message.content} /> : null}
                      </MessageActions>
                    </div>
                    {!isAssistant ? <MessageAvatar alt="You" fallback="ME" src="" /> : null}
                  </Message>
                );
              })
            )}
            <ChatContainerScrollAnchor />
          </ChatContainerContent>
          <div className="absolute bottom-4 right-4">
            <ScrollButton className="shadow-md" />
          </div>
        </ChatContainerRoot>
      </div>

      <div className="border-t bg-card p-3">
        <PromptInput
          className="rounded-xl"
          disabled={!canChat}
          isLoading={isStreaming}
          onSubmit={() => void sendMessage()}
          onValueChange={setInput}
          value={input}
        >
          <PromptInputTextarea placeholder={canChat ? "Ask the selected model..." : "Select an enabled endpoint first"} />
          <div className="flex min-h-10 items-center justify-between gap-3 px-2 pb-1">
            <div className="truncate text-xs text-muted-foreground">
              {endpoint ? `${endpoint.baseUrl} · ${endpoint.defaultModel}` : "Select an enabled endpoint"}
            </div>
            <PromptInputActions>
              {isStreaming ? (
                <PromptInputAction tooltip="Stop response">
                  <Button onClick={stopStreaming} size="icon" type="button" variant="outline">
                    <Square />
                  </Button>
                </PromptInputAction>
              ) : (
                <PromptInputAction tooltip="Send message">
                  <Button disabled={!canChat || !input.trim()} size="icon" type="button" onClick={() => void sendMessage()}>
                    <Send />
                  </Button>
                </PromptInputAction>
              )}
            </PromptInputActions>
          </div>
        </PromptInput>
      </div>
    </section>
  );
};

const CopyAction = ({ value }: { value: string }) => {
  const { copied, copy } = useCopyState();

  return (
    <MessageAction tooltip={copied ? "Copied" : "Copy message"}>
      <Button className="h-7 px-2 text-xs" onClick={() => void copy(value)} size="sm" type="button" variant="ghost">
        {copied ? <Check /> : <Copy />}
        Copy
      </Button>
    </MessageAction>
  );
};

const useCopyState = () => {
  const [copied, setCopied] = useState(false);

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return { copied, copy };
};

const splitThinking = (rawContent: string, rawReasoning: string) => {
  let content = rawContent;
  let reasoning = rawReasoning;

  while (content.includes("<think>")) {
    const openIndex = content.indexOf("<think>");
    const before = content.slice(0, openIndex);
    const afterOpen = content.slice(openIndex + "<think>".length);
    const closeIndex = afterOpen.indexOf("</think>");

    if (closeIndex < 0) {
      reasoning = joinReasoning(reasoning, afterOpen);
      content = before;
      break;
    }

    reasoning = joinReasoning(reasoning, afterOpen.slice(0, closeIndex));
    content = `${before}${afterOpen.slice(closeIndex + "</think>".length)}`;
  }

  return {
    content: content.trimStart(),
    reasoning: reasoning.trim()
  };
};

const joinReasoning = (current: string, next: string) => {
  if (!next.trim()) {
    return current;
  }

  return current ? `${current}${next}` : next;
};

const isAbortError = (error: unknown) => {
  return error instanceof DOMException && error.name === "AbortError";
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown chat error";
};
