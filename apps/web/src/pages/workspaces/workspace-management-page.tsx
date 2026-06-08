import type {
  CreateSandboxWorkspaceInput,
  SandboxWorkspace,
} from '@patchlane/shared'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Folder, Loader2, Plus, Trash2 } from 'lucide-react'
import { parseAsString, useQueryState } from 'nuqs'
import {
  emptySandboxWorkspaceDraft,
  type SandboxWorkspaceDraft,
} from '@/components/app/app-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  EmptyState,
  Field,
  ToolStatusRow,
} from '@/components/app/panel-primitives'
import { StateBadge } from '@/components/app/status-badges'
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

export const WorkspaceManagementPage = () => {
  const queryClient = useQueryClient()
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useQueryState(
    'workspace',
    parseAsString.withOptions({ history: 'replace', shallow: true }),
  )
  const [workspaceDraft, setWorkspaceDraft] = useState<SandboxWorkspaceDraft>(
    emptySandboxWorkspaceDraft,
  )
  const [workspaceCreating, setWorkspaceCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sandboxSettingsQuery = useQuery({
    queryKey: queryKeys.sandboxSettings,
    queryFn: api.getSandboxSettings,
  })
  const sandboxWorkspacesQuery = useQuery({
    queryKey: queryKeys.sandboxWorkspaces,
    queryFn: api.listSandboxWorkspaces,
  })

  const settings = sandboxSettingsQuery.data?.settings ?? null
  const workspaces = useMemo(
    () => sandboxWorkspacesQuery.data?.workspaces ?? [],
    [sandboxWorkspacesQuery.data?.workspaces],
  )
  const selectedWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ??
      null,
    [selectedWorkspaceId, workspaces],
  )
  const visibleError =
    error ??
    getQueryErrorMessage(sandboxSettingsQuery.error, sandboxWorkspacesQuery.error)

  const selectWorkspace = (workspace: SandboxWorkspace) => {
    void setSelectedWorkspaceId(workspace.id)
  }

  const createWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setWorkspaceCreating(true)
    setError(null)

    try {
      const response = await api.createSandboxWorkspace(
        normalizeWorkspaceDraft(workspaceDraft),
      )
      const listResponse = await api.listSandboxWorkspaces()
      queryClient.setQueryData(queryKeys.sandboxWorkspaces, listResponse)
      selectWorkspace(response.workspace)
      setWorkspaceDraft(emptySandboxWorkspaceDraft)
    } catch (createError) {
      setError(getErrorMessage(createError))

      try {
        const listResponse = await api.listSandboxWorkspaces()
        queryClient.setQueryData(queryKeys.sandboxWorkspaces, listResponse)
      } catch {
        // Keep the original create error visible.
      }
    } finally {
      setWorkspaceCreating(false)
    }
  }

  const deleteWorkspace = async (workspace: SandboxWorkspace) => {
    setWorkspaceCreating(true)
    setError(null)

    try {
      await api.deleteSandboxWorkspace(workspace.id)
      const response = await api.listSandboxWorkspaces()
      queryClient.setQueryData(queryKeys.sandboxWorkspaces, response)
    } catch (deleteError) {
      setError(getErrorMessage(deleteError))
    } finally {
      setWorkspaceCreating(false)
    }
  }

  useEffect(() => {
    if (!workspaces.length) {
      if (selectedWorkspaceId) {
        void setSelectedWorkspaceId(null)
      }
      return
    }

    if (
      !selectedWorkspaceId ||
      !workspaces.some((workspace) => workspace.id === selectedWorkspaceId)
    ) {
      void setSelectedWorkspaceId(workspaces[0]!.id)
    }
  }, [selectedWorkspaceId, setSelectedWorkspaceId, workspaces])

  return (
    <PageSplit>
      <PagePane minHeight="none">
        <PageHeader
          actions={
            <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
              {workspaces.length} total
            </span>
          }
          icon={<Folder className="h-4 w-4" />}
          title="Workspaces"
        />
        <PageScroll>
          <ErrorBanner message={visibleError} />

          {sandboxWorkspacesQuery.isLoading ? (
            <PageListSkeleton />
          ) : workspaces.length ? (
            <PageList>
              {workspaces.map((workspace) => (
                <SandboxWorkspaceRow
                  key={workspace.id}
                  onDelete={() => void deleteWorkspace(workspace)}
                  onSelect={() => selectWorkspace(workspace)}
                  selected={selectedWorkspace?.id === workspace.id}
                  workspace={workspace}
                />
              ))}
            </PageList>
          ) : (
            <div className="p-2">
              <EmptyState>No workspaces</EmptyState>
            </div>
          )}
        </PageScroll>
      </PagePane>

      <PageAside viewportClassName="">
        <PageSection title="New workspace">
          <form className="space-y-2.5" onSubmit={createWorkspace}>
            <Field label="Name">
              <Input
                onChange={(event) =>
                  setWorkspaceDraft({
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
                  setWorkspaceDraft({
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
                  setWorkspaceDraft({
                    ...workspaceDraft,
                    ref: event.target.value,
                  })
                }
                placeholder="main"
                value={workspaceDraft.ref}
              />
            </Field>
            <div className="flex justify-end border-t pt-3">
              <Button disabled={workspaceCreating} size="sm" type="submit">
                {workspaceCreating ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Plus />
                )}
                Create
              </Button>
            </div>
          </form>
        </PageSection>

        <PageSection title="Selected workspace">
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
        </PageSection>

        <PageSection title="Sandbox policy">
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
        </PageSection>
      </PageAside>
    </PageSplit>
  )
}

const SandboxWorkspaceRow = ({
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
    <PageListItem selected={selected}>
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
    </PageListItem>
  )
}

const normalizeWorkspaceDraft = (
  draft: SandboxWorkspaceDraft,
): CreateSandboxWorkspaceInput => ({
  name: draft.name.trim() || undefined,
  repositoryUrl: draft.repositoryUrl.trim() || undefined,
  ref: draft.ref.trim() || undefined,
})
