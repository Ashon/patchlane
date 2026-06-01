import { type ReactNode, useState } from "react";
import { Bot, Check, Copy, GitPullRequest, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatContainerContent, ChatContainerRoot, ChatContainerScrollAnchor } from "@/components/ui/chat-container";
import { Message, MessageAction, MessageActions, MessageAvatar, MessageContent } from "@/components/ui/message";
import { PromptInput, PromptInputActions, PromptInputTextarea } from "@/components/ui/prompt-input";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ui/reasoning";
import { ScrollButton } from "@/components/ui/scroll-button";
import { SystemMessage } from "@/components/ui/system-message";
import { ThinkingBar } from "@/components/ui/thinking-bar";
import { Tool, type ToolPart } from "@/components/ui/tool";
import { cn } from "@/lib/utils";

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  reasoning?: string;
  status?: "streaming" | "done" | "error" | "stopped";
  finishReason?: string;
  createdAt?: string;
  toolName?: string;
  toolCallId?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  toolError?: string;
};

type ConversationMessageGroup = {
  id: string;
  role: "user" | "assistant";
  messages: ConversationMessage[];
};

type ChatConversationProps = {
  detectPullRequestLinks?: boolean;
  emptyState: ReactNode;
  error?: string | null;
  header?: ReactNode;
  inputActions: ReactNode;
  inputDisabled?: boolean;
  inputFooter: ReactNode;
  inputLoading: boolean;
  inputPlaceholder: string;
  inputValue: string;
  messages: ConversationMessage[];
  onInputChange: (value: string) => void;
  onInputSubmit: () => void;
  showMessageMeta?: boolean;
};

export const ChatConversation = ({
  detectPullRequestLinks = false,
  emptyState,
  error,
  header,
  inputActions,
  inputDisabled,
  inputFooter,
  inputLoading,
  inputPlaceholder,
  inputValue,
  messages,
  onInputChange,
  onInputSubmit,
  showMessageMeta = false
}: ChatConversationProps) => {
  const [reasoningOpen, setReasoningOpen] = useState<Record<string, boolean>>({});
  const groups = groupMessages(messages);

  const toggleReasoning = (message: ConversationMessage, defaultOpen: boolean) => {
    setReasoningOpen((current) => ({
      ...current,
      [message.id]: !(current[message.id] ?? defaultOpen)
    }));
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {header}

      {error ? (
        <SystemMessage className="mx-3 mt-3" fill variant="error">
          {error}
        </SystemMessage>
      ) : null}

      <div className="min-h-0 flex-1">
        <ChatContainerRoot className="relative h-full">
          <ChatContainerContent className="w-full gap-2 px-3 py-2">
            {messages.length === 0
              ? emptyState
              : groups.map((group) =>
                  group.role === "user" ? (
                    <UserMessageBubble
                      key={group.id}
                      message={group.messages[0]!}
                      showMeta={showMessageMeta}
                    />
                  ) : (
                    <AssistantMessageGroup
                      detectPullRequestLinks={detectPullRequestLinks}
                      key={group.id}
                      messages={group.messages}
                      onReasoningToggle={toggleReasoning}
                      reasoningOpen={reasoningOpen}
                      showMeta={showMessageMeta}
                    />
                  )
                )}
            <ChatContainerScrollAnchor />
          </ChatContainerContent>
          <div className="absolute bottom-4 right-4">
            <ScrollButton className="shadow-md" />
          </div>
        </ChatContainerRoot>
      </div>

      <div className="border-t bg-card p-2">
        <PromptInput
          className="rounded-lg"
          disabled={inputDisabled}
          isLoading={inputLoading}
          onSubmit={onInputSubmit}
          onValueChange={onInputChange}
          value={inputValue}
        >
          <PromptInputTextarea placeholder={inputPlaceholder} />
          <div className="flex min-h-9 items-center justify-between gap-3 px-2 pb-1">
            <div className="truncate text-xs text-muted-foreground">{inputFooter}</div>
            <PromptInputActions>{inputActions}</PromptInputActions>
          </div>
        </PromptInput>
      </div>
    </section>
  );
};

const groupMessages = (messages: ConversationMessage[]) => {
  return messages.reduce<ConversationMessageGroup[]>((groups, message) => {
    if (message.role === "user") {
      groups.push({ id: message.id, role: "user", messages: [message] });
      return groups;
    }

    const previous = groups[groups.length - 1];

    if (previous?.role === "assistant") {
      previous.messages.push(message);
      return groups;
    }

    groups.push({ id: message.id, role: "assistant", messages: [message] });
    return groups;
  }, []);
};

const UserMessageBubble = ({ message, showMeta }: { message: ConversationMessage; showMeta: boolean }) => {
  const content = message.content;

  return (
    <Message className="group justify-end">
      <div className="flex max-w-[960px] min-w-0 flex-col items-end space-y-2">
        {showMeta ? <MessageMeta message={message} /> : null}
        {content ? (
          <MessageContent
            className="max-w-[min(960px,100%)] rounded-lg bg-primary px-3 py-2.5 text-sm leading-6 text-primary-foreground prose-invert prose-p:my-0 prose-pre:my-2 prose-ol:my-1.5 prose-ul:my-1.5 prose-li:my-0 prose-blockquote:my-2 prose-table:my-2"
            id={message.id}
            markdown
          >
            {content}
          </MessageContent>
        ) : null}
        <MessageStatusActions message={message} />
      </div>
    </Message>
  );
};

