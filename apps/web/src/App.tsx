import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentRun,
  AgentRunMessage,
  CreateLlmEndpointInput,
  CreateSandboxWorkspaceInput,
  GitHubToolTestResult,
  LlmEndpoint,
  LlmEndpointTestResult,
  PublicToolSettings,
  SandboxSettings,
  SandboxWorkspace,
  UpdateGitHubToolSettingsInput
} from "@agent-fleet/shared";
import {
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Folder,
  GitPullRequest,
  Github,
  KeyRound,
  Loader2,
  MessageSquare,
  Network,
  Plus,
  RefreshCw,
  Save,
  Send,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Wrench,
  XCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ChatContainerContent, ChatContainerRoot, ChatContainerScrollAnchor } from "@/components/ui/chat-container";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Message, MessageAction, MessageActions, MessageAvatar, MessageContent } from "@/components/ui/message";
import { PromptInput, PromptInputAction, PromptInputActions, PromptInputTextarea } from "@/components/ui/prompt-input";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ui/reasoning";
import { ScrollButton } from "@/components/ui/scroll-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { SystemMessage } from "@/components/ui/system-message";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type EndpointDraft = {
  name: string;
  baseUrl: string;
  defaultModel: string;
  apiKeyEnvVar: string;
  enabled: boolean;
};

type GitHubToolDraft = {
  enabled: boolean;
  token: string;
  clearToken: boolean;
};

type SandboxWorkspaceDraft = {
  name: string;
  repositoryUrl: string;
  ref: string;
};

const emptyDraft: EndpointDraft = {
  name: "",
  baseUrl: "http://localhost:11434/v1",
  defaultModel: "",
  apiKeyEnvVar: "",
  enabled: true
};

const emptyGitHubToolDraft: GitHubToolDraft = {
  enabled: false,
  token: "",
  clearToken: false
};

const emptySandboxWorkspaceDraft: SandboxWorkspaceDraft = {
  name: "",
  repositoryUrl: "",
  ref: ""
};

