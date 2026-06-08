import type {
  CreateLlmEndpointInput,
  LlmEndpoint,
  LlmEndpointTestResult,
} from '@patchlane/shared'
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Server,
  Terminal,
  Trash2,
} from 'lucide-react'
import { parseAsString, useQueryState } from 'nuqs'
import {
  emptyEndpointDraft as emptyDraft,
  type EndpointDraft,
} from '@/components/app/app-types'
import { EmptyState, Field } from '@/components/app/panel-primitives'
import { StateBadge, TestBadge } from '@/components/app/status-badges'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ErrorBanner,
  PageAside,
  PageHeader,
  PageList,
  PageListItem,
  PageListSkeleton,
  PagePane,
  PageScroll,
  PageSection,
  PageSplit,
} from '@/components/layout/page-primitives'
import { api } from '@/lib/api'
import { getErrorMessage, getQueryErrorMessage } from '@/lib/errors'
import { queryKeys } from '@/lib/query-client'

export const EndpointSettingsPage = () => {
  const queryClient = useQueryClient()
  const [selectedEndpointId, setSelectedEndpointId] = useQueryState(
    'endpoint',
    parseAsString.withOptions({ history: 'replace', shallow: true }),
  )
  const [draft, setDraft] = useState<EndpointDraft>(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<
    Record<string, LlmEndpointTestResult>
  >({})
  const [error, setError] = useState<string | null>(null)

  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: api.health,
  })
  const endpointsQuery = useQuery({
    queryKey: queryKeys.endpoints,
    queryFn: api.listEndpoints,
  })

  const endpoints = useMemo(
    () => endpointsQuery.data?.endpoints ?? [],
    [endpointsQuery.data?.endpoints],
  )
  const selectedEndpoint = useMemo(
    () =>
      selectedEndpointId && selectedEndpointId !== 'new'
        ? (endpoints.find((endpoint) => endpoint.id === selectedEndpointId) ??
          null)
        : null,
    [endpoints, selectedEndpointId],
  )
  const endpointError =
    error ?? getQueryErrorMessage(healthQuery.error, endpointsQuery.error)
  const loading = endpointsQuery.isFetching

  const selectEndpoint = useCallback(
    (endpoint: LlmEndpoint) => {
      void setSelectedEndpointId(endpoint.id)
      setDraft(toEndpointDraft(endpoint))
    },
    [setSelectedEndpointId],
  )

  const startNewEndpoint = () => {
    setDraft(emptyDraft)
    setError(null)
    void setSelectedEndpointId('new')
  }

  const saveEndpoint = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const input = normalizeEndpointDraft(draft)
      const response = selectedEndpoint
        ? await api.updateEndpoint(selectedEndpoint.id, input)
        : await api.createEndpoint(input)

      const endpointResponse = await api.listEndpoints()
      queryClient.setQueryData(queryKeys.endpoints, endpointResponse)
      selectEndpoint(response.endpoint)
    } catch (saveError) {
      setError(getErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  const deleteEndpoint = async () => {
    if (!selectedEndpoint) {
      return
    }

    setSaving(true)
    setError(null)

    try {
      await api.deleteEndpoint(selectedEndpoint.id)
      const response = await api.listEndpoints()
      queryClient.setQueryData(queryKeys.endpoints, response)

      if (response.endpoints[0]) {
        selectEndpoint(response.endpoints[0])
      } else {
        startNewEndpoint()
      }
    } catch (deleteError) {
      setError(getErrorMessage(deleteError))
    } finally {
      setSaving(false)
    }
  }

  const testEndpoint = async (endpoint: LlmEndpoint) => {
    setTestingId(endpoint.id)
    setError(null)

    try {
      const response = await api.testEndpoint(endpoint.id)
      setTestResults((current) => ({
        ...current,
        [endpoint.id]: response.result,
      }))
    } catch (testError) {
      setTestResults((current) => ({
        ...current,
        [endpoint.id]: {
          ok: false,
          latencyMs: 0,
          models: [],
          error: getErrorMessage(testError),
        },
      }))
    } finally {
      setTestingId(null)
    }
  }

  useEffect(() => {
    if (!endpoints.length) {
      if (selectedEndpointId && selectedEndpointId !== 'new') {
        void setSelectedEndpointId(null)
      }
      return
    }

    if (!selectedEndpointId) {
      void setSelectedEndpointId(endpoints[0]!.id)
      return
    }

    if (
      selectedEndpointId !== 'new' &&
      !endpoints.some((endpoint) => endpoint.id === selectedEndpointId)
    ) {
      void setSelectedEndpointId(endpoints[0]!.id)
    }
  }, [endpoints, selectedEndpointId, setSelectedEndpointId])

  useEffect(() => {
    if (selectedEndpoint) {
      setDraft(toEndpointDraft(selectedEndpoint))
      return
    }

    if (selectedEndpointId === 'new' || !selectedEndpointId) {
      setDraft(emptyDraft)
    }
  }, [selectedEndpoint, selectedEndpointId])

  return (
    <PageSplit>
      <PagePane minHeight="none">
        <PageHeader
          actions={
            <Button
              onClick={startNewEndpoint}
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus />
              New
            </Button>
          }
          description="OpenAI-compatible model APIs and local agent backends"
          icon={<Server className="h-4 w-4" />}
          title="Agent Runtime"
        />
        <PageScroll>
          <ErrorBanner message={endpointError} />

          {loading ? (
            <PageListSkeleton />
          ) : endpoints.length > 0 ? (
            <PageList>
              {endpoints.map((endpoint) => (
                <EndpointCard
                  endpoint={endpoint}
                  key={endpoint.id}
                  selected={endpoint.id === selectedEndpointId}
                  testResult={testResults[endpoint.id]}
                  testing={testingId === endpoint.id}
                  onSelect={() => selectEndpoint(endpoint)}
                  onTest={() => void testEndpoint(endpoint)}
                />
              ))}
            </PageList>
          ) : (
            <div className="p-2">
              <EmptyState>No agent runtimes</EmptyState>
            </div>
          )}
        </PageScroll>
      </PagePane>

      <PageAside viewportClassName="">
        <PageSection
          title={selectedEndpoint ? 'Runtime settings' : 'New runtime'}
        >
          <form className="space-y-2.5" onSubmit={saveEndpoint}>
            <Field label="Runtime type">
              <Select
                onValueChange={(value) =>
                  setDraft({
                    ...draft,
                    runtimeType:
                      value === 'opencode_cli'
                        ? 'opencode_cli'
                        : 'openai_compatible',
                  })
                }
                value={draft.runtimeType}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai_compatible">
                    OpenAI Compatible API
                  </SelectItem>
                  <SelectItem value="opencode_cli">OpenCode CLI</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Name">
              <Input
                value={draft.name}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    name: event.target.value,
                  })
                }
                placeholder="Ollama Local"
                required
              />
            </Field>

            {draft.runtimeType === 'openai_compatible' ? (
              <>
                <Field label="Base URL">
                  <Input
                    value={draft.baseUrl}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        baseUrl: event.target.value,
                      })
                    }
                    placeholder="http://localhost:11434/v1"
                    required
                  />
                </Field>

                <Field label="Default model">
                  <Input
                    value={draft.defaultModel}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        defaultModel: event.target.value,
                      })
                    }
                    placeholder="llama3.1"
                    required
                  />
                </Field>

                <Field label="API key env">
                  <Input
                    value={draft.apiKeyEnvVar || ''}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        apiKeyEnvVar: event.target.value,
                      })
                    }
                    placeholder="LOCAL_LLM_API_KEY"
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="Command">
                  <Input
                    value={draft.opencodeCommand}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        opencodeCommand: event.target.value,
                      })
                    }
                    placeholder="opencode"
                    required
                  />
                </Field>

                <Field label="Command args">
                  <Input
                    value={draft.opencodeCommandArgs}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        opencodeCommandArgs: event.target.value,
                      })
                    }
                    placeholder='["dlx","opencode-ai@1.16.2"]'
                  />
                </Field>

                <Field label="Default model">
                  <Input
                    value={draft.defaultModel}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        defaultModel: event.target.value,
                      })
                    }
                    placeholder="provider/model"
                  />
                </Field>

                <label className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm">
                  <span className="font-medium">Skip permissions</span>
                  <input
                    checked={draft.opencodeDangerouslySkipPermissions}
                    className="h-4 w-4 accent-primary"
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        opencodeDangerouslySkipPermissions:
                          event.target.checked,
                      })
                    }
                    type="checkbox"
                  />
                </label>
              </>
            )}

            <label className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm">
              <span className="font-medium">Enabled</span>
              <input
                checked={draft.enabled}
                className="h-4 w-4 accent-primary"
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    enabled: event.target.checked,
                  })
                }
                type="checkbox"
              />
            </label>

            <div className="flex items-center justify-end gap-2 border-t pt-3">
              {selectedEndpoint ? (
                <Button
                  className="mr-auto"
                  disabled={saving}
                  onClick={() => void deleteEndpoint()}
                  size="sm"
                  type="button"
                  variant="destructive"
                >
                  <Trash2 />
                  Delete
                </Button>
              ) : null}
              <Button disabled={saving} size="sm" type="submit">
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                Save
              </Button>
            </div>
          </form>
        </PageSection>
      </PageAside>
    </PageSplit>
  )
}

