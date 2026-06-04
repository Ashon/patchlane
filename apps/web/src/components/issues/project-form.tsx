import type { FormEvent } from 'react'
import type { LlmEndpoint, SandboxWorkspace } from '@patchlane/shared'
import { Loader2, Plus, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
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

      <div className="grid gap-3 sm:grid-cols-2">
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
        <Field label="Default endpoint">
          <Select
            onValueChange={(value) => onChange({ defaultEndpointId: value })}
            value={draft.defaultEndpointId || undefined}
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
      </div>

      <div className="flex justify-end border-t pt-4">
        <Button className="min-w-28" disabled={saving} type="submit">
          {saving ? <Loader2 className="animate-spin" /> : <SubmitIcon />}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
