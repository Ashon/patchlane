import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import type {
  AgentProject,
  AgentRun,
  CreateAgentProjectInput,
  CreateIssueInput,
  Issue,
  IssuePriority,
  IssueStatus,
  LlmEndpoint,
  SandboxWorkspace,
  UpdateAgentProjectInput
} from "@agent-fleet/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  CheckCircle2,
  ClipboardList,
  GitBranch,
  Github,
  Layers3,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Save
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-client";
import { cn } from "@/lib/utils";

type ProjectDraft = {
  targetId: string | null;
  name: string;
  description: string;
  repositoryUrl: string;
  repositoryRef: string;
  workspaceId: string;
  defaultEndpointId: string;
  branchPrefix: string;
};

type IssueDraft = {
  title: string;
  description: string;
  endpointId: string;
  priority: IssuePriority;
};

type ProjectsPanelProps = {
  agentRuns: AgentRun[];
  endpoints: LlmEndpoint[];
  error?: string | null;
  issues: Issue[];
  loading: boolean;
  onOpenRun: (runId: string) => void;
  onSelectIssue: (id: string | null) => void;
  onSelectProject: (id: string | null) => void;
  onStartIssueRun: (issue: Issue) => Promise<void>;
  projects: AgentProject[];
  selectedEndpoint: LlmEndpoint | null;
  selectedIssueId: string | null;
  selectedProjectId: string | null;
  workspaces: SandboxWorkspace[];
};

const emptyProjectDraft: ProjectDraft = {
  targetId: null,
  name: "",
  description: "",
  repositoryUrl: "",
  repositoryRef: "",
  workspaceId: "",
  defaultEndpointId: "",
  branchPrefix: "agent"
};

const emptyIssueDraft: IssueDraft = {
  title: "",
  description: "",
  endpointId: "",
  priority: "medium"
};

const NO_WORKSPACE_VALUE = "__none__";