export default function App() {
  const [endpoints, setEndpoints] = useState<LlmEndpoint[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EndpointDraft>(emptyDraft);
  const [toolSettings, setToolSettings] = useState<PublicToolSettings | null>(null);
  const [githubDraft, setGithubDraft] = useState<GitHubToolDraft>(emptyGitHubToolDraft);
  const [sandboxSettings, setSandboxSettings] = useState<SandboxSettings | null>(null);
  const [sandboxWorkspaces, setSandboxWorkspaces] = useState<SandboxWorkspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [workspaceDraft, setWorkspaceDraft] = useState<SandboxWorkspaceDraft>(emptySandboxWorkspaceDraft);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [selectedAgentRunId, setSelectedAgentRunId] = useState<string | null>(null);
  const [agentTaskDraft, setAgentTaskDraft] = useState("");
  const [agentReplyDraft, setAgentReplyDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toolSaving, setToolSaving] = useState(false);
  const [workspaceCreating, setWorkspaceCreating] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentRunDeletingId, setAgentRunDeletingId] = useState<string | null>(null);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [githubTesting, setGithubTesting] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, LlmEndpointTestResult>>({});
  const [githubTestResult, setGithubTestResult] = useState<GitHubToolTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toolError, setToolError] = useState<string | null>(null);
  const [sandboxError, setSandboxError] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const selectedWorkspaceIdRef = useRef<string | null>(null);
  const selectedAgentRunIdRef = useRef<string | null>(null);
  const agentStreamAbortRef = useRef<AbortController | null>(null);

  const selectedEndpoint = useMemo(
    () => endpoints.find((endpoint) => endpoint.id === selectedId) ?? null,
    [endpoints, selectedId]
  );

  const enabledCount = endpoints.filter((endpoint) => endpoint.enabled).length;
  const githubReady = Boolean(toolSettings?.github.enabled && toolSettings.github.tokenConfigured);
  const selectedWorkspace = useMemo(
    () => sandboxWorkspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [sandboxWorkspaces, selectedWorkspaceId]
  );
  const selectedAgentRun = useMemo(
    () => agentRuns.find((run) => run.id === selectedAgentRunId) ?? null,
    [agentRuns, selectedAgentRunId]
  );

  const selectEndpoint = useCallback((endpoint: LlmEndpoint) => {
    selectedIdRef.current = endpoint.id;
    setSelectedId(endpoint.id);
    setDraft({
      name: endpoint.name,
      baseUrl: endpoint.baseUrl,
      defaultModel: endpoint.defaultModel,
      apiKeyEnvVar: endpoint.apiKeyEnvVar || "",
      enabled: endpoint.enabled
    });
  }, []);

  const applyToolSettings = useCallback((settings: PublicToolSettings) => {
    setToolSettings(settings);
    setGithubDraft({
      enabled: settings.github.enabled,
      token: "",
      clearToken: false
    });
  }, []);

  const selectWorkspace = useCallback((workspace: SandboxWorkspace) => {
    selectedWorkspaceIdRef.current = workspace.id;
    setSelectedWorkspaceId(workspace.id);
  }, []);

  const selectAgentRun = useCallback((run: AgentRun) => {
    selectedAgentRunIdRef.current = run.id;
    setSelectedAgentRunId(run.id);
  }, []);

  const startNewAgentRun = useCallback(() => {
    selectedAgentRunIdRef.current = null;
    setSelectedAgentRunId(null);
    setAgentReplyDraft("");
    setAgentTaskDraft("");
    setSandboxError(null);
  }, []);

  const applySandboxWorkspaces = useCallback(
    (workspaces: SandboxWorkspace[]) => {
      setSandboxWorkspaces(workspaces);

      const currentId = selectedWorkspaceIdRef.current;
      const next = workspaces.find((workspace) => workspace.id === currentId) ?? workspaces[0] ?? null;

      if (next) {
        selectWorkspace(next);
        return;
      }

      selectedWorkspaceIdRef.current = null;
      setSelectedWorkspaceId(null);
    },
    [selectWorkspace]
  );

  const applyAgentRuns = useCallback(
    (runs: AgentRun[]) => {
      setAgentRuns(runs);

      const currentId = selectedAgentRunIdRef.current;
      const next = runs.find((run) => run.id === currentId) ?? runs[0] ?? null;

      if (next) {
        selectAgentRun(next);
        return;
      }

      selectedAgentRunIdRef.current = null;
      setSelectedAgentRunId(null);
    },
    [selectAgentRun]
  );

  const upsertAgentRun = useCallback(
    (run: AgentRun) => {
      setAgentRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
      selectAgentRun(run);
    },
    [selectAgentRun]
  );

  const updateAgentRunInPlace = useCallback((runId: string, updater: (run: AgentRun) => AgentRun) => {
    setAgentRuns((current) => current.map((run) => (run.id === runId ? updater(run) : run)));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setToolError(null);
    setSandboxError(null);

    try {
      const [
        health,
        endpointResponse,
        toolSettingsResponse,
        sandboxSettingsResponse,
        sandboxWorkspaceResponse,
        agentRunsResponse
      ] = await Promise.all([
        api.health(),
        api.listEndpoints(),
        api.getToolSettings(),
        api.getSandboxSettings(),
        api.listSandboxWorkspaces(),
        api.listAgentRuns()
      ]);

      setApiOnline(health.ok);
      setEndpoints(endpointResponse.endpoints);
      applyToolSettings(toolSettingsResponse.settings);
      setSandboxSettings(sandboxSettingsResponse.settings);
      applySandboxWorkspaces(sandboxWorkspaceResponse.workspaces);
      applyAgentRuns(agentRunsResponse.runs);

      if (!selectedIdRef.current && endpointResponse.endpoints[0]) {
        selectEndpoint(endpointResponse.endpoints[0]);
      }
    } catch (loadError) {
      setApiOnline(false);
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [applyAgentRuns, applySandboxWorkspaces, applyToolSettings, selectEndpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const startNewEndpoint = () => {
    selectedIdRef.current = null;
    setSelectedId(null);
    setDraft(emptyDraft);
    setError(null);
  };

  const selectEndpointById = (id: string) => {
    const endpoint = endpoints.find((item) => item.id === id);

    if (endpoint) {
      selectEndpoint(endpoint);
    }
  };

  const saveEndpoint = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const input = normalizeDraft(draft);
      const response = selectedId
        ? await api.updateEndpoint(selectedId, input)
        : await api.createEndpoint(input);

      const endpointResponse = await api.listEndpoints();
      setEndpoints(endpointResponse.endpoints);
      selectEndpoint(response.endpoint);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const deleteEndpoint = async () => {
    if (!selectedId) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await api.deleteEndpoint(selectedId);
      const response = await api.listEndpoints();
      setEndpoints(response.endpoints);

      if (response.endpoints[0]) {
        selectEndpoint(response.endpoints[0]);
      } else {
        startNewEndpoint();
      }
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setSaving(false);
    }
  };

  const testEndpoint = async (endpoint: LlmEndpoint) => {
    setTestingId(endpoint.id);
    setError(null);

    try {
      const response = await api.testEndpoint(endpoint.id);
      setTestResults((current) => ({
        ...current,
        [endpoint.id]: response.result
      }));
    } catch (testError) {
      setTestResults((current) => ({
        ...current,
        [endpoint.id]: {
          ok: false,
          latencyMs: 0,
          models: [],
          error: getErrorMessage(testError)
        }
      }));
    } finally {
      setTestingId(null);
    }
  };

  const saveGitHubToolSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setToolSaving(true);
    setToolError(null);

    try {
      const response = await api.updateGitHubToolSettings(normalizeGitHubToolDraft(githubDraft));
      applyToolSettings(response.settings);
      setGithubTestResult(null);
    } catch (saveError) {
      setToolError(getErrorMessage(saveError));
    } finally {
      setToolSaving(false);
    }
  };

  const testGitHubTool = async () => {
    setGithubTesting(true);
    setToolError(null);

    try {
      const response = await api.testGitHubTool();
      setGithubTestResult(response.result);
      applyToolSettings(response.settings);
    } catch (testError) {
      setGithubTestResult(null);
      setToolError(getErrorMessage(testError));
    } finally {
      setGithubTesting(false);
    }
  };

  const createWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorkspaceCreating(true);
    setSandboxError(null);

    try {
      const response = await api.createSandboxWorkspace(normalizeWorkspaceDraft(workspaceDraft));
      const listResponse = await api.listSandboxWorkspaces();
      applySandboxWorkspaces(listResponse.workspaces);
      selectWorkspace(response.workspace);
      setWorkspaceDraft(emptySandboxWorkspaceDraft);
    } catch (createError) {
      setSandboxError(getErrorMessage(createError));

      try {
        const listResponse = await api.listSandboxWorkspaces();
        applySandboxWorkspaces(listResponse.workspaces);
      } catch {
        // Keep the original create error visible.
      }
    } finally {
      setWorkspaceCreating(false);
    }
  };

  const deleteWorkspace = async (workspace: SandboxWorkspace) => {
    setWorkspaceCreating(true);
    setSandboxError(null);

    try {
      await api.deleteSandboxWorkspace(workspace.id);
      const response = await api.listSandboxWorkspaces();
      applySandboxWorkspaces(response.workspaces);
    } catch (deleteError) {
      setSandboxError(getErrorMessage(deleteError));
    } finally {
      setWorkspaceCreating(false);
    }
  };

  const createAgentRun = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedWorkspace) {
      return;
    }

    setAgentRunning(true);
    setSandboxError(null);

    try {
      const response = await api.createAgentRun({
        workspaceId: selectedWorkspace.id,
        endpointId: selectedEndpoint?.id,
        title: getAgentRunTitle(agentTaskDraft),
        task: agentTaskDraft
      });

      upsertAgentRun({ ...response.run, status: "running" });
      setAgentTaskDraft("");
      await streamAgentRun(response.run);
    } catch (runError) {
      setSandboxError(getErrorMessage(runError));
    } finally {
      setAgentRunning(false);
    }
  };

  const continueAgentRun = async (run: AgentRun) => {
    await streamAgentRun(run);
  };

  const streamAgentRun = async (run: AgentRun) => {
    const controller = new AbortController();
    const assistantMessageId = `stream-${crypto.randomUUID()}`;
    let toolMessageId: string | null = null;
    let assistantContent = "";

    agentStreamAbortRef.current = controller;
    setAgentRunning(true);
    setSandboxError(null);
    updateAgentRunInPlace(run.id, (current) => ({
      ...current,
      status: "running",
      messages: [
        ...current.messages,
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString()
        }
      ]
    }));

    try {
      await api.streamAgentRun(
        run.id,
        {
          endpointId: selectedEndpoint?.id
        },
        {
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === "run") {
              return;
            }

            if (event.type === "done") {
              upsertAgentRun(event.run);
              return;
            }

            if (event.type === "assistant_delta") {
              assistantContent += event.content;

              updateAgentRunInPlace(run.id, (current) => {
                const existing = current.messages.find((message) => message.id === assistantMessageId);

                if (existing) {
                  return {
                    ...current,
                    status: "running",
                    messages: current.messages.map((message) =>
                      message.id === assistantMessageId ? { ...message, content: assistantContent } : message
                    )
                  };
                }

                return {
                  ...current,
                  status: "running",
                  messages: [
                    ...current.messages,
                    {
                      id: assistantMessageId,
                      role: "assistant",
                      content: assistantContent,
                      createdAt: new Date().toISOString()
                    }
                  ]
                };
              });
              return;
            }

            if (event.type === "tool_start") {
              const now = new Date().toISOString();
              toolMessageId = `tool-${crypto.randomUUID()}`;

              updateAgentRunInPlace(run.id, (current) => ({
                ...current,
                status: "running",
                messages: [
                  ...current.messages,
                  {
                    id: toolMessageId || `tool-${crypto.randomUUID()}`,
                    role: "tool",
                    toolName: event.toolName,
                    content: `Running ${event.toolName}...`,
                    createdAt: now
                  }
                ]
              }));
              return;
            }

            if (event.type === "tool_result") {
              updateAgentRunInPlace(run.id, (current) => ({
                ...current,
                status: "running",
                messages: current.messages.map((message) =>
                  message.id === toolMessageId
                    ? {
                        ...message,
                        content: event.content
                      }
                    : message
                )
              }));
              return;
            }

            if (event.type === "error") {
              if (event.run) {
                upsertAgentRun(event.run);
              }

              throw new Error(event.error);
            }
          }
        }
      );
    } catch (runError) {
      if (!isAbortError(runError)) {
        setSandboxError(getErrorMessage(runError));
      }
    } finally {
      agentStreamAbortRef.current = null;
      setAgentRunning(false);
    }
  };

  const sendAgentMessage = async () => {
    if (!selectedAgentRun || agentRunning || !agentReplyDraft.trim()) {
      return;
    }

    setAgentRunning(true);
    setSandboxError(null);

    try {
      const updated = await api.appendAgentRunMessage(selectedAgentRun.id, {
        content: agentReplyDraft
      });
      setAgentReplyDraft("");
      upsertAgentRun({ ...updated.run, status: "running" });
      await streamAgentRun(updated.run);
    } catch (runError) {
      setSandboxError(getErrorMessage(runError));
    } finally {
      setAgentRunning(false);
    }
  };

  const stopAgentRun = () => {
    agentStreamAbortRef.current?.abort();
  };

  const deleteAgentRun = async (run: AgentRun) => {
    setAgentRunDeletingId(run.id);
    setSandboxError(null);

    try {
      await api.deleteAgentRun(run.id);
      const runsResponse = await api.listAgentRuns();
      applyAgentRuns(runsResponse.runs);
    } catch (deleteError) {
      setSandboxError(getErrorMessage(deleteError));
    } finally {
      setAgentRunDeletingId(null);
    }
  };

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-background">
      <section className="shrink-0 border-b bg-background">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Network className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-normal">Agent Fleet Control Plane</h1>
              <p className="text-sm text-muted-foreground">LLM endpoints</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge online={apiOnline} />
            <Badge variant="secondary">{endpoints.length} endpoints</Badge>
            <StateBadge tone={enabledCount > 0 ? "success" : "warning"}>{enabledCount} enabled</StateBadge>
            <StateBadge tone={githubReady ? "success" : "warning"}>{githubReady ? "GitHub ready" : "GitHub missing"}</StateBadge>
            <Badge variant="secondary">{sandboxWorkspaces.length} sandboxes</Badge>
            <Button variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Refresh
            </Button>
          </div>
        </div>
      </section>

      <Tabs className="mx-auto flex min-h-0 w-full max-w-[1500px] flex-1 flex-col gap-3 overflow-hidden px-4 py-3 sm:px-6 lg:px-8" defaultValue="chat">
        <div className="flex shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <TabsList className="max-w-full justify-start overflow-x-auto">
            <TabsTrigger className="gap-2" value="chat">
              <MessageSquare className="h-4 w-4" />
              Chat
            </TabsTrigger>
            <TabsTrigger className="gap-2" value="settings">
              <Settings className="h-4 w-4" />
              Endpoint Settings
            </TabsTrigger>
            <TabsTrigger className="gap-2" value="tools">
              <Wrench className="h-4 w-4" />
              Tool Settings
            </TabsTrigger>
            <TabsTrigger className="gap-2" value="workspaces">
              <Folder className="h-4 w-4" />
              Workspaces
            </TabsTrigger>
            <TabsTrigger className="gap-2" value="sandbox">
              <Terminal className="h-4 w-4" />
              Agent Sandbox
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-col gap-2 md:w-[420px]">
            <Label className="text-xs text-muted-foreground">Active endpoint</Label>
            <Select disabled={!endpoints.length || loading} onValueChange={selectEndpointById} value={selectedId ?? undefined}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder={loading ? "Loading endpoints..." : "Select endpoint"} />
              </SelectTrigger>
              <SelectContent>
                {endpoints.map((endpoint) => (
                  <SelectItem key={endpoint.id} value={endpoint.id}>
                    {endpoint.name} / {endpoint.defaultModel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col" value="chat">
          <ChatPanel endpoint={selectedEndpoint} />
        </TabsContent>

        <TabsContent className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=active]:block" value="settings">
          <section className="grid h-full min-h-0 overflow-y-auto border bg-background lg:grid-cols-[minmax(0,1fr)_420px] lg:overflow-hidden">
            <div className="flex min-h-[320px] flex-col lg:min-h-0">
              <div className="flex items-center justify-between border-b p-4">
                <h2 className="text-base font-semibold">Endpoints</h2>
                <Button variant="secondary" onClick={startNewEndpoint} size="sm">
                  <Plus />
                  New
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="space-y-2 p-3">
                  {error ? (
                    <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {error}
                    </div>
                  ) : null}

                  {loading ? (
                    <div className="grid gap-2">
                      {[0, 1, 2].map((item) => (
                        <div key={item} className="h-24 animate-pulse rounded-md border bg-muted/40" />
                      ))}
                    </div>
                  ) : endpoints.length > 0 ? (
                    <div className="grid gap-2">
                      {endpoints.map((endpoint) => (
                        <EndpointCard
                          endpoint={endpoint}
                          key={endpoint.id}
                          selected={endpoint.id === selectedId}
                          testResult={testResults[endpoint.id]}
                          testing={testingId === endpoint.id}
                          onSelect={() => selectEndpoint(endpoint)}
                          onTest={() => void testEndpoint(endpoint)}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState>No endpoints</EmptyState>
                  )}
                </div>
              </div>
            </div>

            <aside className="min-h-0 overflow-y-auto border-t bg-muted/20 p-4 lg:border-l lg:border-t-0">
              <div className="mb-4">
                <h2 className="text-base font-semibold">{selectedEndpoint ? "Endpoint settings" : "New endpoint"}</h2>
              </div>
                <form className="space-y-4" onSubmit={saveEndpoint}>
                  <Field label="Name">
                    <Input
                      value={draft.name}
                      onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Ollama Local"
                      required
                    />
                  </Field>

                  <Field label="Base URL">
                    <Input
                      value={draft.baseUrl}
                      onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))}
                      placeholder="http://localhost:11434/v1"
                      required
                    />
                  </Field>

                  <Field label="Default model">
                    <Input
                      value={draft.defaultModel}
                      onChange={(event) => setDraft((current) => ({ ...current, defaultModel: event.target.value }))}
                      placeholder="llama3.1"
                      required
                    />
                  </Field>

                  <Field label="API key env">
                    <Input
                      value={draft.apiKeyEnvVar || ""}
                      onChange={(event) => setDraft((current) => ({ ...current, apiKeyEnvVar: event.target.value }))}
                      placeholder="LOCAL_LLM_API_KEY"
                    />
                  </Field>

                  <label className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    <span className="font-medium">Enabled</span>
                    <input
                      checked={draft.enabled}
                      className="h-4 w-4 accent-primary"
                      onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
                      type="checkbox"
                    />
                  </label>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button className="flex-1" disabled={saving} type="submit">
                      {saving ? <Loader2 className="animate-spin" /> : <Save />}
                      Save
                    </Button>
                    {selectedEndpoint ? (
                      <Button disabled={saving} onClick={() => void deleteEndpoint()} type="button" variant="destructive">
                        <Trash2 />
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </form>
            </aside>
          </section>
        </TabsContent>

        <TabsContent className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=active]:block" value="tools">
          <ToolSettingsPanel
            draft={githubDraft}
            error={toolError}
            onChange={setGithubDraft}
            onSubmit={saveGitHubToolSettings}
            onTest={() => void testGitHubTool()}
            saving={toolSaving}
            settings={toolSettings}
            testResult={githubTestResult}
            testing={githubTesting}
          />
        </TabsContent>

        <TabsContent className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=active]:block" value="workspaces">
          <WorkspaceManagementPanel
            error={sandboxError}
            onCreateWorkspace={createWorkspace}
            onDeleteWorkspace={(workspace) => void deleteWorkspace(workspace)}
            onSelectWorkspace={selectWorkspace}
            onWorkspaceDraftChange={setWorkspaceDraft}
            selectedWorkspace={selectedWorkspace}
            settings={sandboxSettings}
            workspaceCreating={workspaceCreating}
            workspaceDraft={workspaceDraft}
            workspaces={sandboxWorkspaces}
          />
        </TabsContent>

        <TabsContent className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=active]:block" value="sandbox">
          <SandboxPanel
            agentReplyDraft={agentReplyDraft}
            agentRunning={agentRunning}
            agentTaskDraft={agentTaskDraft}
            endpoint={selectedEndpoint}
            error={sandboxError}
            onAgentReplyChange={setAgentReplyDraft}
            onAgentTaskChange={setAgentTaskDraft}
            onContinueAgentRun={(run) => void continueAgentRun(run)}
            onDeleteAgentRun={(run) => void deleteAgentRun(run)}
            onCreateAgentRun={createAgentRun}
            onSendAgentMessage={() => void sendAgentMessage()}
            onSelectAgentRun={selectAgentRun}
            onStartNewAgentRun={startNewAgentRun}
            onStopAgentRun={stopAgentRun}
            runs={agentRuns}
            runDeletingId={agentRunDeletingId}
            selectedRun={selectedAgentRun}
            selectedWorkspace={selectedWorkspace}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}

type SandboxPanelProps = {
  agentReplyDraft: string;
  agentRunning: boolean;
  agentTaskDraft: string;
  endpoint: LlmEndpoint | null;
  error: string | null;
  onAgentReplyChange: (value: string) => void;
  onAgentTaskChange: (value: string) => void;
  onContinueAgentRun: (run: AgentRun) => void;
  onDeleteAgentRun: (run: AgentRun) => void;
  onCreateAgentRun: (event: FormEvent<HTMLFormElement>) => void;
  onSendAgentMessage: () => void;
  onSelectAgentRun: (run: AgentRun) => void;
  onStartNewAgentRun: () => void;
  onStopAgentRun: () => void;
  runs: AgentRun[];
  runDeletingId: string | null;
  selectedRun: AgentRun | null;
  selectedWorkspace: SandboxWorkspace | null;
};

type WorkspaceManagementPanelProps = {
  error: string | null;
  onCreateWorkspace: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteWorkspace: (workspace: SandboxWorkspace) => void;
  onSelectWorkspace: (workspace: SandboxWorkspace) => void;
  onWorkspaceDraftChange: (draft: SandboxWorkspaceDraft) => void;
  selectedWorkspace: SandboxWorkspace | null;
  settings: SandboxSettings | null;
  workspaceCreating: boolean;
  workspaceDraft: SandboxWorkspaceDraft;
  workspaces: SandboxWorkspace[];
};

const WorkspaceManagementPanel = ({
  error,
  onCreateWorkspace,
  onDeleteWorkspace,
  onSelectWorkspace,
  onWorkspaceDraftChange,
  selectedWorkspace,
  settings,
  workspaceCreating,
  workspaceDraft,
  workspaces
}: WorkspaceManagementPanelProps) => {
  return (
    <section className="grid h-full min-h-0 overflow-y-auto border bg-background lg:grid-cols-[minmax(0,1fr)_420px] lg:overflow-hidden">
      <div className="flex min-h-[320px] flex-col lg:min-h-0">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Folder className="h-4 w-4" />
            Workspaces
          </h2>
          <Badge variant="secondary">{workspaces.length} total</Badge>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-2 p-3">
            {error ? (
              <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {workspaces.length ? (
              workspaces.map((workspace) => (
                <SandboxWorkspaceCard
                  key={workspace.id}
                  onDelete={() => onDeleteWorkspace(workspace)}
                  onSelect={() => onSelectWorkspace(workspace)}
                  selected={selectedWorkspace?.id === workspace.id}
                  workspace={workspace}
                />
              ))
            ) : (
              <EmptyState>No workspaces</EmptyState>
            )}
          </div>
        </div>
      </div>

      <aside className="min-h-0 overflow-y-auto border-t bg-muted/20 lg:border-l lg:border-t-0">
        <section className="border-b p-4">
          <h2 className="mb-4 text-base font-semibold">New workspace</h2>
          <form className="space-y-4" onSubmit={onCreateWorkspace}>
            <Field label="Name">
              <Input
                onChange={(event) => onWorkspaceDraftChange({ ...workspaceDraft, name: event.target.value })}
                placeholder="agent-run"
                value={workspaceDraft.name}
              />
            </Field>
            <Field label="Repository URL">
              <Input
                onChange={(event) => onWorkspaceDraftChange({ ...workspaceDraft, repositoryUrl: event.target.value })}
                placeholder="https://github.com/org/repo.git"
                value={workspaceDraft.repositoryUrl}
              />
            </Field>
            <Field label="Ref">
              <Input
                onChange={(event) => onWorkspaceDraftChange({ ...workspaceDraft, ref: event.target.value })}
                placeholder="main"
                value={workspaceDraft.ref}
              />
            </Field>
            <Button className="w-full" disabled={workspaceCreating} type="submit">
              {workspaceCreating ? <Loader2 className="animate-spin" /> : <Plus />}
              Create
            </Button>
          </form>
        </section>

        <section className="border-b p-4">
          <h2 className="mb-4 text-base font-semibold">Selected workspace</h2>
          <div className="space-y-3">
            {selectedWorkspace ? (
              <>
                <ToolStatusRow label="Name" value={selectedWorkspace.name} />
                <ToolStatusRow label="Status" value={selectedWorkspace.status} />
                <ToolStatusRow label="Source" value={selectedWorkspace.repositoryUrl || selectedWorkspace.path} />
                <ToolStatusRow label="Ref" value={selectedWorkspace.ref || "Default"} />
              </>
            ) : (
              <EmptyState>Select or create a workspace</EmptyState>
            )}
          </div>
        </section>

        <section className="p-4">
          <h2 className="mb-4 text-base font-semibold">Sandbox policy</h2>
          <div className="grid gap-3">
            <ToolStatusRow label="Root" value={settings?.rootDir || "Loading"} />
            <ToolStatusRow label="Timeout" value={settings ? `${settings.defaultTimeoutMs} ms` : "Loading"} />
            <ToolStatusRow label="Tools" value={settings?.allowedCommands.join(", ") || "Loading"} />
            <ToolStatusRow label="Output" value={settings ? `${settings.maxOutputBytes} bytes` : "Loading"} />
          </div>
        </section>
      </aside>
    </section>
  );
};

const SandboxPanel = ({
  agentReplyDraft,
  agentRunning,
  agentTaskDraft,
  endpoint,
  error,
  onAgentReplyChange,
  onAgentTaskChange,
  onContinueAgentRun,
  onDeleteAgentRun,
  onCreateAgentRun,
  onSendAgentMessage,
  onSelectAgentRun,
  onStartNewAgentRun,
  onStopAgentRun,
  runs,
  runDeletingId,
  selectedRun,
  selectedWorkspace
}: SandboxPanelProps) => {
  return (
    <section className="grid h-full min-h-0 overflow-y-auto border bg-background xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)] xl:overflow-hidden">
      <div className="flex min-h-[260px] flex-col border-b xl:min-h-0 xl:border-b-0 xl:border-r">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Bot className="h-4 w-4" />
            Agent runs
          </h2>
          <Button disabled={agentRunning} onClick={onStartNewAgentRun} size="sm" type="button" variant="secondary">
            <Plus />
            New
          </Button>
        </div>
        <div className="min-h-[220px] flex-1 overflow-y-auto">
          <div className="space-y-2 p-3">
            {runs.length ? (
              runs.map((run) => (
                <AgentRunCard
                  deleting={runDeletingId === run.id}
                  key={run.id}
                  onDelete={() => onDeleteAgentRun(run)}
                  onSelect={() => onSelectAgentRun(run)}
                  run={run}
                  selected={selectedRun?.id === run.id}
                />
              ))
            ) : (
              <EmptyState>No runs</EmptyState>
            )}
          </div>
        </div>
      </div>

      <div className="flex min-h-[560px] flex-col xl:min-h-0">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Bot className="h-4 w-4" />
            Coding agent
          </h2>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {endpoint ? <Badge variant="secondary">{endpoint.defaultModel}</Badge> : null}
            {selectedWorkspace ? <Badge variant="outline">{selectedWorkspace.name}</Badge> : <StateBadge tone="warning">No workspace</StateBadge>}
            {selectedRun ? <AgentRunStatusBadge status={selectedRun.status} /> : null}
          </div>
        </div>
        <div className="min-h-0 flex-1">
          {selectedRun ? (
            <AgentConversation
              draft={agentReplyDraft}
              endpoint={endpoint}
              error={error}
              isStreaming={agentRunning}
              onChange={onAgentReplyChange}
              onContinue={() => onContinueAgentRun(selectedRun)}
              onSend={onSendAgentMessage}
              onStop={onStopAgentRun}
              run={selectedRun}
            />
          ) : (
            <form className="space-y-4 p-4" onSubmit={onCreateAgentRun}>
              <Field label="New task">
                <Textarea
                  className="min-h-[180px] bg-background"
                  onChange={(event) => onAgentTaskChange(event.target.value)}
                  placeholder="Implement the requested change, run verification, commit to a branch, push, and open a PR."
                  required
                  value={agentTaskDraft}
                />
              </Field>
              {error ? (
                <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              ) : null}
              <Button disabled={agentRunning || !selectedWorkspace || !endpoint || selectedWorkspace.status !== "ready"} type="submit">
                {agentRunning ? <Loader2 className="animate-spin" /> : <Bot />}
                Start agent run
              </Button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
};

type AgentConversationProps = {
  draft: string;
  endpoint: LlmEndpoint | null;
  error: string | null;
  isStreaming: boolean;
  onChange: (value: string) => void;
  onContinue: () => void;
  onSend: () => void;
  onStop: () => void;
  run: AgentRun;
};

const AgentConversation = ({
  draft,
  endpoint,
  error,
  isStreaming,
  onChange,
  onContinue,
  onSend,
  onStop,
  run
}: AgentConversationProps) => {
  const canUseEndpoint = Boolean(endpoint?.enabled);
  const canContinue = canUseEndpoint && !isStreaming && run.status !== "completed";
  const canSend = canUseEndpoint && !isStreaming && Boolean(draft.trim()) && run.status !== "completed";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {error ? (
        <SystemMessage className="mx-4 mt-4" fill variant="error">
          {error}
        </SystemMessage>
      ) : null}

      <div className="min-h-0 flex-1">
        <ChatContainerRoot className="relative h-full">
          <ChatContainerContent className="mx-auto w-full max-w-4xl gap-4 px-4 py-5">
            {run.messages.length === 0 ? (
              <div className="flex min-h-[42vh] flex-col items-center justify-center gap-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-card text-primary shadow-sm">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold">Start the coding thread</h3>
                  <p className="max-w-md text-sm text-muted-foreground">
                    The agent can inspect files, edit code, run checks, and report progress in this conversation.
                  </p>
                </div>
              </div>
            ) : (
              run.messages.map((message) => <AgentMessageBubble key={message.id} message={message} />)
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
          disabled={!canUseEndpoint || run.status === "completed"}
          isLoading={isStreaming}
          onSubmit={() => {
            if (canSend) {
              onSend();
            }
          }}
          onValueChange={onChange}
          value={draft}
        >
          <PromptInputTextarea
            placeholder={
              canUseEndpoint
                ? "Reply to the coding agent or add constraints..."
                : "Select an enabled endpoint before continuing"
            }
          />
          <div className="flex min-h-10 items-center justify-between gap-3 px-2 pb-1">
            <div className="truncate text-xs text-muted-foreground">
              {endpoint ? `${endpoint.baseUrl} · ${endpoint.defaultModel}` : "Select an enabled endpoint"}
            </div>
            <PromptInputActions>
              <PromptInputAction tooltip="Continue run">
                <Button disabled={!canContinue} onClick={onContinue} size="icon" type="button" variant="outline">
                  <RefreshCw />
                </Button>
              </PromptInputAction>
              {isStreaming ? (
                <PromptInputAction tooltip="Stop response">
                  <Button onClick={onStop} size="icon" type="button" variant="outline">
                    <Square />
                  </Button>
                </PromptInputAction>
              ) : (
                <PromptInputAction tooltip="Send message">
                  <Button disabled={!canSend} onClick={onSend} size="icon" type="button">
                    <Send />
                  </Button>
                </PromptInputAction>
              )}
            </PromptInputActions>
          </div>
        </PromptInput>
      </div>
    </div>
  );
};

const AgentRunCard = ({
  deleting,
  onDelete,
  onSelect,
  run,
  selected
}: {
  deleting: boolean;
  onDelete: () => void;
  onSelect: () => void;
  run: AgentRun;
  selected: boolean;
}) => {
  return (
    <div className={cn("rounded-md border bg-background p-3 transition-colors", selected && "border-primary ring-1 ring-primary")}>
      <div className="flex items-start justify-between gap-3">
        <button className="min-w-0 flex-1 text-left" onClick={onSelect} type="button">
          <div className="flex flex-wrap items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <h3 className="truncate text-sm font-semibold">{run.title}</h3>
            <AgentRunStatusBadge status={run.status} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(run.updatedAt)}</p>
        </button>
        <Button disabled={deleting} onClick={onDelete} size="icon" type="button" variant="ghost">
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};

const AgentRunStatusBadge = ({ status }: { status: AgentRun["status"] }) => {
  if (status === "completed") {
    return <StateBadge tone="success">completed</StateBadge>;
  }

  if (status === "running") {
    return <Badge variant="secondary">running</Badge>;
  }

  if (status === "failed") {
    return <Badge variant="destructive">failed</Badge>;
  }

  return <StateBadge tone="warning">{status}</StateBadge>;
};

const AgentMessageBubble = ({ message }: { message: AgentRunMessage }) => {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";
  const isSystem = message.role === "system";
  const isAssistant = message.role === "assistant" || isSystem;
  const isStreamingPlaceholder = message.id.startsWith("stream-");
  const parsed = isAssistant ? splitThinking(message.content, "") : { content: message.content, reasoning: "" };
  const content = parsed.content;

  return (
    <Message className={cn("group", isUser && "justify-end")}>
      {!isUser ? <MessageAvatar alt={isTool ? "Tool" : "Assistant"} fallback={isTool ? "TL" : "AI"} src="" /> : null}
      <div className={cn("min-w-0 space-y-2", isUser && "flex max-w-[760px] flex-col items-end")}>
        <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", isUser && "justify-end")}>
          {isTool ? (
            <Wrench className="h-3.5 w-3.5" />
          ) : isUser ? (
            <MessageSquare className="h-3.5 w-3.5" />
          ) : (
            <Bot className="h-3.5 w-3.5" />
          )}
          <span>{isTool ? message.toolName || "tool" : isSystem ? "system" : message.role}</span>
          <span>{formatDateTime(message.createdAt)}</span>
        </div>

        {isAssistant && parsed.reasoning ? (
          <Reasoning isStreaming={isStreamingPlaceholder} {...(isStreamingPlaceholder ? { open: true } : {})}>
            <ReasoningTrigger className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              {isStreamingPlaceholder ? "Thinking" : "Thinking trace"}
            </ReasoningTrigger>
            <ReasoningContent className="rounded-md border border-t-0 bg-muted/20 px-3" contentClassName="py-3" markdown>
              {parsed.reasoning}
            </ReasoningContent>
          </Reasoning>
        ) : null}

        {isAssistant && isStreamingPlaceholder && !content ? (
          <SystemMessage fill icon={<Loader2 className="size-4 animate-spin" />}>
            Thinking
          </SystemMessage>
        ) : null}

        {content ? (
          <MessageContent
            className={cn(
              "max-w-[min(760px,100%)] rounded-lg px-4 py-3 text-sm leading-6",
              isUser && "bg-primary text-primary-foreground prose-invert",
              isTool && "bg-muted font-mono text-xs leading-5 whitespace-pre-wrap",
              isSystem && "border-destructive/25 bg-destructive/10 text-destructive"
            )}
            id={message.id}
            markdown={isAssistant}
          >
            {content}
          </MessageContent>
        ) : null}

        {content.includes("https://github.com/") ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GitPullRequest className="h-3.5 w-3.5" />
            PR/reference detected
          </div>
        ) : null}

        <MessageActions className={cn("opacity-0 transition-opacity group-hover:opacity-100", isUser && "justify-end")}>
          {isStreamingPlaceholder ? <Badge variant="secondary">streaming</Badge> : null}
          {content ? <CopyAction value={content} /> : null}
        </MessageActions>
      </div>
      {isUser ? <MessageAvatar alt="You" fallback="ME" src="" /> : null}
    </Message>
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

const SandboxWorkspaceCard = ({
  onDelete,
  onSelect,
  selected,
  workspace
}: {
  onDelete: () => void;
  onSelect: () => void;
  selected: boolean;
  workspace: SandboxWorkspace;
}) => {
  return (
    <div className={cn("rounded-md border bg-background p-3 transition-colors", selected && "border-primary ring-1 ring-primary")}>
      <div className="flex items-start justify-between gap-3">
        <button className="min-w-0 flex-1 text-left" onClick={onSelect} type="button">
          <div className="flex flex-wrap items-center gap-2">
            <Folder className="h-4 w-4 text-primary" />
            <h3 className="truncate text-base font-semibold">{workspace.name}</h3>
            <StateBadge tone={workspace.status === "ready" ? "success" : "warning"}>{workspace.status}</StateBadge>
          </div>
          <div className="mt-2 grid gap-1 text-sm text-muted-foreground">
            <span className="truncate">{workspace.repositoryUrl || workspace.path}</span>
            {workspace.ref ? <span className="truncate">{workspace.ref}</span> : null}
          </div>
        </button>
        <Button onClick={onDelete} size="icon" type="button" variant="ghost">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {workspace.error ? <p className="mt-3 text-sm text-destructive">{workspace.error}</p> : null}
    </div>
  );
};

type ToolSettingsPanelProps = {
  draft: GitHubToolDraft;
  error: string | null;
  onChange: (draft: GitHubToolDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTest: () => void;
  saving: boolean;
  settings: PublicToolSettings | null;
  testResult: GitHubToolTestResult | null;
  testing: boolean;
};

const ToolSettingsPanel = ({
  draft,
  error,
  onChange,
  onSubmit,
  onTest,
  saving,
  settings,
  testResult,
  testing
}: ToolSettingsPanelProps) => {
  const github = settings?.github;
  const tokenInputDisabled = draft.clearToken && !draft.token;
  const ready = Boolean(github?.enabled && github.tokenConfigured);

  return (
    <section className="grid h-full min-h-0 overflow-y-auto border bg-background lg:grid-cols-[minmax(0,1fr)_420px] lg:overflow-hidden">
      <div className="min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Github className="h-4 w-4" />
            GitHub
          </h2>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <StateBadge tone={draft.enabled ? "success" : "warning"}>{draft.enabled ? "Enabled" : "Disabled"}</StateBadge>
            <StateBadge tone={github?.tokenConfigured ? "success" : "warning"}>
              {github?.tokenConfigured ? "PAT configured" : "PAT missing"}
            </StateBadge>
            {testResult ? <GitHubTestBadge result={testResult} /> : null}
          </div>
        </div>
        <div className="p-4">
          <form className="space-y-4" onSubmit={onSubmit}>
            <label className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">Enabled</span>
              <input
                checked={draft.enabled}
                className="h-4 w-4 accent-primary"
                onChange={(event) => onChange({ ...draft, enabled: event.target.checked })}
                type="checkbox"
              />
            </label>

            <Field label="Personal access token">
              <Input
                autoComplete="off"
                disabled={tokenInputDisabled}
                onChange={(event) => onChange({ ...draft, clearToken: false, token: event.target.value })}
                placeholder={github?.tokenConfigured ? "Stored token configured" : "github_pat_..."}
                spellCheck={false}
                type="password"
                value={draft.token}
              />
            </Field>

            {github?.tokenConfigured ? (
              <label className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="font-medium">Clear stored PAT</span>
                <input
                  checked={draft.clearToken}
                  className="h-4 w-4 accent-primary"
                  disabled={Boolean(draft.token.trim())}
                  onChange={(event) => onChange({ ...draft, clearToken: event.target.checked })}
                  type="checkbox"
                />
              </label>
            ) : null}

            {error ? (
              <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {testResult?.error ? <p className="text-sm text-destructive">{testResult.error}</p> : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1" disabled={saving} type="submit">
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                Save
              </Button>
              <Button disabled={testing || !github?.tokenConfigured || !draft.enabled} onClick={onTest} type="button" variant="outline">
                {testing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Test
              </Button>
            </div>
          </form>
        </div>
      </div>

      <aside className="min-h-0 overflow-y-auto border-t bg-muted/20 p-4 lg:border-l lg:border-t-0">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
          <ShieldCheck className="h-4 w-4" />
          Git clone readiness
        </h2>
        <div className="space-y-3">
          <ToolStatusRow label="Status" value={ready ? "Ready" : "Not ready"} />
          <ToolStatusRow icon={<KeyRound className="h-4 w-4" />} label="Credential" value={github?.tokenPreview || "Missing"} />
          <ToolStatusRow label="Account" value={github?.username || "Not validated"} />
          <ToolStatusRow label="Scopes" value={github?.scopes.length ? github.scopes.join(", ") : "Not reported"} />
          <ToolStatusRow label="Last validation" value={formatDateTime(github?.validatedAt)} />
        </div>
      </aside>
    </section>
  );
};

type EndpointCardProps = {
  endpoint: LlmEndpoint;
  selected: boolean;
  testResult?: LlmEndpointTestResult;
  testing: boolean;
  onSelect: () => void;
  onTest: () => void;
};

const EndpointCard = ({ endpoint, selected, testResult, testing, onSelect, onTest }: EndpointCardProps) => {
  return (
    <div className={cn("rounded-md border bg-background p-3 transition-colors", selected && "border-primary ring-1 ring-primary")}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <button className="min-w-0 flex-1 text-left" onClick={onSelect} type="button">
          <div className="flex flex-wrap items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            <h3 className="truncate text-base font-semibold">{endpoint.name}</h3>
            <StateBadge tone={endpoint.enabled ? "success" : "warning"}>{endpoint.enabled ? "Enabled" : "Disabled"}</StateBadge>
          </div>
          <div className="mt-2 grid gap-1 text-sm text-muted-foreground">
            <span className="truncate">{endpoint.baseUrl}</span>
            <span className="truncate">{endpoint.defaultModel}</span>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {testResult ? <TestBadge result={testResult} /> : null}
          <Button disabled={testing || !endpoint.enabled} onClick={onTest} type="button" variant="outline">
            {testing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Test
          </Button>
        </div>
      </div>

      {testResult?.models.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {testResult.models.slice(0, 8).map((model) => (
            <Badge key={model} variant="secondary">
              {model}
            </Badge>
          ))}
        </div>
      ) : null}

      {testResult?.error ? <p className="mt-3 text-sm text-destructive">{testResult.error}</p> : null}
    </div>
  );
};

const Field = ({ children, label }: { children: ReactNode; label: string }) => {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
};

const EmptyState = ({ children }: { children: ReactNode }) => {
  return (
    <div className="rounded-md border border-dashed bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
};

const StateBadge = ({ children, tone }: { children: ReactNode; tone: "success" | "warning" }) => {
  return (
    <Badge
      className={cn(
        "hover:bg-current/0",
        tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50"
      )}
      variant="outline"
    >
      {children}
    </Badge>
  );
};

const StatusBadge = ({ online }: { online: boolean | null }) => {
  if (online === null) {
    return <Badge variant="secondary">API pending</Badge>;
  }

  return online ? (
    <Badge className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50" variant="outline">
      <CheckCircle2 className="h-3.5 w-3.5" />
      API online
    </Badge>
  ) : (
    <Badge className="gap-1" variant="destructive">
      <XCircle className="h-3.5 w-3.5" />
      API offline
    </Badge>
  );
};

const TestBadge = ({ result }: { result: LlmEndpointTestResult }) => {
  return result.ok ? (
    <Badge className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50" variant="outline">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {result.latencyMs} ms
    </Badge>
  ) : (
    <Badge className="gap-1" variant="destructive">
      <XCircle className="h-3.5 w-3.5" />
      Failed
    </Badge>
  );
};

const GitHubTestBadge = ({ result }: { result: GitHubToolTestResult }) => {
  return result.ok ? (
    <Badge className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50" variant="outline">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {result.latencyMs} ms
    </Badge>
  ) : (
    <Badge className="gap-1" variant="destructive">
      <XCircle className="h-3.5 w-3.5" />
      Failed
    </Badge>
  );
};

const ToolStatusRow = ({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) => {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
      <span className="flex shrink-0 items-center gap-2 font-medium">
        {icon}
        {label}
      </span>
      <span className="min-w-0 break-words text-right text-muted-foreground">{value}</span>
    </div>
  );
};

const normalizeDraft = (draft: EndpointDraft): CreateLlmEndpointInput => ({
  ...draft,
  apiKeyEnvVar: draft.apiKeyEnvVar?.trim() || undefined,
  baseUrl: draft.baseUrl.trim(),
  defaultModel: draft.defaultModel.trim(),
  name: draft.name.trim()
});

const normalizeGitHubToolDraft = (draft: GitHubToolDraft): UpdateGitHubToolSettingsInput => {
  const token = draft.token.trim();
  const input: UpdateGitHubToolSettingsInput = {
    enabled: draft.enabled
  };

  if (token) {
    input.token = token;
    return input;
  }

  if (draft.clearToken) {
    input.clearToken = true;
  }

  return input;
};

const normalizeWorkspaceDraft = (draft: SandboxWorkspaceDraft): CreateSandboxWorkspaceInput => ({
  name: draft.name.trim() || undefined,
  repositoryUrl: draft.repositoryUrl.trim() || undefined,
  ref: draft.ref.trim() || undefined
});

const getAgentRunTitle = (task: string) => {
  return task.split("\n").find(Boolean)?.slice(0, 80) || "Agent task";
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

const formatDateTime = (value?: string) => {
  if (!value) {
    return "Never";
  }

  return new Date(value).toLocaleString();
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
};
