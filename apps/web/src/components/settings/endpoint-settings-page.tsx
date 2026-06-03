import type {
  LlmEndpoint,
  LlmEndpointTestResult,
} from '@agent-fleet/shared'
import type { FormEvent } from 'react'
import { Loader2, Plus, RefreshCw, Save, Server, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState, Field } from '@/components/app/panel-primitives'
import { StateBadge, TestBadge } from '@/components/app/status-badges'
import type { EndpointDraft } from '@/components/app/app-types'
import { cn } from '@/lib/utils'

export const EndpointSettingsPage = ({
  draft,
  endpointError,
  endpoints,
  loading,
  onDeleteEndpoint,
  onDraftChange,
  onSaveEndpoint,
  onSelectEndpoint,
  onStartNewEndpoint,
  onTestEndpoint,
  saving,
  selectedEndpoint,
  selectedEndpointId,
  testingId,
  testResults,
}: {
  draft: EndpointDraft
  endpointError: string | null
  endpoints: LlmEndpoint[]
  loading: boolean
  onDeleteEndpoint: () => void
  onDraftChange: (draft: EndpointDraft) => void
  onSaveEndpoint: (event: FormEvent<HTMLFormElement>) => void
  onSelectEndpoint: (endpoint: LlmEndpoint) => void
  onStartNewEndpoint: () => void
  onTestEndpoint: (endpoint: LlmEndpoint) => void
  saving: boolean
  selectedEndpoint: LlmEndpoint | null
  selectedEndpointId: string | null
  testingId: string | null
  testResults: Record<string, LlmEndpointTestResult>
}) => {
  return (
    <section className="grid h-full min-h-0 overflow-y-auto bg-background lg:grid-cols-[minmax(0,1fr)_360px] lg:overflow-hidden">
      <div className="flex min-h-[320px] flex-col lg:min-h-0">
        <div className="flex min-h-10 items-center justify-between border-b px-3 py-2">
          <h2 className="text-sm font-semibold">Endpoints</h2>
          <Button variant="secondary" onClick={onStartNewEndpoint} size="sm">
            <Plus />
            New
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1" viewportClassName="p-2">
          <div className="grid gap-1.5">
            {endpointError ? (
              <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {endpointError}
              </div>
            ) : null}

            {loading ? (
              <div className="grid gap-2">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="h-24 animate-pulse rounded-md border bg-muted/40"
                  />
                ))}
              </div>
            ) : endpoints.length > 0 ? (
              <div className="grid gap-2">
                {endpoints.map((endpoint) => (
                  <EndpointCard
                    endpoint={endpoint}
                    key={endpoint.id}
                    selected={endpoint.id === selectedEndpointId}
                    testResult={testResults[endpoint.id]}
                    testing={testingId === endpoint.id}
                    onSelect={() => onSelectEndpoint(endpoint)}
                    onTest={() => onTestEndpoint(endpoint)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState>No endpoints</EmptyState>
            )}
          </div>
        </ScrollArea>
      </div>

      <ScrollArea
        className="min-h-0 border-t bg-muted/20 lg:border-l lg:border-t-0"
        viewportClassName="p-3"
      >
        <div className="mb-2">
          <h2 className="text-sm font-semibold">
            {selectedEndpoint ? 'Endpoint settings' : 'New endpoint'}
          </h2>
        </div>
        <form className="space-y-2.5" onSubmit={onSaveEndpoint}>
          <Field label="Name">
            <Input
              value={draft.name}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  name: event.target.value,
                })
              }
              placeholder="Ollama Local"
              required
            />
          </Field>

          <Field label="Base URL">
            <Input
              value={draft.baseUrl}
              onChange={(event) =>
                onDraftChange({
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
                onDraftChange({
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
                onDraftChange({
                  ...draft,
                  apiKeyEnvVar: event.target.value,
                })
              }
              placeholder="LOCAL_LLM_API_KEY"
            />
          </Field>

          <label className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span className="font-medium">Enabled</span>
            <input
              checked={draft.enabled}
              className="h-4 w-4 accent-primary"
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  enabled: event.target.checked,
                })
              }
              type="checkbox"
            />
          </label>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" disabled={saving} type="submit">
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              Save
            </Button>
            {selectedEndpoint ? (
              <Button
                disabled={saving}
                onClick={onDeleteEndpoint}
                type="button"
                variant="destructive"
              >
                <Trash2 />
                Delete
              </Button>
            ) : null}
          </div>
        </form>
      </ScrollArea>
    </section>
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
  return (
    <div
      className={cn(
        'rounded-md border bg-background p-2 transition-colors',
        selected && 'border-primary ring-1 ring-primary',
      )}
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <button
          className="min-w-0 flex-1 text-left"
          onClick={onSelect}
          type="button"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            <h3 className="truncate text-sm font-semibold">{endpoint.name}</h3>
            <StateBadge tone={endpoint.enabled ? 'success' : 'warning'}>
              {endpoint.enabled ? 'Enabled' : 'Disabled'}
            </StateBadge>
          </div>
          <div className="mt-1 grid gap-1 text-xs text-muted-foreground">
            <span className="truncate">{endpoint.baseUrl}</span>
            <span className="truncate">{endpoint.defaultModel}</span>
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
    </div>
  )
}

