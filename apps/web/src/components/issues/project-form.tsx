import type { FormEvent } from 'react'
import type {
  AgentRuntime,
  LlmEndpoint,
  SandboxWorkspace,
} from '@patchlane/shared'
import { Loader2, Plus, Save } from 'lucide-react'
import { Button } from '@patchlane/ui/button'
import { Input } from '@patchlane/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@patchlane/ui/select'
import { Textarea } from '@patchlane/ui/textarea'
import { NO_WORKSPACE_VALUE } from './constants'
import { Field } from './common'
import type { ProjectDraft } from './types'

export const ProjectForm = ({
  draft,
  endpoints,
  onChange,
  onSubmit,
  saving,
  submitLabel,
  workspaces,
}: {
  draft: ProjectDraft
  endpoints: LlmEndpoint[]
  onChange: (patch: Partial<ProjectDraft>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  saving: boolean
  submitLabel: string
  workspaces: SandboxWorkspace[]
}) => {
  const SubmitIcon = submitLabel === 'Create' ? Plus : Save
  const planningEndpoints = endpoints.filter(
    (endpoint) => endpoint.runtimeType === 'openai_compatible',
  )
  const runtimeConnectors = endpoints.filter((endpoint) =>
    draft.defaultAgentRuntime === 'opencode'
      ? endpoint.runtimeType === 'opencode_cli'
      : draft.defaultAgentRuntime === 'codex'
        ? endpoint.runtimeType === 'codex_cli'
        : endpoint.runtimeType === 'openai_compatible',
  )

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px_160px]">
        <Field label="Name">
          <Input
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="patchlane"
            required
            value={draft.name}
          />
        </Field>
        <Field label="Code">
          <Input
            className="font-mono uppercase"
            maxLength={8}
            onChange={(event) =>
              onChange({ code: event.target.value.toUpperCase() })
            }
            pattern="[A-Z][A-Z0-9]{1,7}"
            placeholder="PLN"
            value={draft.code}
          />
        </Field>
        <Field label="Branch prefix">
          <Input
            onChange={(event) => onChange({ branchPrefix: event.target.value })}
            placeholder="agent"
            required
            value={draft.branchPrefix}
          />
        </Field>
      </div>

      <Field label="Description">
        <Textarea
          className="min-h-20 resize-none"
          onChange={(event) => onChange({ description: event.target.value })}
          placeholder="Issue intake, isolated coding runs, verification, and PR handoff."
          required
          value={draft.description}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
        <Field label="GitHub repository URL">
          <Input
            onChange={(event) =>
              onChange({ repositoryUrl: event.target.value })
            }
            placeholder="https://github.com/org/repository.git"
            value={draft.repositoryUrl}
          />
        </Field>
        <Field label="Default ref">
          <Input
            onChange={(event) =>
              onChange({ repositoryRef: event.target.value })
            }
            placeholder="main"
            value={draft.repositoryRef}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Sandbox workspace">
          <Select
            onValueChange={(value) =>
              onChange({
                workspaceId: value === NO_WORKSPACE_VALUE ? '' : value,
              })
            }
            value={draft.workspaceId || NO_WORKSPACE_VALUE}
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
        <Field label="Planning runtime">
          <Select
            onValueChange={(value) => onChange({ defaultEndpointId: value })}
            value={draft.defaultEndpointId || undefined}
          >
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Default" />
            </SelectTrigger>
            <SelectContent>
              {planningEndpoints.map((endpoint) => (
                <SelectItem key={endpoint.id} value={endpoint.id}>
                  {endpoint.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Agent runtime">
          <Select
            onValueChange={(value) =>
              onChange({
                defaultAgentRuntime: parseAgentRuntime(value),
                defaultAgentRuntimeConnectorId: '',
              })
            }
            value={draft.defaultAgentRuntime}
          >
            <SelectTrigger className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="patchlane">Patchlane</SelectItem>
              <SelectItem value="opencode">OpenCode</SelectItem>
              <SelectItem value="codex">Codex</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Runtime connector">
          <Select
            onValueChange={(value) =>
              onChange({ defaultAgentRuntimeConnectorId: value })
            }
            value={draft.defaultAgentRuntimeConnectorId || undefined}
          >
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Default" />
            </SelectTrigger>
            <SelectContent>
              {runtimeConnectors.map((endpoint) => (
                <SelectItem key={endpoint.id} value={endpoint.id}>
                  {endpoint.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <label className="flex items-start gap-2.5 rounded-md border p-3">
        <input
          checked={draft.autopilot}
          className="mt-0.5 size-4"
          onChange={(event) => onChange({ autopilot: event.target.checked })}
          type="checkbox"
        />
        <span className="min-w-0">
          <span className="text-sm font-medium">Autopilot</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Automatically plan new issues in this project and run their tasks
            through to review. Pauses on agent questions, failures, or when
            blocked. Requires a configured repository and endpoint.
          </span>
        </span>
      </label>

      <div className="flex justify-end border-t pt-4">
        <Button className="min-w-28" disabled={saving} type="submit">
          {saving ? <Loader2 className="animate-spin" /> : <SubmitIcon />}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

const parseAgentRuntime = (value: string): AgentRuntime => {
  if (value === 'opencode' || value === 'codex') {
    return value
  }

  return 'patchlane'
}