const AssistantMessageGroup = ({
  detectPullRequestLinks,
  messages,
  onReasoningToggle,
  reasoningOpen,
  showMeta
}: {
  detectPullRequestLinks: boolean;
  messages: ConversationMessage[];
  onReasoningToggle: (message: ConversationMessage, defaultOpen: boolean) => void;
  reasoningOpen: Record<string, boolean>;
  showMeta: boolean;
}) => {
  const metaMessage = messages.find((message) => message.role === "assistant" || message.role === "system") ?? messages[0]!;

  return (
    <Message className="group gap-2">
      <MessageAvatar alt="Assistant" className="h-7 w-7" fallback="AI" src="" />
      <div className="min-w-0 space-y-1.5">
        {showMeta ? <AssistantGroupMeta message={metaMessage} /> : null}
        {messages.map((message) => (
          <AssistantMessagePart
            detectPullRequestLinks={detectPullRequestLinks}
            key={message.id}
            message={message}
            onReasoningToggle={onReasoningToggle}
            reasoningOpen={reasoningOpen[message.id]}
          />
        ))}
      </div>
    </Message>
  );
};

const AssistantMessagePart = ({
  detectPullRequestLinks,
  message,
  onReasoningToggle,
  reasoningOpen
}: {
  detectPullRequestLinks: boolean;
  message: ConversationMessage;
  onReasoningToggle: (message: ConversationMessage, defaultOpen: boolean) => void;
  reasoningOpen?: boolean;
}) => {
  const isTool = message.role === "tool";
  const isSystem = message.role === "system";
  const isAssistant = message.role === "assistant" || isSystem;
  const isStreaming = message.status === "streaming";
  const content = message.content;
  const reasoning = message.reasoning ?? "";

  return (
    <div className="min-w-0 space-y-1">
      {isAssistant && reasoning ? (
        <Reasoning
          isStreaming={isStreaming}
          onOpenChange={(open) => {
            if (reasoningOpen !== open) {
              onReasoningToggle(message, isStreaming);
            }
          }}
          open={reasoningOpen ?? isStreaming}
        >
          {isStreaming ? (
            <ThinkingBar className="max-w-[min(960px,100%)] py-0.5 text-xs" onClick={() => onReasoningToggle(message, true)} />
          ) : (
            <ReasoningTrigger className="text-xs">Thinking trace</ReasoningTrigger>
          )}
          <ReasoningContent className="ml-1 mt-1 border-l pl-2" contentClassName="max-w-[min(960px,100%)] py-0.5 text-xs" markdown>
            {reasoning}
          </ReasoningContent>
        </Reasoning>
      ) : null}

      {isAssistant && isStreaming && !content && !reasoning ? (
        <ThinkingBar className="max-w-[min(960px,100%)] py-0.5 text-xs" />
      ) : null}

      {isTool ? (
        <Tool
          className="mt-0.5 min-w-[220px] max-w-[min(420px,100%)] border-muted-foreground/20 bg-muted/20 shadow-none"
          defaultOpen={isStreaming || message.status === "error"}
          size="compact"
          toolPart={toToolPart(message)}
        />
      ) : content ? (
        <MessageContent
          className={cn(
            "max-w-[min(960px,100%)] rounded-lg px-3 py-2.5 text-sm leading-6",
            isSystem && "border-destructive/25 bg-destructive/10 text-destructive"
          )}
          id={message.id}
          markdown={isAssistant}
        >
          {content}
        </MessageContent>
      ) : null}

      {detectPullRequestLinks && content.includes("https://github.com/") ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <GitPullRequest className="h-3.5 w-3.5" />
          PR/reference detected
        </div>
      ) : null}

      {!isTool ? <MessageStatusActions message={message} /> : null}
    </div>
  );
};

const toToolPart = (message: ConversationMessage): ToolPart => {
  const isStreaming = message.status === "streaming";
  const isError = message.status === "error";
  const contentOutput = message.content && !isStreaming && !isError ? message.content : undefined;
  const output = message.toolOutput ?? contentOutput;

  return {
    type: message.toolName || "tool",
    state: isError ? "output-error" : isStreaming ? "input-streaming" : output ? "output-available" : "input-available",
    input: message.toolInput,
    output,
    toolCallId: message.toolCallId ?? message.id,
    errorText: message.toolError ?? (isError ? message.content : undefined)
  };
};

const AssistantGroupMeta = ({ message }: { message: ConversationMessage }) => {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Bot className="h-3.5 w-3.5" />
      <span>{message.role === "system" ? "system" : "assistant"}</span>
      {message.createdAt ? <span>{formatDateTime(message.createdAt)}</span> : null}
    </div>
  );
};

const MessageMeta = ({ message }: { message: ConversationMessage }) => {
  return (
    <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
      <MessageSquare className="h-3.5 w-3.5" />
      <span>{message.role}</span>
      {message.createdAt ? <span>{formatDateTime(message.createdAt)}</span> : null}
    </div>
  );
};

const MessageStatusActions = ({ message }: { message: ConversationMessage }) => {
  const content = message.content;

  return (
    <MessageActions className={cn("opacity-0 transition-opacity group-hover:opacity-100", message.role === "user" && "justify-end")}>
      {message.finishReason ? <Badge variant="secondary">finish: {message.finishReason}</Badge> : null}
      {message.status === "streaming" ? <Badge variant="secondary">streaming</Badge> : null}
      {message.status === "error" ? <Badge variant="destructive">error</Badge> : null}
      {message.status === "stopped" ? (
        <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50" variant="outline">
          stopped
        </Badge>
      ) : null}
      {content ? <CopyAction value={content} /> : null}
    </MessageActions>
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

const formatDateTime = (value: string) => {
  return new Date(value).toLocaleString();
};
