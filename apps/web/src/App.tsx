import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AgentProject,
  AgentRun,
  CreateLlmEndpointInput,
  CreateSandboxWorkspaceInput,
  GitHubToolTestResult,
  Issue,
  IssueStatus,
  LlmEndpoint,
  LlmEndpointTestResult,
  PublicToolSettings,
  SandboxSettings,
  SandboxWorkspace,
  UpdateGitHubToolSettingsInput
} from "@agent-fleet/shared";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Folder,
  Github,
  KeyRound,
  ClipboardList,
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
import { parseAsString, useQueryState } from "nuqs";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatConversation, type ConversationMessage } from "@/components/chat/chat-conversation";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ProjectDetailPage, ProjectsListPage, type ProjectDetailTab } from "@/components/issues/issues-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Markdown } from "@/components/ui/markdown";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PromptInputAction } from "@/components/ui/prompt-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { normalizeAgentAssistantDisplay, splitThinking } from "@/lib/chat-format";
import { queryKeys } from "@/lib/query-client";
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

type AppView = "chat" | "projects" | "workspaces" | "sandbox" | "settings";

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

const navigationItems = [
  { value: "chat", label: "Chat", icon: MessageSquare, path: "/chat" },
  { value: "projects", label: "Projects", icon: ClipboardList, path: "/projects" },
  { value: "sandbox", label: "Agent Tasks", icon: Terminal, path: "/agent" },
  { value: "settings", label: "Settings", icon: Settings, path: "/settings/endpoints" }
] satisfies Array<{ value: AppView; label: string; icon: typeof MessageSquare; path: string }>;

