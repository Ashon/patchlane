import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CreateLlmEndpointInput, LlmEndpoint, LlmEndpointTestResult } from "@agent-fleet/shared";
import {
  CheckCircle2,
  Loader2,
  MessageSquare,
  Network,
  Plus,
  RefreshCw,
  Save,
  Server,
  Settings,
  Trash2,
  XCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/components/chat/chat-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type EndpointDraft = {
  name: string;
  baseUrl: string;
  defaultModel: string;
  apiKeyEnvVar: string;
  enabled: boolean;
};

const emptyDraft: EndpointDraft = {
  name: "",
  baseUrl: "http://localhost:11434/v1",
  defaultModel: "",
  apiKeyEnvVar: "",
  enabled: true
};

export default function App() {
  const [endpoints, setEndpoints] = useState<LlmEndpoint[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EndpointDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, LlmEndpointTestResult>>({});
  const [error, setError] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  const selectedEndpoint = useMemo(
    () => endpoints.find((endpoint) => endpoint.id === selectedId) ?? null,
    [endpoints, selectedId]
  );

  const enabledCount = endpoints.filter((endpoint) => endpoint.enabled).length;

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [health, endpointResponse] = await Promise.all([api.health(), api.listEndpoints()]);
      setApiOnline(health.ok);
      setEndpoints(endpointResponse.endpoints);

      if (!selectedIdRef.current && endpointResponse.endpoints[0]) {
        selectEndpoint(endpointResponse.endpoints[0]);
      }
    } catch (loadError) {
      setApiOnline(false);
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [selectEndpoint]);

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

  return (
    <main className="min-h-screen bg-muted/30">
      <section className="border-b bg-background">
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
            <Button variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Refresh
            </Button>
          </div>
        </div>
      </section>

      <Tabs className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8" defaultValue="chat">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <TabsList>
            <TabsTrigger className="gap-2" value="chat">
              <MessageSquare className="h-4 w-4" />
              Chat
            </TabsTrigger>
            <TabsTrigger className="gap-2" value="settings">
              <Settings className="h-4 w-4" />
              Endpoint Settings
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

        <TabsContent className="mt-0" value="chat">
          <ChatPanel endpoint={selectedEndpoint} />
        </TabsContent>

        <TabsContent className="mt-0" value="settings">
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
            <Card className="flex min-h-[calc(100vh-172px)] flex-col">
              <CardHeader className="flex-row items-center justify-between space-y-0 p-4">
                <CardTitle className="text-base">Endpoints</CardTitle>
                <Button variant="secondary" onClick={startNewEndpoint} size="sm">
                  <Plus />
                  New
                </Button>
              </CardHeader>
              <Separator />
              <CardContent className="min-h-0 flex-1 p-0">
                <ScrollArea className="h-[520px] lg:h-full">
                  <div className="space-y-2 p-3">
                    {error ? (
                      <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {error}
                      </div>
                    ) : null}

                    {loading ? (
                      <div className="grid gap-2">
                        {[0, 1, 2].map((item) => (
                          <div key={item} className="h-24 animate-pulse rounded-md border bg-card" />
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
                      <div className="rounded-lg border border-dashed bg-card px-4 py-10 text-center text-sm text-muted-foreground">
                        No endpoints
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="h-fit">
              <CardHeader className="p-4">
                <CardTitle className="text-base">{selectedEndpoint ? "Endpoint settings" : "New endpoint"}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
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
              </CardContent>
            </Card>
          </section>
        </TabsContent>
      </Tabs>
    </main>
  );
}

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
    <Card className={cn("transition-colors", selected && "border-primary ring-1 ring-primary")}>
      <CardContent className="p-4">
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
      </CardContent>
    </Card>
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

const normalizeDraft = (draft: EndpointDraft): CreateLlmEndpointInput => ({
  ...draft,
  apiKeyEnvVar: draft.apiKeyEnvVar?.trim() || undefined,
  baseUrl: draft.baseUrl.trim(),
  defaultModel: draft.defaultModel.trim(),
  name: draft.name.trim()
});

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
};