const EndpointCard = ({
  endpoint,
  selected,
  testResult,
  testing,
  onSelect,
  onTest,
}: {
  endpoint: LlmEndpoint
  selected: boolean
  testResult?: LlmEndpointTestResult
  testing: boolean
  onSelect: () => void
  onTest: () => void
}) => {
  const RuntimeIcon = endpoint.runtimeType === 'opencode_cli' ? Terminal : Server

  return (
    <PageListItem selected={selected}>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <button
          className="min-w-0 flex-1 text-left"
          onClick={onSelect}
          type="button"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <RuntimeIcon className="h-4 w-4 text-primary" />
            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">
              {endpoint.name}
            </h3>
            <StateBadge tone={endpoint.enabled ? 'success' : 'warning'}>
              {endpoint.enabled ? 'Enabled' : 'Disabled'}
            </StateBadge>
            <Badge variant="outline">{getRuntimeTypeLabel(endpoint)}</Badge>
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {endpoint.runtimeType === 'opencode_cli' ? (
              <>
                <span className="truncate">{endpoint.opencodeCommand}</span>
                {endpoint.opencodeCommandArgs.length ? (
                  <span className="truncate">
                    {endpoint.opencodeCommandArgs.join(' ')}
                  </span>
                ) : null}
              </>
            ) : (
              <>
                <span className="truncate">{endpoint.baseUrl}</span>
                <span className="truncate">{endpoint.defaultModel}</span>
              </>
            )}
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {testResult ? <TestBadge result={testResult} /> : null}
          <Button
            disabled={testing || !endpoint.enabled}
            onClick={onTest}
            size="sm"
            type="button"
            variant="outline"
          >
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

      {testResult?.error ? (
        <p className="mt-2 text-sm text-destructive">{testResult.error}</p>
      ) : null}
    </PageListItem>
  )
}

