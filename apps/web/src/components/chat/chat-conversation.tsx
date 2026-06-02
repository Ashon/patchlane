import { type ReactNode, useState } from "react";
import { Bot, Check, Copy, GitPullRequest, MessageSquare, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatContainerContent, ChatContainerRoot, ChatContainerScrollAnchor } from "@/components/ui/chat-container";
import { Message, MessageAction, MessageActions, MessageAvatar, MessageContent } from "@/components/ui/message";
import { PromptInput, PromptInputActions, PromptInputTextarea } from "@/components/ui/prompt-input";
import { Loader } from "@/components/ui/loader";
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
  onRewindMessage?: (message: ConversationMessage) => void;
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
  onRewindMessage,
  showMessageMeta = false
}: ChatConversationProps) => {
  const [reasoningOpen, setReasoningOpen] = useState<Record<string, boolean>>({});
  const groups = groupMessages(messages);
  const hasInlineActivity = messages.some((message) => message.status === "streaming");

  const setReasoningVisibility = (message: ConversationMessage, open: boolean) => {
    setReasoningOpen((current) => ({
      ...current,
      [message.id]: open
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
          <ChatContainerContent className="w-full gap-1.5 px-3 py-2">
            {messages.length === 0
              ? emptyState
              : groups.map((group) =>
                  group.role === "user" ? (
                    <UserMessageBubble
                      key={group.id}
                      message={group.messages[0]!}
                      onRewind={onRewindMessage}
                      rewindDisabled={inputLoading}
                      showMeta={showMessageMeta}
                    />
                  ) : (
                    <AssistantMessageGroup
                      detectPullRequestLinks={detectPullRequestLinks}
                      key={group.id}
                      messages={group.messages}
                      onReasoningOpenChange={setReasoningVisibility}
                      onRewind={onRewindMessage}
                      reasoningOpen={reasoningOpen}
                      rewindDisabled={inputLoading}
                      showMeta={showMessageMeta}
                    />
                  )
                )}
            {inputLoading && !hasInlineActivity ? <AssistantActivityIndicator /> : null}
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
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              {inputLoading ? <Loader className="text-primary" size="md" variant="pulse-dot" /> : null}
              <span className="truncate">{inputFooter}</span>
            </div>
            <PromptInputActions>{inputActions}</PromptInputActions>
          </div>
        </PromptInput>
      </div>
    </section>
  );
};

const AssistantActivityIndicator = () => {
  return (
    <Message className="group w-full min-w-0 gap-2">
      <MessageAvatar alt="Assistant" className="h-7 w-7" fallback="AI" src="" />
      <div className="flex h-8 min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <Loader className="text-primary" size="md" variant="pulse-dot" />
        <span>Working</span>
      </div>
    </Message>
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

const UserMessageBubble = ({
  message,
  onRewind,
  rewindDisabled,
  showMeta
}: {
  message: ConversationMessage;
  onRewind?: (message: ConversationMessage) => void;
  rewindDisabled?: boolean;
  showMeta: boolean;
}) => {
  const content = message.content;

  return (
    <Message className="group w-full min-w-0 justify-end">
      <div className="group/message relative flex w-full min-w-0 max-w-[960px] flex-col items-end space-y-1.5">
        {showMeta ? <MessageMeta message={message} /> : null}
        {content ? (
          <MessageContent
            className="max-w-full overflow-hidden rounded-lg bg-primary px-3 py-2.5 text-sm leading-6 text-primary-foreground prose-invert prose-p:my-0 prose-pre:my-2 prose-ol:my-1.5 prose-ul:my-1.5 prose-li:my-0 prose-blockquote:my-2 prose-table:my-2 [&_*]:max-w-full [&_pre]:overflow-x-auto"
            id={message.id}
            markdown
          >
            {content}
          </MessageContent>
        ) : null}
        <MessageStatusActions
          message={message}
          onRewind={onRewind}
          rewindDisabled={rewindDisabled}
        />
      </div>
    </Message>
  );
};

const AssistantMessageGroup = ({
  detectPullRequestLinks,
  messages,
  onReasoningOpenChange,
  onRewind,
  reasoningOpen,
  rewindDisabled,
  showMeta
}: {
  detectPullRequestLinks: boolean;
  messages: ConversationMessage[];
  onReasoningOpenChange: (message: ConversationMessage, open: boolean) => void;
  onRewind?: (message: ConversationMessage) => void;
  reasoningOpen: Record<string, boolean>;
  rewindDisabled?: boolean;
  showMeta: boolean;
}) => {
  const metaMessage = messages.find((message) => message.role === "assistant" || message.role === "system") ?? messages[0]!;

  return (
    <Message className="group w-full min-w-0 gap-2">
      <MessageAvatar alt="Assistant" className="h-7 w-7" fallback="AI" src="" />
      <div className="w-full min-w-0 space-y-1 overflow-hidden">
        {showMeta ? <AssistantGroupMeta message={metaMessage} /> : null}
        {messages.map((message) => (
          <AssistantMessagePart
            detectPullRequestLinks={detectPullRequestLinks}
            key={message.id}
            message={message}
            onReasoningOpenChange={onReasoningOpenChange}
            onRewind={onRewind}
            reasoningOpen={reasoningOpen[message.id]}
            rewindDisabled={rewindDisabled}
          />
        ))}
      </div>
    </Message>
  );
};

const AssistantMessagePart = ({
  detectPullRequestLinks,
  message,
  onReasoningOpenChange,
  onRewind,
  reasoningOpen,
  rewindDisabled
}: {
  detectPullRequestLinks: boolean;
  message: ConversationMessage;
  onReasoningOpenChange: (message: ConversationMessage, open: boolean) => void;
  onRewind?: (message: ConversationMessage) => void;
  reasoningOpen?: boolean;
  rewindDisabled?: boolean;
}) => {
  const isTool = message.role === "tool";
  const isSystem = message.role === "system";
  const isAssistant = message.role === "assistant" || isSystem;
  const isStreaming = message.status === "streaming";
  const content = message.content;
  const reasoning = message.reasoning ?? "";
  const isReasoningOpen = reasoningOpen ?? false;

  return (
    <div className="group/message relative w-full min-w-0 space-y-0.5 overflow-hidden">
      {isAssistant && reasoning ? (
        <Reasoning
          className="w-full min-w-0 overflow-hidden"
          onOpenChange={(open) => onReasoningOpenChange(message, open)}
          open={isReasoningOpen}
        >
          <ReasoningTrigger className="max-w-full">Thinking trace</ReasoningTrigger>
          <ReasoningContent
            className="ml-1 mt-0.5 w-full min-w-0 border-l pl-2"
            contentClassName="w-full min-w-0 max-w-full overflow-hidden py-0.5 text-xs leading-5 break-words prose-p:my-0 prose-pre:my-1.5 prose-ol:my-1 prose-ul:my-1 prose-li:my-0 [&_*]:max-w-full [&_pre]:overflow-x-auto"
            markdown
          >
            {reasoning}
          </ReasoningContent>
        </Reasoning>
      ) : null}

      {isAssistant && isStreaming && !content && !reasoning ? (
        <ThinkingBar className="h-8 w-full max-w-[min(960px,100%)] py-0 text-xs" />
      ) : null}

      {isTool ? (
        <Tool
          className="mt-0.5 w-full max-w-[min(760px,100%)] border-muted-foreground/20 bg-muted/20 shadow-none"
          defaultOpen={false}
          size="compact"
          toolPart={toToolPart(message)}
        />
      ) : content ? (
        <MessageContent
          className={cn(
            "w-full max-w-[min(960px,100%)] overflow-hidden rounded-lg px-3 py-2 text-sm leading-6 prose-p:my-0 prose-pre:my-2 prose-ol:my-1.5 prose-ul:my-1.5 prose-li:my-0 prose-blockquote:my-2 prose-table:my-2 [&_*]:max-w-full [&_pre]:overflow-x-auto",
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

      <MessageStatusActions
        allowCopy={!isTool}
        message={message}
        onRewind={onRewind}
        rewindDisabled={rewindDisabled}
      />
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

const MessageStatusActions = ({
  allowCopy = true,
  message,
  onRewind,
  rewindDisabled
}: {
  allowCopy?: boolean;
  message: ConversationMessage;
  onRewind?: (message: ConversationMessage) => void;
  rewindDisabled?: boolean;
}) => {
  const content = message.content;
  const hasStatus = message.status === "error" || message.status === "stopped";
  const canCopy = allowCopy && Boolean(content);
  const canRewind = Boolean(onRewind) && message.status !== "streaming";

  if (!canCopy && !canRewind && !hasStatus) {
    return null;
  }

  return (
    <MessageActions className="pointer-events-none absolute bottom-1 right-1 z-20 gap-1 text-foreground opacity-0 transition-opacity group-hover/message:pointer-events-auto group-hover/message:opacity-100">
      {message.status === "error" ? <Badge variant="destructive">error</Badge> : null}
      {message.status === "stopped" ? (
        <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50" variant="outline">
          stopped
        </Badge>
      ) : null}
      {canRewind ? (
        <RewindAction
          disabled={rewindDisabled}
          onClick={() => onRewind?.(message)}
        />
      ) : null}
      {canCopy ? <CopyAction value={content} /> : null}
    </MessageActions>
  );
};

const RewindAction = ({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) => {
  return (
    <MessageAction tooltip="Rewind to here">
      <Button
        aria-label="Rewind to this message"
        className="size-6 rounded-md bg-background/75 text-muted-foreground shadow-none backdrop-blur hover:bg-accent hover:text-foreground [&_svg]:size-3.5"
        disabled={disabled}
        onClick={onClick}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <RotateCcw />
      </Button>
    </MessageAction>
  );
};

const CopyAction = ({ value }: { value: string }) => {
  const { copied, copy } = useCopyState();

  return (
    <MessageAction tooltip={copied ? "Copied" : "Copy message"}>
      <Button
        aria-label={copied ? "Copied" : "Copy message"}
        className="size-6 rounded-md bg-background/75 text-muted-foreground shadow-none backdrop-blur hover:bg-accent hover:text-foreground [&_svg]:size-3.5"
        onClick={() => void copy(value)}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        {copied ? <Check /> : <Copy />}
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