export const ProjectsPanel = ({
  agentRuns,
  endpoints,
  error,
  issues,
  loading,
  onOpenRun,
  onSelectIssue,
  onSelectProject,
  onStartIssueRun,
  projects,
  selectedEndpoint,
  selectedIssueId,
  selectedProjectId,
  workspaces
}: ProjectsPanelProps) => {
  const queryClient = useQueryClient();
  const [localError, setLocalError] = useState<string | null>(null);
  const [projectDraft, setProjectDraft] = useState<ProjectDraft | null>(null);
  const [issueDraft, setIssueDraft] = useState<IssueDraft>(emptyIssueDraft);
  const [savingProject, setSavingProject] = useState(false);
  const [savingIssue, setSavingIssue] = useState(false);
  const [runningIssueId, setRunningIssueId] = useState<string | null>(null);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const projectIssues = useMemo(
    () => (selectedProject ? issues.filter((issue) => issue.projectId === selectedProject.id) : []),
    [issues, selectedProject]
  );
  const selectedIssue = projectIssues.find((issue) => issue.id === selectedIssueId) ?? null;
  const runById = useMemo(() => new Map(agentRuns.map((run) => [run.id, run])), [agentRuns]);
  const selectedProjectWorkspace = selectedProject?.workspaceId
    ? workspaces.find((workspace) => workspace.id === selectedProject.workspaceId)
    : undefined;
  const visibleError = localError ?? error;
  const projectDraftKey = selectedProject?.id ?? null;
  const activeProjectDraft =
    projectDraft?.targetId === projectDraftKey ? projectDraft : toProjectDraft(selectedProject, selectedEndpoint?.id);
  const updateProjectDraft = (patch: Partial<ProjectDraft>) => {
    setProjectDraft((current) => ({
      ...(current?.targetId === projectDraftKey ? current : activeProjectDraft),
      ...patch,
      targetId: projectDraftKey
    }));
  };

  const refreshProjects = async () => {
    const [projectResponse, issueResponse, workspaceResponse] = await Promise.all([
      api.listProjects(),
      api.listIssues(),
      api.listSandboxWorkspaces()
    ]);
    queryClient.setQueryData(queryKeys.projects, projectResponse);
    queryClient.setQueryData(queryKeys.issues, issueResponse);
    queryClient.setQueryData(queryKeys.sandboxWorkspaces, workspaceResponse);
  };

  const startNewProject = () => {
    setLocalError(null);
    setProjectDraft(toProjectDraft(null, selectedEndpoint?.id));
    setIssueDraft(emptyIssueDraft);
    onSelectProject(null);
    onSelectIssue(null);
  };

  const saveProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingProject(true);
    setLocalError(null);

    try {
      const input = normalizeProjectDraft(activeProjectDraft);
      const response = selectedProject
        ? await api.updateProject(selectedProject.id, input)
        : await api.createProject(input as CreateAgentProjectInput);
      const workspaceResponse = await api.listSandboxWorkspaces();

      upsertProject(queryClient, response.project);
      queryClient.setQueryData(queryKeys.sandboxWorkspaces, workspaceResponse);
      setProjectDraft(toProjectDraft(response.project));
      onSelectProject(response.project.id);
    } catch (saveError) {
      setLocalError(getErrorMessage(saveError));
    } finally {
      setSavingProject(false);
    }
  };

  const createIssue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedProject) {
      return;
    }

    setSavingIssue(true);
    setLocalError(null);

    try {
      const response = await api.createIssue(
        normalizeIssueDraft(issueDraft, selectedProject.id, issueDraft.endpointId || selectedProject.defaultEndpointId || selectedEndpoint?.id)
      );
      upsertIssue(queryClient, response.issue);
      onSelectIssue(response.issue.id);
      setIssueDraft((current) => ({
        ...emptyIssueDraft,
        endpointId: current.endpointId
      }));
    } catch (saveError) {
      setLocalError(getErrorMessage(saveError));
    } finally {
      setSavingIssue(false);
    }
  };

  const analyzeIssue = async (issue: Issue) => {
    setRunningIssueId(issue.id);
    setLocalError(null);

    try {
      const response = await api.analyzeIssue(issue.id, {
        endpointId: issue.endpointId ?? selectedProject?.defaultEndpointId ?? selectedEndpoint?.id
      });
      upsertIssue(queryClient, response.issue);
      onSelectIssue(response.issue.id);
    } catch (actionError) {
      setLocalError(getErrorMessage(actionError));
    } finally {
      setRunningIssueId(null);
    }
  };

  const startIssue = async (issue: Issue) => {
    setRunningIssueId(issue.id);
    setLocalError(null);

    try {
      const readyIssue =
        issue.analysis && issue.branchName && (issue.workspaceId || selectedProject?.workspaceId)
          ? issue
          : (
              await api.analyzeIssue(issue.id, {
                endpointId: issue.endpointId ?? selectedProject?.defaultEndpointId ?? selectedEndpoint?.id
              })
            ).issue;

      upsertIssue(queryClient, readyIssue);
      onSelectIssue(readyIssue.id);
      await onStartIssueRun(readyIssue);
    } catch (actionError) {
      setLocalError(getErrorMessage(actionError));
    } finally {
      setRunningIssueId(null);
    }
  };

  return (
    <section className="grid h-full min-h-0 overflow-y-auto bg-background xl:grid-cols-[320px_minmax(0,1fr)] xl:overflow-hidden">
      <aside className="flex min-h-[280px] flex-col border-b xl:min-h-0 xl:border-b-0 xl:border-r">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Layers3 className="h-4 w-4" />
            Projects
          </h2>
          <div className="flex items-center gap-1">
            <Button disabled={loading} onClick={() => void refreshProjects()} size="icon" type="button" variant="ghost">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button onClick={startNewProject} size="sm" type="button" variant="secondary">
              <Plus />
              New
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {projects.length ? (
            <div className="divide-y">
              {projects.map((project) => (
                <button
                  className={cn(
                    "w-full px-3 py-2.5 text-left transition-colors hover:bg-muted/70",
                    selectedProject?.id === project.id && "bg-muted"
                  )}
                  key={project.id}
                  onClick={() => {
                    onSelectProject(project.id);
                    onSelectIssue(null);
                  }}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{project.name}</span>
                    <ProjectRepositoryBadge project={project} />
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{project.repositoryUrl || "Repository not configured"}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{issues.filter((issue) => issue.projectId === project.id).length} issues</span>
                    {project.repositoryRef ? <span>{project.repositoryRef}</span> : null}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-3">
              <EmptyState>No projects</EmptyState>
            </div>
          )}
        </div>
      </aside>

      <main className="flex min-h-[640px] flex-col xl:min-h-0">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <ProjectHeader
            issueCount={projectIssues.length}
            project={selectedProject}
            workspace={selectedProjectWorkspace}
          />

          {visibleError ? (
            <div className="border-b border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">{visibleError}</div>
          ) : null}

          <section className="border-b p-3">
            <form className="grid gap-3" onSubmit={saveProject}>
              <div className="grid gap-3 lg:grid-cols-[minmax(180px,260px)_minmax(260px,1fr)_140px_140px]">
                <Field label="Name">
                  <Input
                    onChange={(event) => updateProjectDraft({ name: event.target.value })}
                    placeholder="agent-fleet"
                    required
                    value={activeProjectDraft.name}
                  />
                </Field>
                <Field label="GitHub repository URL">
                  <Input
                    onChange={(event) => updateProjectDraft({ repositoryUrl: event.target.value })}
                    placeholder="https://github.com/org/repository.git"
                    value={activeProjectDraft.repositoryUrl}
                  />
                </Field>
                <Field label="Default ref">
                  <Input
                    onChange={(event) => updateProjectDraft({ repositoryRef: event.target.value })}
                    placeholder="main"
                    value={activeProjectDraft.repositoryRef}
                  />
                </Field>
                <Field label="Branch prefix">
                  <Input
                    onChange={(event) => updateProjectDraft({ branchPrefix: event.target.value })}
                    placeholder="agent"
                    required
                    value={activeProjectDraft.branchPrefix}
                  />
                </Field>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_260px_140px]">
                <Field label="Description">
                  <Input
                    onChange={(event) => updateProjectDraft({ description: event.target.value })}
                    placeholder="Issue intake, isolated coding runs, verification, and PR handoff."
                    required
                    value={activeProjectDraft.description}
                  />
                </Field>
                <Field label="Sandbox workspace">
                  <Select
                    onValueChange={(value) =>
                      updateProjectDraft({ workspaceId: value === NO_WORKSPACE_VALUE ? "" : value })
                    }
                    value={activeProjectDraft.workspaceId || NO_WORKSPACE_VALUE}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="No workspace" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_WORKSPACE_VALUE}>No workspace</SelectItem>
                      {workspaces.map((workspace) => (
                        <SelectItem key={workspace.id} value={workspace.id}>
                          {workspace.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Default endpoint">
                  <Select
                    onValueChange={(value) => updateProjectDraft({ defaultEndpointId: value })}
                    value={activeProjectDraft.defaultEndpointId || undefined}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Default" />
                    </SelectTrigger>
                    <SelectContent>
                      {endpoints.map((endpoint) => (
                        <SelectItem key={endpoint.id} value={endpoint.id}>
                          {endpoint.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Action">
                  <Button className="w-full" disabled={savingProject} type="submit">
                    {savingProject ? <Loader2 className="animate-spin" /> : <Save />}
                    Save
                  </Button>
                </Field>
              </div>
            </form>
          </section>

          <section className="flex min-h-[360px] flex-col">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <ClipboardList className="h-4 w-4" />
                  Issues
                </h2>
                <p className="truncate text-xs text-muted-foreground">
                  {selectedProject ? selectedProject.name : "Select or create a project"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <MetricBadge label="Ready" value={countStatus(projectIssues, "ready")} />
                <MetricBadge label="Running" value={countStatus(projectIssues, "running")} />
                <MetricBadge label="Review" value={countStatus(projectIssues, "review")} />
              </div>
            </div>

            {selectedProject ? (
              <>
                <form className="grid gap-2 border-b p-3 lg:grid-cols-[minmax(220px,320px)_minmax(260px,1fr)_120px_220px_120px]" onSubmit={createIssue}>
                  <Input
                    onChange={(event) => setIssueDraft((current) => ({ ...current, title: event.target.value }))}
                    placeholder="New issue title"
                    required
                    value={issueDraft.title}
                  />
                  <Input
                    onChange={(event) => setIssueDraft((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Expected change, constraints, verification"
                    required
                    value={issueDraft.description}
                  />
                  <Select
                    onValueChange={(value) => setIssueDraft((current) => ({ ...current, priority: value as IssuePriority }))}
                    value={issueDraft.priority}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["low", "medium", "high", "urgent"] satisfies IssuePriority[]).map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {priority}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    onValueChange={(value) => setIssueDraft((current) => ({ ...current, endpointId: value }))}
                    value={issueDraft.endpointId || selectedProject.defaultEndpointId || selectedEndpoint?.id || undefined}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Endpoint" />
                    </SelectTrigger>
                    <SelectContent>
                      {endpoints.map((endpoint) => (
                        <SelectItem key={endpoint.id} value={endpoint.id}>
                          {endpoint.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button disabled={savingIssue} type="submit">
                    {savingIssue ? <Loader2 className="animate-spin" /> : <Plus />}
                    Add
                  </Button>
                </form>

                <div className="min-h-0 flex-1 overflow-y-auto">
                  {projectIssues.length ? (
                    <div className="divide-y">
                      {projectIssues.map((issue) => (
                        <IssueRow
                          agentRun={issue.agentRunId ? runById.get(issue.agentRunId) : undefined}
                          issue={issue}
                          key={issue.id}
                          loading={runningIssueId === issue.id}
                          onAnalyze={() => void analyzeIssue(issue)}
                          onOpenRun={onOpenRun}
                          onSelect={() => onSelectIssue(issue.id)}
                          onStart={() => void startIssue(issue)}
                          projectWorkspaceId={selectedProject.workspaceId}
                          selected={selectedIssue?.id === issue.id}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="p-3">
                      <EmptyState>No issues in this project</EmptyState>
                    </div>
                  )}
                </div>

                {selectedIssue ? (
                  <IssueDetail
                    issue={selectedIssue}
                    run={selectedIssue.agentRunId ? runById.get(selectedIssue.agentRunId) : undefined}
                    workspace={workspaces.find((workspace) => workspace.id === (selectedIssue.workspaceId ?? selectedProject.workspaceId))}
                  />
                ) : null}
              </>
            ) : (
              <div className="p-3">
                <EmptyState>Select a project or create a new one</EmptyState>
              </div>
            )}
          </section>
        </div>
      </main>
    </section>
  );
};

const ProjectHeader = ({
  issueCount,
  project,
  workspace
}: {
  issueCount: number;
  project: AgentProject | null;
  workspace?: SandboxWorkspace;
}) => (
  <header className="flex flex-col gap-2 border-b px-3 py-2 md:flex-row md:items-center md:justify-between">
    <div className="min-w-0">
      <h1 className="truncate text-base font-semibold">{project?.name ?? "New project"}</h1>
      <p className="truncate text-xs text-muted-foreground">
        {project?.repositoryUrl ?? "Connect a repository or sandbox workspace, then register issues for the coding agent."}
      </p>
    </div>
    <div className="flex flex-wrap gap-2">
      {project ? <ProjectRepositoryBadge project={project} /> : <StateBadge tone="warning">Draft</StateBadge>}
      <Badge variant="secondary">{issueCount} issues</Badge>
      {workspace ? <Badge variant="outline">{workspace.name}</Badge> : null}
    </div>
  </header>
);

const IssueRow = ({
  agentRun,
  issue,
  loading,
  onAnalyze,
  onOpenRun,
  onSelect,
  onStart,
  projectWorkspaceId,
  selected
}: {
  agentRun?: AgentRun;
  issue: Issue;
  loading: boolean;
  onAnalyze: () => void;
  onOpenRun: (runId: string) => void;
  onSelect: () => void;
  onStart: () => void;
  projectWorkspaceId?: string;
  selected: boolean;
}) => {
  const analyzed = Boolean(issue.analysis && issue.branchName && issue.status !== "backlog");
  const workspaceReady = Boolean(issue.workspaceId ?? projectWorkspaceId);
  const running = issue.status === "running";
  const runDisabledReason = !analyzed
    ? "Analyze this issue first."
    : !workspaceReady
      ? "Connect a repository or sandbox workspace to this project first."
      : running
        ? "This issue is already running."
        : undefined;
  const canRun = !loading && !runDisabledReason;

  return (
    <div className={cn("grid gap-2 px-3 py-2 md:grid-cols-[minmax(0,1fr)_auto]", selected && "bg-muted/60")}>
      <button className="min-w-0 text-left" onClick={onSelect} type="button">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{issue.title}</span>
          <IssueStatusBadge status={issue.status} />
          <PriorityBadge priority={issue.priority} />
          {agentRun ? <Badge variant="outline">{agentRun.status}</Badge> : null}
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{issue.description}</div>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {issue.branchName ? (
            <span className="inline-flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              {issue.branchName}
            </span>
          ) : null}
          <span>{formatDateTime(issue.updatedAt)}</span>
        </div>
      </button>
      <div className="flex items-center gap-1 md:justify-end">
        <Button disabled={loading || running} onClick={onAnalyze} size="sm" type="button" variant={analyzed ? "ghost" : "outline"}>
          {loading ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
          {analyzed ? "Re-analyze" : "Analyze"}
        </Button>
        <Button disabled={!canRun} onClick={onStart} size="sm" title={runDisabledReason} type="button">
          {loading ? <Loader2 className="animate-spin" /> : <Play />}
          Run
        </Button>
        {issue.agentRunId ? (
          <Button onClick={() => onOpenRun(issue.agentRunId!)} size="sm" type="button" variant="secondary">
            <Bot />
            Open
          </Button>
        ) : null}
      </div>
    </div>
  );
};

const IssueDetail = ({
  issue,
  run,
  workspace
}: {
  issue: Issue;
  run?: AgentRun;
  workspace?: SandboxWorkspace;
}) => (
  <section className="border-t bg-muted/20 p-3">
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{issue.title}</h3>
          <IssueStatusBadge status={issue.status} />
        </div>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{issue.description}</p>
        {issue.analysis ? (
          <pre className="mt-3 max-h-40 overflow-y-auto rounded-md border bg-background p-2 text-xs leading-5 text-muted-foreground">
            {issue.analysis}
          </pre>
        ) : null}
      </div>
      <div className="grid content-start gap-1 text-sm">
        <InfoRow label="Priority" value={issue.priority} />
        <InfoRow label="Sandbox" value={workspace?.name || "Not ready"} />
        <InfoRow label="Branch" value={issue.branchName || "Not analyzed"} />
        <InfoRow label="Run" value={run?.status || "Not started"} />
      </div>
    </div>
  </section>
);

const Field = ({ children, label }: { children: ReactNode; label: string }) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    {children}
  </div>
);

const EmptyState = ({ children }: { children: ReactNode }) => (
  <div className="rounded-md border border-dashed bg-background px-4 py-8 text-center text-sm text-muted-foreground">{children}</div>
);

const MetricBadge = ({ label, value }: { label: string; value: number }) => (
  <Badge className="gap-1" variant="secondary">
    {label}
    <span className="font-mono">{value}</span>
  </Badge>
);

const ProjectRepositoryBadge = ({ project }: { project: AgentProject }) => {
  if (project.workspaceId) {
    return (
      <StateBadge tone="success">
        {project.repositoryUrl ? <Github className="h-3 w-3" /> : <Layers3 className="h-3 w-3" />}
        Ready
      </StateBadge>
    );
  }

  return <StateBadge tone="warning">No repo</StateBadge>;
};

const IssueStatusBadge = ({ status }: { status: IssueStatus }) => {
  if (status === "completed") {
    return <StateBadge tone="success">completed</StateBadge>;
  }

  if (status === "failed" || status === "blocked") {
    return <Badge variant="destructive">{status}</Badge>;
  }

  return <StateBadge tone={status === "running" || status === "ready" || status === "review" ? "success" : "warning"}>{status}</StateBadge>;
};

const PriorityBadge = ({ priority }: { priority: IssuePriority }) => {
  if (priority === "urgent" || priority === "high") {
    return <Badge variant={priority === "urgent" ? "destructive" : "secondary"}>{priority}</Badge>;
  }

  return <Badge variant="outline">{priority}</Badge>;
};

const StateBadge = ({ children, tone }: { children: ReactNode; tone: "success" | "warning" }) => (
  <Badge
    className={cn(
      "gap-1 hover:bg-current/0",
      tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
      tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50"
    )}
    variant="outline"
  >
    {children}
  </Badge>
);

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-start justify-between gap-3 border-b py-2 text-sm last:border-b-0">
    <span className="font-medium">{label}</span>
    <span className="min-w-0 break-words text-right text-muted-foreground">{value}</span>
  </div>
);

const normalizeProjectDraft = (draft: ProjectDraft): CreateAgentProjectInput | UpdateAgentProjectInput => ({
  branchPrefix: draft.branchPrefix.trim() || "agent",
  defaultEndpointId: draft.defaultEndpointId || undefined,
  description: draft.description.trim(),
  name: draft.name.trim(),
  repositoryRef: draft.repositoryRef.trim() || undefined,
  repositoryUrl: draft.repositoryUrl.trim() || undefined,
  workspaceId: draft.workspaceId || undefined
});

const toProjectDraft = (project: AgentProject | null, fallbackEndpointId = ""): ProjectDraft =>
  project
    ? {
        targetId: project.id,
        branchPrefix: project.branchPrefix,
        defaultEndpointId: project.defaultEndpointId ?? "",
        description: project.description,
        name: project.name,
        repositoryRef: project.repositoryRef ?? "",
        repositoryUrl: project.repositoryUrl ?? "",
        workspaceId: project.workspaceId ?? ""
      }
    : {
        ...emptyProjectDraft,
        defaultEndpointId: fallbackEndpointId
      };

const normalizeIssueDraft = (draft: IssueDraft, projectId: string, endpointId?: string): CreateIssueInput => ({
  description: draft.description.trim(),
  endpointId: endpointId || undefined,
  priority: draft.priority,
  projectId,
  title: draft.title.trim()
});

const countStatus = (issues: Issue[], status: IssueStatus) => issues.filter((issue) => issue.status === status).length;

const upsertProject = (queryClient: ReturnType<typeof useQueryClient>, project: AgentProject) => {
  queryClient.setQueryData<{ projects: AgentProject[] }>(queryKeys.projects, (current) => ({
    projects: [project, ...(current?.projects ?? []).filter((item) => item.id !== project.id)]
  }));
};

const upsertIssue = (queryClient: ReturnType<typeof useQueryClient>, issue: Issue) => {
  queryClient.setQueryData<{ issues: Issue[] }>(queryKeys.issues, (current) => ({
    issues: [issue, ...(current?.issues ?? []).filter((item) => item.id !== issue.id)]
  }));
};

const formatDateTime = (value: string) => new Date(value).toLocaleString();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
};