const toEndpointDraft = (endpoint: LlmEndpoint): EndpointDraft => ({
  runtimeType: endpoint.runtimeType,
  name: endpoint.name,
  baseUrl: endpoint.baseUrl,
  defaultModel: endpoint.defaultModel,
  apiKeyEnvVar: endpoint.apiKeyEnvVar || '',
  opencodeCommand: endpoint.opencodeCommand,
  opencodeCommandArgs: endpoint.opencodeCommandArgs.length
    ? JSON.stringify(endpoint.opencodeCommandArgs)
    : '',
  opencodeDangerouslySkipPermissions:
    endpoint.opencodeDangerouslySkipPermissions,
  enabled: endpoint.enabled,
})

const normalizeEndpointDraft = (
  draft: EndpointDraft,
): CreateLlmEndpointInput => ({
  ...draft,
  apiKeyEnvVar: draft.apiKeyEnvVar?.trim() || undefined,
  baseUrl:
    draft.runtimeType === 'opencode_cli'
      ? 'opencode://cli'
      : draft.baseUrl.trim(),
  defaultModel: draft.defaultModel.trim(),
  name: draft.name.trim(),
  opencodeCommand: draft.opencodeCommand.trim() || 'opencode',
  opencodeCommandArgs: parseCommandArgsDraft(draft.opencodeCommandArgs),
})

const getRuntimeTypeLabel = (endpoint: LlmEndpoint) => {
  return endpoint.runtimeType === 'opencode_cli'
    ? 'OpenCode CLI'
    : 'OpenAI Compatible'
}

const parseCommandArgsDraft = (value: string) => {
  const trimmed = value.trim()

  if (!trimmed) {
    return []
  }

  const parsed = JSON.parse(trimmed) as unknown

  if (
    Array.isArray(parsed) &&
    parsed.every((item) => typeof item === 'string')
  ) {
    return parsed
  }

  throw new Error('Command args must be a JSON string array')
}