const settingsPages = [
  { value: "endpoints", label: "Endpoints", icon: Server, path: "/settings/endpoints" },
  { value: "tools", label: "Tools", icon: Wrench, path: "/settings/tools" }
] satisfies Array<{ value: string; label: string; icon: typeof MessageSquare; path: string }>;

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchingCount = useIsFetching();
  const [selectedId, setSelectedId] = useQueryState("endpoint", parseAsString.withOptions({ history: "replace", shallow: true }));
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useQueryState(
    "workspace",
    parseAsString.withOptions({ history: "replace", shallow: true })
  );
  const [selectedAgentRunId, setSelectedAgentRunId] = useQueryState("run", parseAsString.withOptions({ history: "replace", shallow: true }));
  const [selectedIssueId, setSelectedIssueId] = useQueryState("issue", parseAsString.withOptions({ history: "replace", shallow: true }));
  const [draft, setDraft] = useState<EndpointDraft>(emptyDraft);
  const [githubDraft, setGithubDraft] = useState<GitHubToolDraft>(emptyGitHubToolDraft);
  const [workspaceDraft, setWorkspaceDraft] = useState<SandboxWorkspaceDraft>(emptySandboxWorkspaceDraft);
  const [agentTaskDraft, setAgentTaskDraft] = useState("");
  const [agentReplyDraft, setAgentReplyDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [toolSaving, setToolSaving] = useState(false);
  const [workspaceCreating, setWorkspaceCreating] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentRunDeletingId, setAgentRunDeletingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [githubTesting, setGithubTesting] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, LlmEndpointTestResult>>({});
  const [githubTestResult, setGithubTestResult] = useState<GitHubToolTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toolError, setToolError] = useState<string | null>(null);
  const [sandboxError, setSandboxError] = useState<string | null>(null);
  const agentStreamAbortRef = useRef<AbortController | null>(null);
  const healthQuery = useQuery({ queryKey: queryKeys.health, queryFn: api.health });
  const endpointsQuery = useQuery({ queryKey: queryKeys.endpoints, queryFn: api.listEndpoints });
  const toolSettingsQuery = useQuery({ queryKey: queryKeys.toolSettings, queryFn: api.getToolSettings });
  const sandboxSettingsQuery = useQuery({ queryKey: queryKeys.sandboxSettings, queryFn: api.getSandboxSettings });
  const sandboxWorkspacesQuery = useQuery({ queryKey: queryKeys.sandboxWorkspaces, queryFn: api.listSandboxWorkspaces });
  const agentRunsQuery = useQuery({ queryKey: queryKeys.agentRuns, queryFn: api.listAgentRuns });
  const projectsQuery = useQuery({ queryKey: queryKeys.projects, queryFn: api.listProjects });
  const issuesQuery = useQuery({ queryKey: queryKeys.issues, queryFn: api.listIssues });

  const endpoints = useMemo(() => endpointsQuery.data?.endpoints ?? [], [endpointsQuery.data?.endpoints]);
  const toolSettings = toolSettingsQuery.data?.settings ?? null;
  const sandboxSettings = sandboxSettingsQuery.data?.settings ?? null;
  const sandboxWorkspaces = useMemo(
    () => sandboxWorkspacesQuery.data?.workspaces ?? [],
    [sandboxWorkspacesQuery.data?.workspaces]
  );
  const agentRuns = useMemo(() => agentRunsQuery.data?.runs ?? [], [agentRunsQuery.data?.runs]);
  const hasActiveAgentTasks = useMemo(
    () => agentRuns.some((run) => run.status === "running" || run.status === "idle"),
    [agentRuns]
  );
  const projects = useMemo(() => projectsQuery.data?.projects ?? [], [projectsQuery.data?.projects]);
  const issues = useMemo(() => issuesQuery.data?.issues ?? [], [issuesQuery.data?.issues]);
  const loading = fetchingCount > 0;
  const apiOnline = healthQuery.isError ? false : healthQuery.data?.ok ?? null;

  const selectedEndpoint = useMemo(
    () => (selectedId && selectedId !== "new" ? endpoints.find((endpoint) => endpoint.id === selectedId) ?? null : null),
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
  const endpointError = error ?? getQueryErrorMessage(healthQuery.error, endpointsQuery.error);
  const toolSettingsError = toolError ?? getQueryErrorMessage(toolSettingsQuery.error);
  const sandboxLoadError = sandboxError ?? getQueryErrorMessage(sandboxSettingsQuery.error, sandboxWorkspacesQuery.error, agentRunsQuery.error);
  const issuesLoadError = getQueryErrorMessage(projectsQuery.error, issuesQuery.error);
  const buildRoute = useCallback(
    (pathname: string, updates: Record<string, string | null> = {}) => {
      const params = new URLSearchParams(location.search);

      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }

      const search = params.toString();
      return { pathname, search: search ? `?${search}` : "" };
    },
    [location.search]
  );

  const selectEndpoint = useCallback(
    (endpoint: LlmEndpoint) => {
      void setSelectedId(endpoint.id);
      setDraft({
        name: endpoint.name,
        baseUrl: endpoint.baseUrl,
        defaultModel: endpoint.defaultModel,
        apiKeyEnvVar: endpoint.apiKeyEnvVar || "",
        enabled: endpoint.enabled
      });
    },
    [setSelectedId]
  );

  const applyToolSettings = useCallback(
    (settings: PublicToolSettings) => {
      queryClient.setQueryData<{ settings: PublicToolSettings }>(queryKeys.toolSettings, { settings });
      setGithubDraft({
        enabled: settings.github.enabled,
        token: "",
        clearToken: false
      });
    },
    [queryClient]
  );

  const selectWorkspace = useCallback(
    (workspace: SandboxWorkspace) => {
      void setSelectedWorkspaceId(workspace.id);
    },
    [setSelectedWorkspaceId]
  );

  const selectAgentRun = useCallback(
    (run: AgentRun) => {
      navigate(buildRoute("/agent", { run: run.id }));
    },
    [buildRoute, navigate]
  );

  const startNewAgentRun = useCallback(() => {
    setAgentReplyDraft("");
    setAgentTaskDraft("");
    setSandboxError(null);
    navigate(buildRoute("/agent", { run: null }));
  }, [buildRoute, navigate]);

  const upsertAgentRun = useCallback(
    (run: AgentRun) => {
      queryClient.setQueryData<{ runs: AgentRun[] }>(queryKeys.agentRuns, (current) => ({
        runs: [run, ...(current?.runs ?? []).filter((item) => item.id !== run.id)]
      }));
      selectAgentRun(run);
    },
    [queryClient, selectAgentRun]
  );

  const upsertAgentRunPreservingVisibleMessages = useCallback(
    (run: AgentRun) => {
      let mergedRun = run;

      queryClient.setQueryData<{ runs: AgentRun[] }>(queryKeys.agentRuns, (current) => {
        const existingRun = current?.runs.find((item) => item.id === run.id);
        mergedRun = {
          ...run,
          messages: existingRun ? mergeVisibleAgentRunMessages(existingRun.messages, run.messages) : run.messages
        };

        return {
          runs: [mergedRun, ...(current?.runs ?? []).filter((item) => item.id !== run.id)]
        };
      });
      selectAgentRun(mergedRun);
    },
    [queryClient, selectAgentRun]
  );

  const upsertAgentRunsInCache = useCallback(
    (runs?: AgentRun[]) => {
      if (!runs?.length) {
        return;
      }

      queryClient.setQueryData<{ runs: AgentRun[] }>(queryKeys.agentRuns, (current) => ({
        runs: [...runs, ...(current?.runs ?? []).filter((run) => !runs.some((item) => item.id === run.id))]
      }));
    },
    [queryClient]
  );

  const upsertIssue = useCallback(
    (issue: Issue) => {
      queryClient.setQueryData<{ issues: Issue[] }>(queryKeys.issues, (current) => ({
        issues: [issue, ...(current?.issues ?? []).filter((item) => item.id !== issue.id)]
      }));
      void setSelectedIssueId(issue.id);
    },
    [queryClient, setSelectedIssueId]
  );

  const syncIssueFromRun = useCallback(
    async (issueId: string, run: AgentRun) => {
      const status = getIssueStatusFromRun(run);
      const response = await api.updateIssue(issueId, {
        branchName: run.branchName,
        prUrl: run.prUrl,
        status
      });
      upsertIssue(response.issue);
    },
    [upsertIssue]
  );

  const refreshIssues = useCallback(async () => {
    const response = await api.listIssues();
    queryClient.setQueryData(queryKeys.issues, response);
  }, [queryClient]);

  const updateAgentRunInPlace = useCallback(
    (runId: string, updater: (run: AgentRun) => AgentRun) => {
      queryClient.setQueryData<{ runs: AgentRun[] }>(queryKeys.agentRuns, (current) => ({
        runs: (current?.runs ?? []).map((run) => (run.id === runId ? updater(run) : run))
      }));
    },
    [queryClient]
  );

  const refreshData = useCallback(() => {
    setError(null);
    setToolError(null);
    setSandboxError(null);
    void queryClient.invalidateQueries();
  }, [queryClient]);

  useEffect(() => {
    if (!hasActiveAgentTasks) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentRuns });
      void queryClient.invalidateQueries({ queryKey: queryKeys.issues });
    }, 2_000);

    return () => window.clearInterval(intervalId);
  }, [hasActiveAgentTasks, queryClient]);

  useEffect(() => {
    if (toolSettings) {
      setGithubDraft((current) => ({
        enabled: toolSettings.github.enabled,
        token: current.token,
        clearToken: current.clearToken
      }));
    }
  }, [toolSettings]);

  useEffect(() => {
    if (!endpoints.length) {
      if (selectedId && selectedId !== "new") {
        void setSelectedId(null);
      }
      return;
    }

    if (!selectedId) {
      void setSelectedId(endpoints[0]!.id);
      return;
    }

    if (selectedId !== "new" && !endpoints.some((endpoint) => endpoint.id === selectedId)) {
      void setSelectedId(endpoints[0]!.id);
    }
  }, [endpoints, selectedId, setSelectedId]);

  useEffect(() => {
    if (selectedEndpoint) {
      setDraft({
        name: selectedEndpoint.name,
        baseUrl: selectedEndpoint.baseUrl,
        defaultModel: selectedEndpoint.defaultModel,
        apiKeyEnvVar: selectedEndpoint.apiKeyEnvVar || "",
        enabled: selectedEndpoint.enabled
      });
      return;
    }

    if (selectedId === "new" || !selectedId) {
      setDraft(emptyDraft);
    }
  }, [selectedEndpoint, selectedId]);

  useEffect(() => {
    if (!sandboxWorkspaces.length) {
      if (selectedWorkspaceId) {
        void setSelectedWorkspaceId(null);
      }
      return;
    }

    if (!selectedWorkspaceId || !sandboxWorkspaces.some((workspace) => workspace.id === selectedWorkspaceId)) {
      void setSelectedWorkspaceId(sandboxWorkspaces[0]!.id);
    }
  }, [sandboxWorkspaces, selectedWorkspaceId, setSelectedWorkspaceId]);

  useEffect(() => {
    if (selectedAgentRunId && !agentRuns.some((run) => run.id === selectedAgentRunId)) {
      void setSelectedAgentRunId(null);
    }
  }, [agentRuns, selectedAgentRunId, setSelectedAgentRunId]);

  useEffect(() => {
    if (selectedIssueId && !issues.some((issue) => issue.id === selectedIssueId)) {
      void setSelectedIssueId(null);
    }
  }, [issues, selectedIssueId, setSelectedIssueId]);

  const startNewEndpoint = () => {
    setDraft(emptyDraft);
    setError(null);
    navigate(buildRoute("/settings/endpoints", { endpoint: "new" }));
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
      const response = selectedEndpoint
        ? await api.updateEndpoint(selectedEndpoint.id, input)
        : await api.createEndpoint(input);

      const endpointResponse = await api.listEndpoints();
      queryClient.setQueryData(queryKeys.endpoints, endpointResponse);
      selectEndpoint(response.endpoint);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const deleteEndpoint = async () => {
    if (!selectedEndpoint) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await api.deleteEndpoint(selectedEndpoint.id);
      const response = await api.listEndpoints();
      queryClient.setQueryData(queryKeys.endpoints, response);

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
      queryClient.setQueryData(queryKeys.sandboxWorkspaces, listResponse);
      selectWorkspace(response.workspace);
      setWorkspaceDraft(emptySandboxWorkspaceDraft);
    } catch (createError) {
      setSandboxError(getErrorMessage(createError));

      try {
        const listResponse = await api.listSandboxWorkspaces();
        queryClient.setQueryData(queryKeys.sandboxWorkspaces, listResponse);
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
      queryClient.setQueryData(queryKeys.sandboxWorkspaces, response);
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

  const rewindAgentRun = async (run: AgentRun, messageId: string) => {
    if (agentRunning) {
      return;
    }

    setSandboxError(null);

    try {
      const response = await api.rewindAgentRun(run.id, { messageId });
      setAgentReplyDraft("");
      upsertAgentRun(response.run);
    } catch (rewindError) {
      setSandboxError(getErrorMessage(rewindError));
    }
  };

  const streamAgentRun = async (run: AgentRun, trackedIssueId?: string) => {
    const controller = new AbortController();
    let activeAssistantMessageId: string | null = null;
    let activeAssistantContent = "";
    let toolMessageId: string | null = null;
    let finalRun: AgentRun | null = null;

    agentStreamAbortRef.current = controller;
    setAgentRunning(true);
    setSandboxError(null);

    const createAssistantSegment = () => {
      const id = `stream-${crypto.randomUUID()}`;
      activeAssistantMessageId = id;
      activeAssistantContent = "";

      updateAgentRunInPlace(run.id, (current) => ({
        ...current,
        status: "running",
        messages: [
          ...current.messages,
          {
            id,
            role: "assistant",
            content: "",
            createdAt: new Date().toISOString()
          }
        ]
      }));

      return id;
    };

    const ensureAssistantSegment = () => activeAssistantMessageId ?? createAssistantSegment();

    const consumeAssistantSegment = () => {
      const id = activeAssistantMessageId;

      if (!id) {
        return null;
      }

      const content = activeAssistantContent;
      activeAssistantMessageId = null;
      activeAssistantContent = "";

      return { id, content };
    };

    const discardAssistantSegment = () => {
      const id = activeAssistantMessageId;

      if (!id) {
        return;
      }

      activeAssistantMessageId = null;
      activeAssistantContent = "";

      updateAgentRunInPlace(run.id, (current) => ({
        ...current,
        status: "running",
        messages: current.messages.filter((message) => message.id !== id)
      }));
    };

    const finalizeAssistantSegment = (serverMessages: AgentRun["messages"] = []) => {
      const assistantSegment = consumeAssistantSegment();

      if (!assistantSegment) {
        return;
      }

      updateAgentRunInPlace(run.id, (current) => ({
        ...current,
        status: "running",
        messages: finalizeAssistantSegmentMessage(current.messages, assistantSegment, serverMessages)
      }));
    };

    const finalizeAssistantSegmentIfPersisted = (serverMessages: AgentRun["messages"]) => {
      if (!activeAssistantMessageId || !activeAssistantContent.trim()) {
        return;
      }

      const hasMatchingServerMessage = serverMessages.some(
        (message) => message.role === "assistant" && message.content === activeAssistantContent
      );

      if (hasMatchingServerMessage) {
        finalizeAssistantSegment(serverMessages);
      }
    };

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
              finalizeAssistantSegmentIfPersisted(event.run.messages);
              upsertAgentRunPreservingVisibleMessages(event.run);
              return;
            }

            if (event.type === "done") {
              finalizeAssistantSegment(event.run.messages);
              finalRun = event.run;
              upsertAgentRunPreservingVisibleMessages(event.run);
              if (event.run.issueId) {
                void refreshIssues();
              }
              return;
            }

            if (event.type === "assistant_delta") {
              const assistantMessageId = ensureAssistantSegment();
              activeAssistantContent += event.content;

              updateAgentRunInPlace(run.id, (current) => {
                const existing = current.messages.find((message) => message.id === assistantMessageId);

                if (existing) {
                  return {
                    ...current,
                    status: "running",
                    messages: current.messages.map((message) =>
                      message.id === assistantMessageId ? { ...message, content: activeAssistantContent } : message
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
                      content: activeAssistantContent,
                      createdAt: new Date().toISOString()
                    }
                  ]
                };
              });
              return;
            }

            if (event.type === "assistant_reset") {
              discardAssistantSegment();
              return;
            }

            if (event.type === "tool_start") {
              const now = new Date().toISOString();
              toolMessageId = `tool-${crypto.randomUUID()}`;
              const assistantSegment = consumeAssistantSegment();
              const toolMessage: AgentRun["messages"][number] = {
                id: toolMessageId,
                role: "tool",
                toolName: event.toolName,
                content: `Running ${event.toolName}...`,
                createdAt: now
              };

              updateAgentRunInPlace(run.id, (current) => ({
                ...current,
                status: "running",
                messages: mergeToolStartMessage(current.messages, assistantSegment, toolMessage)
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
                finalizeAssistantSegment(event.run.messages);
                finalRun = event.run;
                upsertAgentRunPreservingVisibleMessages(event.run);
              }

              throw new Error(event.error);
            }
          }
        }
      );

      if (trackedIssueId && finalRun) {
        await syncIssueFromRun(trackedIssueId, finalRun);
      }
    } catch (runError) {
      if (!isAbortError(runError)) {
        setSandboxError(getErrorMessage(runError));
        if (trackedIssueId && finalRun) {
          await syncIssueFromRun(trackedIssueId, finalRun);
        }
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
      const [runsResponse, issuesResponse, workspaceResponse] = await Promise.all([
        api.listAgentRuns(),
        api.listIssues(),
        api.listSandboxWorkspaces()
      ]);
      queryClient.setQueryData(queryKeys.agentRuns, runsResponse);
      queryClient.setQueryData(queryKeys.issues, issuesResponse);
      queryClient.setQueryData(queryKeys.sandboxWorkspaces, workspaceResponse);
    } catch (deleteError) {
      setSandboxError(getErrorMessage(deleteError));
    } finally {
      setAgentRunDeletingId(null);
    }
  };

  const startIssueRun = async (issue: Issue) => {
    setSandboxError(null);

    const project = projects.find((item) => item.id === issue.projectId);
    const response = await api.startIssue(issue.id, {
      endpointId: issue.endpointId ?? project?.defaultEndpointId ?? selectedEndpoint?.id
    });
    upsertIssue(response.issue);
    upsertAgentRunsInCache(response.runs);

    if (!response.run) {
      return;
    }

    upsertAgentRun({ ...response.run, status: "running" });
    await streamAgentRun(response.run, response.issue.id);
  };

  const openAgentRun = (runId: string) => {
    const existingRun = agentRuns.find((run) => run.id === runId);

    if (existingRun) {
      selectAgentRun(existingRun);
      return;
    }

    void api
      .getAgentRun(runId)
      .then((response) => {
        upsertAgentRun(response.run);
      })
      .catch((openError) => {
        setSandboxError(getErrorMessage(openError));
      });
  };

  const ProjectDetailRoute = () => {
    const { projectId, tab } = useParams<{ projectId: string; tab?: string }>();

    if (!projectId) {
      return <Navigate replace to={buildRoute("/projects")} />;
    }

    if (!tab) {
      return <Navigate replace to={buildRoute(`/projects/${projectId}/issues`, { project: null })} />;
    }

    const selectedTab: ProjectDetailTab = tab === "tasks" ? "tasks" : "issues";
    const projectExists = projects.some((project) => project.id === projectId);

    if (!loading && projects.length > 0 && !projectExists) {
      return <Navigate replace to={buildRoute("/projects", { issue: null, project: null })} />;
    }

    return (
      <ProjectDetailPage
        agentRuns={agentRuns}
        endpoints={endpoints}
        error={issuesLoadError}
        issues={issues}
        loading={loading}
        onBack={() => navigate(buildRoute("/projects", { issue: null, project: null }))}
        onNavigateTab={(nextTab) => navigate(buildRoute(`/projects/${projectId}/${nextTab}`))}
        onOpenRun={openAgentRun}
        onSelectIssue={(id) => void setSelectedIssueId(id)}
        onStartIssueRun={startIssueRun}
        projectId={projectId}
        projects={projects}
        selectedEndpoint={selectedEndpoint}
        selectedIssueId={selectedIssueId}
        tab={selectedTab}
        workspaces={sandboxWorkspaces}
      />
    );
  };

  return (
    <main className="h-screen overflow-hidden bg-background">
      <div className="flex h-full min-h-0 flex-col">
        <header className="shrink-0 border-b bg-background">
          <div className="flex min-h-12 flex-col gap-2 px-3 py-2 lg:flex-row lg:items-center">
            <div className="flex min-w-0 shrink-0 items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Network className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold tracking-normal">Agent Fleet</h1>
                <p className="hidden truncate text-xs text-muted-foreground sm:block">IDE-grade local coding agents</p>
              </div>
            </div>

            <nav className="flex h-8 max-w-full shrink-0 items-center gap-1 overflow-x-auto border-l pl-2 lg:ml-2" aria-label="Primary">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const active =
                  item.value === "settings"
                    ? location.pathname.startsWith("/settings")
                    : item.value === "projects"
                      ? location.pathname.startsWith("/projects")
                      : location.pathname === item.path;

                return (
                  <NavLink
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-8 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                      active && "border-primary text-foreground"
                    )}
                    end={item.value !== "settings"}
                    key={item.value}
                    to={buildRoute(item.path)}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>

            <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
              <Select disabled={!endpoints.length || loading} onValueChange={selectEndpointById} value={selectedEndpoint?.id ?? undefined}>
                <SelectTrigger className="h-8 w-full bg-background text-xs sm:w-[360px] 2xl:w-[460px]">
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

              <div className="hidden items-center gap-1 2xl:flex">
                <StatusBadge online={apiOnline} />
                <Badge variant="secondary">{endpoints.length} endpoints</Badge>
                <StateBadge tone={enabledCount > 0 ? "success" : "warning"}>{enabledCount} enabled</StateBadge>
                <StateBadge tone={githubReady ? "success" : "warning"}>{githubReady ? "GitHub ready" : "GitHub missing"}</StateBadge>
                <Badge variant="secondary">{projects.length} projects</Badge>
              </div>

              <Button className="h-8 w-8" variant="outline" size="icon" onClick={refreshData} disabled={loading} type="button">
                {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              </Button>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <Routes>
            <Route element={<Navigate replace to={buildRoute("/chat")} />} path="/" />
            <Route element={<ChatPanel endpoint={selectedEndpoint} />} path="/chat" />
            <Route
              element={
                <ProjectsListPage
                  endpoints={endpoints}
                  error={issuesLoadError}
                  issues={issues}
                  loading={loading}
                  onOpenProject={(id) => navigate(buildRoute(`/projects/${id}/issues`, { issue: null, project: null }))}
                  projects={projects}
                  selectedEndpoint={selectedEndpoint}
                  workspaces={sandboxWorkspaces}
                />
              }
              path="/projects"
            />
            <Route element={<ProjectDetailRoute />} path="/projects/:projectId" />
            <Route element={<ProjectDetailRoute />} path="/projects/:projectId/:tab" />
            <Route element={<Navigate replace to={buildRoute("/projects")} />} path="/issues" />
            <Route element={<Navigate replace to={buildRoute("/settings/endpoints")} />} path="/settings" />
            <Route
              element={
                <SettingsShell>
                  <section className="grid h-full min-h-0 overflow-y-auto bg-background lg:grid-cols-[minmax(0,1fr)_400px] lg:overflow-hidden">
                  <div className="flex min-h-[320px] flex-col lg:min-h-0">
                    <div className="flex items-center justify-between border-b px-3 py-2">
                      <h2 className="text-base font-semibold">Endpoints</h2>
                      <Button variant="secondary" onClick={startNewEndpoint} size="sm">
                        <Plus />
                        New
                      </Button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <div className="space-y-2 p-2">
                        {endpointError ? (
                          <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            {endpointError}
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

                  <aside className="min-h-0 overflow-y-auto border-t bg-muted/20 p-3 lg:border-l lg:border-t-0">
                    <div className="mb-3">
                      <h2 className="text-base font-semibold">{selectedEndpoint ? "Endpoint settings" : "New endpoint"}</h2>
                    </div>
                    <form className="space-y-3" onSubmit={saveEndpoint}>
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
                </SettingsShell>
              }
              path="/settings/endpoints"
            />
            <Route
              element={
                <SettingsShell>
                <ToolSettingsPanel
                  draft={githubDraft}
                  error={toolSettingsError}
                  onChange={setGithubDraft}
                  onSubmit={saveGitHubToolSettings}
                  onTest={() => void testGitHubTool()}
                  saving={toolSaving}
                  settings={toolSettings}
                  testResult={githubTestResult}
                  testing={githubTesting}
                />
                </SettingsShell>
              }
              path="/settings/tools"
            />
            <Route
              element={
                <WorkspaceManagementPanel
                  error={sandboxLoadError}
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
              }
              path="/workspaces"
            />
            <Route
              element={
                <SandboxPanel
                  agentReplyDraft={agentReplyDraft}
                  agentRunning={agentRunning}
                  agentTaskDraft={agentTaskDraft}
                  endpoint={selectedEndpoint}
                  error={sandboxLoadError}
                  onAgentReplyChange={setAgentReplyDraft}
                  onAgentTaskChange={setAgentTaskDraft}
                  onContinueAgentRun={(run) => void continueAgentRun(run)}
                  onDeleteAgentRun={(run) => void deleteAgentRun(run)}
                  onCreateAgentRun={createAgentRun}
                  onRewindAgentRun={(run, messageId) => void rewindAgentRun(run, messageId)}
                  onSendAgentMessage={() => void sendAgentMessage()}
                  onSelectAgentRun={selectAgentRun}
                  onStartNewAgentRun={startNewAgentRun}
                  onStopAgentRun={stopAgentRun}
                  issues={issues}
                  projects={projects}
                  runs={agentRuns}
                  runDeletingId={agentRunDeletingId}
                  selectedRun={selectedAgentRun}
                  selectedWorkspace={selectedWorkspace}
                />
              }
              path="/agent"
            />
            <Route element={<Navigate replace to={buildRoute("/chat")} />} path="*" />
          </Routes>
        </div>
      </div>
    </main>
  );
}

const SettingsShell = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const buildSettingsRoute = (pathname: string) => {
    return { pathname, search: location.search };
  };

  return (
    <section className="grid h-full min-h-0 overflow-y-auto bg-background lg:grid-cols-[180px_minmax(0,1fr)] lg:overflow-hidden">
      <aside className="border-b bg-muted/20 p-2 lg:border-b-0 lg:border-r">
        <div className="px-2 py-1.5 text-xs font-medium uppercase text-muted-foreground">Settings</div>
        <div className="grid gap-1">
          {settingsPages.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                className={({ isActive }) =>
                  cn(
                    "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
                    isActive && "bg-background text-foreground shadow-sm"
                  )
                }
                key={item.value}
                to={buildSettingsRoute(item.path)}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </aside>

      <div className="min-h-0 overflow-hidden">{children}</div>
    </section>
  );
};

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
  onRewindAgentRun: (run: AgentRun, messageId: string) => void;
  onSendAgentMessage: () => void;
  onSelectAgentRun: (run: AgentRun) => void;
  onStartNewAgentRun: () => void;
  onStopAgentRun: () => void;
  issues: Issue[];
  projects: AgentProject[];
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
    <section className="grid h-full min-h-0 overflow-y-auto bg-background lg:grid-cols-[minmax(0,1fr)_400px] lg:overflow-hidden">
      <div className="flex min-h-[320px] flex-col lg:min-h-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Folder className="h-4 w-4" />
            Workspaces
          </h2>
          <Badge variant="secondary">{workspaces.length} total</Badge>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-2 p-2">
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
        <section className="border-b p-3">
          <h2 className="mb-3 text-base font-semibold">New workspace</h2>
          <form className="space-y-3" onSubmit={onCreateWorkspace}>
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

        <section className="border-b p-3">
          <h2 className="mb-3 text-base font-semibold">Selected workspace</h2>
          <div className="space-y-0">
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

        <section className="p-3">
          <h2 className="mb-3 text-base font-semibold">Sandbox policy</h2>
          <div className="grid gap-0">
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
  onRewindAgentRun,
  onSendAgentMessage,
  onSelectAgentRun,
  onStartNewAgentRun,
  onStopAgentRun,
  issues,
  projects,
  runs,
  runDeletingId,
  selectedRun,
  selectedWorkspace
}: SandboxPanelProps) => {
  const issueById = useMemo(() => new Map(issues.map((issue) => [issue.id, issue])), [issues]);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);

  return (
    <section className="grid h-full min-h-0 overflow-y-auto bg-background xl:grid-cols-[minmax(360px,380px)_minmax(0,1fr)] xl:overflow-hidden">
      <div className="flex min-h-[260px] flex-col border-b xl:min-h-0 xl:border-b-0 xl:border-r">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Bot className="h-4 w-4" />
            Agent tasks
          </h2>
          <Button disabled={agentRunning} onClick={onStartNewAgentRun} size="sm" type="button" variant="secondary">
            <Plus />
            New
          </Button>
        </div>
        <div className="min-h-[220px] flex-1 overflow-y-auto">
          <div className="space-y-2 p-2">
            {runs.length ? (
              runs.map((run) => (
                <AgentRunCard
                  deleting={runDeletingId === run.id}
                  key={run.id}
                  onDelete={() => onDeleteAgentRun(run)}
                  onSelect={() => onSelectAgentRun(run)}
                  issue={run.issueId ? issueById.get(run.issueId) : undefined}
                  project={run.projectId ? projectById.get(run.projectId) : undefined}
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
        <div className="flex flex-col gap-2 border-b px-3 py-2 md:flex-row md:items-center md:justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Bot className="h-4 w-4" />
            Agent task
          </h2>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {endpoint ? <Badge variant="secondary">{endpoint.defaultModel}</Badge> : null}
            {selectedWorkspace ? <Badge variant="outline">{selectedWorkspace.name}</Badge> : <StateBadge tone="warning">No workspace</StateBadge>}
            {selectedRun ? <AgentRunKindBadge kind={selectedRun.kind} /> : null}
            {selectedRun ? <AgentRunStatusBadge status={selectedRun.status} /> : null}
            {selectedRun?.context ? <AgentRunContextBadge context={selectedRun.context} /> : null}
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
              onRewind={(messageId) => onRewindAgentRun(selectedRun, messageId)}
              onSend={onSendAgentMessage}
              onStop={onStopAgentRun}
              run={selectedRun}
            />
          ) : (
            <form className="space-y-3 p-3" onSubmit={onCreateAgentRun}>
              <Field label="New task">
                <Textarea
                  className="min-h-[160px] bg-background"
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
  onRewind: (messageId: string) => void;
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
  onRewind,
  onSend,
  onStop,
  run
}: AgentConversationProps) => {
  const canUseEndpoint = Boolean(endpoint?.enabled);
  const canContinue = canUseEndpoint && !isStreaming && run.status !== "completed";
  const canSend = canUseEndpoint && !isStreaming && Boolean(draft.trim()) && run.status !== "completed";
  const contextPanel =
    run.context?.strategy === "compacted" ? <AgentContextMemoryPanel context={run.context} /> : null;
  const messages = useMemo<ConversationMessage[]>(
    () => {
      const seenAssistantDisplay = new Set<string>();

      return run.messages.flatMap((message) => {
        const isAssistantLike = message.role === "assistant" || message.role === "system";
        const parsed = isAssistantLike
          ? normalizeAgentAssistantDisplay(splitThinking(message.content))
          : { content: message.content, reasoning: "" };
        const isStreamingAssistant = message.id.startsWith("stream-");
        const isRunningTool =
          message.role === "tool" && message.content === `Running ${message.toolName || "tool"}...`;

        if (isAssistantLike && !parsed.content && !parsed.reasoning && !isStreamingAssistant) {
          return [];
        }

        if (isAssistantLike && !isStreamingAssistant) {
          const displayKey = `${message.role}:${parsed.reasoning.trim()}:${parsed.content.trim()}`;

          if (displayKey.length > message.role.length + 2 && seenAssistantDisplay.has(displayKey)) {
            return [];
          }

          seenAssistantDisplay.add(displayKey);
        }

        return [{
          id: message.id,
          role: message.role,
          content: parsed.content,
          reasoning: parsed.reasoning,
          status: isStreamingAssistant || isRunningTool ? "streaming" : message.role === "tool" ? "done" : undefined,
          createdAt: message.createdAt,
          toolName: message.toolName,
          toolCallId: message.role === "tool" ? message.id : undefined
        }];
      });
    },
    [run.messages]
  );

  return (
    <ChatConversation
      detectPullRequestLinks
      emptyState={
        <div className="flex min-h-[36vh] flex-col items-center justify-center gap-3 text-center">
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
      }
      error={error}
      header={contextPanel}
      inputActions={
        <>
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
        </>
      }
      inputDisabled={!canUseEndpoint || run.status === "completed"}
      inputFooter={endpoint ? `${endpoint.baseUrl} · ${endpoint.defaultModel}` : "Select an enabled endpoint"}
      inputLoading={isStreaming}
      inputPlaceholder={
        canUseEndpoint ? "Reply to the coding agent or add constraints..." : "Select an enabled endpoint before continuing"
      }
      inputValue={draft}
      messages={messages}
      onInputChange={onChange}
      onInputSubmit={() => {
        if (canSend) {
          onSend();
        }
      }}
      onRewindMessage={(message) => onRewind(message.id)}
      showMessageMeta
    />
  );
};

const AgentContextMemoryPanel = ({ context }: { context: NonNullable<AgentRun["context"]> }) => {
  const [open, setOpen] = useState(false);
  const usage = getAgentRunContextUsage(context);

  return (
    <Collapsible
      className="border-b bg-amber-50/45 text-amber-950"
      onOpenChange={setOpen}
      open={open}
    >
      <div className="px-3 py-2">
        <CollapsibleTrigger asChild>
          <button
            className="flex w-full min-w-0 items-center gap-2 text-left text-xs"
            type="button"
          >
            <Network className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">Context memory</span>
            <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100" variant="outline">
              {usage}%
            </Badge>
            <span className="truncate text-amber-800">
              {context.summarizedMessages} compacted · {context.retainedMessages} recent kept
            </span>
            <ChevronDown className={cn("ml-auto h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="px-3 pb-3">
          <div className="max-h-72 overflow-y-auto rounded-md border border-amber-200 bg-background px-3 py-2.5 text-sm">
            <Markdown className="prose prose-sm max-w-none dark:prose-invert prose-headings:my-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-pre:my-2 prose-code:text-xs">
              {formatContextMemoryMarkdown(context)}
            </Markdown>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const AgentRunCard = ({
  deleting,
  issue,
  onDelete,
  onSelect,
  project,
  run,
  selected
}: {
  deleting: boolean;
  issue?: Issue;
  onDelete: () => void;
  onSelect: () => void;
  project?: AgentProject;
  run: AgentRun;
  selected: boolean;
}) => {
  const promptPreview = getAgentRunPromptPreview(run);

  return (
    <div className={cn("rounded-md border bg-background p-2.5 transition-colors", selected && "border-primary ring-1 ring-primary")}>
      <div className="flex items-start justify-between gap-3">
        <button className="min-w-0 flex-1 text-left" onClick={onSelect} type="button">
          <div className="flex flex-wrap items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <AgentRunKindBadge kind={run.kind} />
            <h3 className="truncate text-sm font-semibold">{run.title}</h3>
            <AgentRunStatusBadge status={run.status} />
          </div>
          {promptPreview ? <p className="mt-1 truncate text-xs text-muted-foreground">{promptPreview}</p> : null}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{formatDateTime(run.updatedAt)}</span>
            {project ? <span className="truncate">{project.name}</span> : null}
            {issue ? <span className="truncate">{issue.title}</span> : null}
            {run.context ? <span>{formatAgentRunContext(run.context)}</span> : null}
          </div>
        </button>
        <Button disabled={deleting} onClick={onDelete} size="icon" type="button" variant="ghost">
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};

const AgentRunKindBadge = ({ kind }: { kind: AgentRun["kind"] }) => {
  if (kind === "requirements") {
    return <Badge variant="outline">requirements</Badge>;
  }

  if (kind === "planning") {
    return <Badge variant="secondary">plan</Badge>;
  }

  if (kind === "verification") {
    return <Badge variant="secondary">verify</Badge>;
  }

  if (kind === "publish") {
    return <Badge variant="secondary">publish</Badge>;
  }

  if (kind === "followup") {
    return <Badge variant="outline">followup</Badge>;
  }

  return <Badge variant="outline">coding</Badge>;
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

const AgentRunContextBadge = ({ context }: { context: NonNullable<AgentRun["context"]> }) => {
  const usage = getAgentRunContextUsage(context);

  return (
    <Badge
      className={cn(
        "gap-1",
        context.strategy === "compacted" && "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50"
      )}
      variant={context.strategy === "compacted" ? "outline" : "secondary"}
    >
      Context {usage}%
      {context.strategy === "compacted" ? ` · compacted ${context.summarizedMessages}` : ""}
    </Badge>
  );
};

const formatAgentRunContext = (context: NonNullable<AgentRun["context"]>) => {
  const usage = getAgentRunContextUsage(context);

  if (context.strategy === "compacted") {
    return `context ${usage}% · compacted ${context.summarizedMessages}`;
  }

  return `context ${usage}%`;
};

const formatContextMemoryMarkdown = (context: NonNullable<AgentRun["context"]>) => {
  const summary = context.summary?.trim() || "_No context summary is available for this compacted run._";

  return [
    "### Context Memory Prompt",
    [
      `- Strategy: \`${context.strategy}\``,
      `- Estimated tokens: \`${context.estimatedTokens.toLocaleString()}\` / \`${context.tokenBudget.toLocaleString()}\``,
      `- Compacted messages: \`${context.summarizedMessages.toLocaleString()}\``,
      `- Recent messages kept: \`${context.retainedMessages.toLocaleString()}\``,
      `- Updated: \`${formatDateTime(context.updatedAt)}\``
    ].join("\n"),
    "### Compacted Context",
    summary
  ].join("\n\n");
};

const getAgentRunPromptPreview = (run: AgentRun) => {
  const prompt = run.messages.find((message) => message.role === "user")?.content;

  if (!prompt) {
    return "";
  }

  return prompt.split("\n").find((line) => line.trim())?.trim() ?? "";
};

const getAgentRunContextUsage = (context: NonNullable<AgentRun["context"]>) => {
  return Math.min(100, Math.round((context.estimatedTokens / context.tokenBudget) * 100));
};

type AgentRunMessage = AgentRun["messages"][number];
type AssistantStreamSegment = {
  id: string;
  content: string;
} | null;

const mergeToolStartMessage = (
  messages: AgentRunMessage[],
  assistantSegment: AssistantStreamSegment,
  toolMessage: AgentRunMessage
) => {
  if (!assistantSegment) {
    return [...messages, toolMessage];
  }

  const existingIndex = messages.findIndex((message) => message.id === assistantSegment.id);
  const hasAssistantContent = Boolean(getVisibleAgentAssistantText(assistantSegment.content));

  if (existingIndex < 0) {
    if (!hasAssistantContent) {
      return [...messages, toolMessage];
    }

    return [...messages, createFinalAssistantMessage(assistantSegment, toolMessage.createdAt), toolMessage];
  }

  return messages.flatMap((message) => {
    if (message.id !== assistantSegment.id) {
      return [message];
    }

    if (!hasAssistantContent) {
      return [toolMessage];
    }

    return [
      {
        ...message,
        id: getFinalAssistantMessageId(assistantSegment.id),
        content: assistantSegment.content
      },
      toolMessage
    ];
  });
};

const finalizeAssistantSegmentMessage = (
  messages: AgentRunMessage[],
  assistantSegment: Exclude<AssistantStreamSegment, null>,
  serverMessages: AgentRunMessage[]
) => {
  const existingIndex = messages.findIndex((message) => message.id === assistantSegment.id);
  const hasAssistantContent = Boolean(getVisibleAgentAssistantText(assistantSegment.content));

  if (existingIndex < 0) {
    return hasAssistantContent ? [...messages, getFinalAssistantMessage(assistantSegment, serverMessages)] : messages;
  }

  return messages.flatMap((message) => {
    if (message.id !== assistantSegment.id) {
      return [message];
    }

    return hasAssistantContent ? [getFinalAssistantMessage(assistantSegment, serverMessages, message)] : [];
  });
};

const getFinalAssistantMessage = (
  assistantSegment: Exclude<AssistantStreamSegment, null>,
  serverMessages: AgentRunMessage[],
  fallback?: AgentRunMessage
) => {
  const serverMessage = serverMessages.find(
    (message) => message.role === "assistant" && message.content === assistantSegment.content
  );

  if (serverMessage) {
    return serverMessage;
  }

  return {
    ...(fallback ?? createFinalAssistantMessage(assistantSegment, new Date().toISOString())),
    id: getFinalAssistantMessageId(assistantSegment.id),
    content: assistantSegment.content
  };
};

const mergeVisibleAgentRunMessages = (visibleMessages: AgentRunMessage[], serverMessages: AgentRunMessage[]) => {
  const merged = [...visibleMessages];

  for (const serverMessage of serverMessages) {
    if (!merged.some((message) => isSameVisibleMessage(message, serverMessage))) {
      merged.push(serverMessage);
    }
  }

  return merged;
};

const isSameVisibleMessage = (left: AgentRunMessage, right: AgentRunMessage) => {
  if (left.id === right.id) {
    return true;
  }

  if (left.role === "assistant" && right.role === "assistant") {
    const leftContent = normalizeAgentAssistantDisplay(splitThinking(left.content)).content.trim();
    const rightContent = normalizeAgentAssistantDisplay(splitThinking(right.content)).content.trim();

    if (leftContent && rightContent && leftContent === rightContent) {
      return true;
    }
  }

  return left.role === right.role && left.toolName === right.toolName && left.content === right.content;
};

const getVisibleAgentAssistantText = (content: string) => {
  const parsed = normalizeAgentAssistantDisplay(splitThinking(content));

  return `${parsed.reasoning}\n${parsed.content}`.trim();
};

const createFinalAssistantMessage = (assistantSegment: Exclude<AssistantStreamSegment, null>, createdAt: string): AgentRunMessage => ({
  id: getFinalAssistantMessageId(assistantSegment.id),
  role: "assistant",
  content: assistantSegment.content,
  createdAt
});

const getFinalAssistantMessageId = (id: string) => {
  return id.startsWith("stream-") ? `assistant-${id.slice("stream-".length)}` : id;
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
    <div className={cn("rounded-md border bg-background p-2.5 transition-colors", selected && "border-primary ring-1 ring-primary")}>
      <div className="flex items-start justify-between gap-3">
        <button className="min-w-0 flex-1 text-left" onClick={onSelect} type="button">
          <div className="flex flex-wrap items-center gap-2">
            <Folder className="h-4 w-4 text-primary" />
            <h3 className="truncate text-sm font-semibold">{workspace.name}</h3>
            <StateBadge tone={workspace.status === "ready" ? "success" : "warning"}>{workspace.status}</StateBadge>
          </div>
          <div className="mt-1 grid gap-1 text-xs text-muted-foreground">
            <span className="truncate">{workspace.repositoryUrl || workspace.path}</span>
            {workspace.ref ? <span className="truncate">{workspace.ref}</span> : null}
          </div>
        </button>
        <Button onClick={onDelete} size="icon" type="button" variant="ghost">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {workspace.error ? <p className="mt-2 text-sm text-destructive">{workspace.error}</p> : null}
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
    <section className="grid h-full min-h-0 overflow-y-auto bg-background lg:grid-cols-[minmax(0,1fr)_400px] lg:overflow-hidden">
      <div className="min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-2 border-b px-3 py-2 md:flex-row md:items-center md:justify-between">
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
        <div className="p-3">
          <form className="space-y-3" onSubmit={onSubmit}>
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

      <aside className="min-h-0 overflow-y-auto border-t bg-muted/20 p-3 lg:border-l lg:border-t-0">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
          <ShieldCheck className="h-4 w-4" />
          Git clone readiness
        </h2>
        <div className="space-y-0">
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
    <div className={cn("rounded-md border bg-background p-2.5 transition-colors", selected && "border-primary ring-1 ring-primary")}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <button className="min-w-0 flex-1 text-left" onClick={onSelect} type="button">
          <div className="flex flex-wrap items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            <h3 className="truncate text-sm font-semibold">{endpoint.name}</h3>
            <StateBadge tone={endpoint.enabled ? "success" : "warning"}>{endpoint.enabled ? "Enabled" : "Disabled"}</StateBadge>
          </div>
          <div className="mt-1 grid gap-1 text-xs text-muted-foreground">
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
        <div className="mt-2 flex flex-wrap gap-2">
          {testResult.models.slice(0, 8).map((model) => (
            <Badge key={model} variant="secondary">
              {model}
            </Badge>
          ))}
        </div>
      ) : null}

      {testResult?.error ? <p className="mt-2 text-sm text-destructive">{testResult.error}</p> : null}
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
    <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
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
    <div className="flex items-start justify-between gap-3 border-b py-2 text-sm last:border-b-0">
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

const getIssueStatusFromRun = (run: AgentRun): IssueStatus => {
  if (run.prUrl) {
    return "review";
  }

  if (run.status === "completed") {
    return "completed";
  }

  if (run.status === "failed") {
    return "failed";
  }

  if (run.status === "awaiting_user") {
    return "awaiting_user";
  }

  return "running";
};

const getQueryErrorMessage = (...errors: Array<unknown | null>) => {
  const error = errors.find(Boolean);
  return error ? getErrorMessage(error) : null;
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
