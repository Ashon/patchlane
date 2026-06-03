import type { SandboxSettings, SandboxWorkspace } from '@agent-fleet/shared'
import type { FormEvent } from 'react'
import { Folder, Loader2, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  EmptyState,
  Field,
  ToolStatusRow,
} from '@/components/app/panel-primitives'
import { StateBadge } from '@/components/app/status-badges'
import type { SandboxWorkspaceDraft } from '@/components/app/app-types'
import { cn } from '@/lib/utils'

export const WorkspaceManagementPage = ({
  error,
  onCreateWorkspace,
  onDeleteWorkspace,
  onSelectWorkspace,
  onWorkspaceDraftChange,
  selectedWorkspace,
  settings,
  workspaceCreating,
  workspaceDraft,
  workspaces,
}: {
  error: string | null
  onCreateWorkspace: (event: FormEvent<HTMLFormElement>) => void
  onDeleteWorkspace: (workspace: SandboxWorkspace) => void
  onSelectWorkspace: (workspace: SandboxWorkspace) => void
  onWorkspaceDraftChange: (draft: SandboxWorkspaceDraft) => void
  selectedWorkspace: SandboxWorkspace | null
  settings: SandboxSettings | null
  workspaceCreating: boolean
  workspaceDraft: SandboxWorkspaceDraft
  workspaces: SandboxWorkspace[]
}) => {
  return (
    <section className="grid h-full min-h-0 overflow-y-auto bg-background lg:grid-cols-[minmax(0,1fr)_360px] lg:overflow-hidden">
      <div className="flex min-h-[320px] flex-col lg:min-h-0">
        <div className="flex min-h-10 items-center justify-between border-b px-3 py-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Folder className="h-4 w-4" />
            Workspaces
          </h2>
          <Badge variant="secondary">{workspaces.length} total</Badge>
        </div>
        <ScrollArea className="min-h-0 flex-1" viewportClassName="p-2">
          <div className="grid gap-1.5">
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
        </ScrollArea>
      </div>

      <ScrollArea className="min-h-0 border-t bg-muted/20 lg:border-l lg:border-t-0">
        <section className="border-b p-3">
          <h2 className="mb-2 text-sm font-semibold">New workspace</h2>
          <form className="space-y-2.5" onSubmit={onCreateWorkspace}>
            <Field label="Name">
              <Input
                onChange={(event) =>
                  onWorkspaceDraftChange({
                    ...workspaceDraft,
                    name: event.target.value,
                  })
                }
                placeholder="agent-run"
                value={workspaceDraft.name}
              />
            </Field>
            <Field label="Repository URL">
              <Input
                onChange={(event) =>
                  onWorkspaceDraftChange({
                    ...workspaceDraft,
                    repositoryUrl: event.target.value,
                  })
                }
                placeholder="https://github.com/org/repo.git"
                value={workspaceDraft.repositoryUrl}
              />
            </Field>
            <Field label="Ref">
              <Input
                onChange={(event) =>
                  onWorkspaceDraftChange({
                    ...workspaceDraft,
                    ref: event.target.value,
                  })
                }
                placeholder="main"
                value={workspaceDraft.ref}
              />
            </Field>
            <Button
              className="w-full"
              disabled={workspaceCreating}
              type="submit"
            >
              {workspaceCreating ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Plus />
              )}
              Create
            </Button>
          </form>
        </section>

        <section className="border-b p-3">
          <h2 className="mb-2 text-sm font-semibold">Selected workspace</h2>
          <div className="space-y-0">
            {selectedWorkspace ? (
              <>
                <ToolStatusRow label="Name" value={selectedWorkspace.name} />
                <ToolStatusRow
                  label="Status"
                  value={selectedWorkspace.status}
                />
                <ToolStatusRow
                  label="Source"
                  value={
                    selectedWorkspace.repositoryUrl || selectedWorkspace.path
                  }
                />
                <ToolStatusRow
                  label="Ref"
                  value={selectedWorkspace.ref || 'Default'}
                />
              </>
            ) : (
              <EmptyState>Select or create a workspace</EmptyState>
            )}
          </div>
        </section>

        <section className="p-3">
          <h2 className="mb-2 text-sm font-semibold">Sandbox policy</h2>
          <div className="grid gap-0">
            <ToolStatusRow
              label="Root"
              value={settings?.rootDir || 'Loading'}
            />
            <ToolStatusRow
              label="Timeout"
              value={settings ? `${settings.defaultTimeoutMs} ms` : 'Loading'}
            />
            <ToolStatusRow
              label="Tools"
              value={settings?.allowedCommands.join(', ') || 'Loading'}
            />
            <ToolStatusRow
              label="Output"
              value={settings ? `${settings.maxOutputBytes} bytes` : 'Loading'}
            />
          </div>
        </section>
      </ScrollArea>
    </section>
  )
}

const SandboxWorkspaceCard = ({
  onDelete,
  onSelect,
  selected,
  workspace,
}: {
  onDelete: () => void
  onSelect: () => void
  selected: boolean
  workspace: SandboxWorkspace
}) => {
  return (
    <div
      className={cn(
        'rounded-md border bg-background p-2 transition-colors',
        selected && 'border-primary ring-1 ring-primary',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          className="min-w-0 flex-1 text-left"
          onClick={onSelect}
          type="button"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Folder className="h-4 w-4 text-primary" />
            <h3 className="truncate text-sm font-semibold">{workspace.name}</h3>
            <StateBadge
              tone={workspace.status === 'ready' ? 'success' : 'warning'}
            >
              {workspace.status}
            </StateBadge>
          </div>
          <div className="mt-1 grid gap-1 text-xs text-muted-foreground">
            <span className="truncate">
              {workspace.repositoryUrl || workspace.path}
            </span>
            {workspace.ref ? (
              <span className="truncate">{workspace.ref}</span>
            ) : null}
          </div>
        </button>
        <Button onClick={onDelete} size="icon-sm" type="button" variant="ghost">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {workspace.error ? (
        <p className="mt-2 text-sm text-destructive">{workspace.error}</p>
      ) : null}
    </div>
  )
}

