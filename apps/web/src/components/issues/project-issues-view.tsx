import { type FormEvent, useEffect, useMemo, useState } from 'react'
import type {
  AgentProject,
  AgentRun,
  Issue,
  IssuePriority,
  LlmEndpoint,
  SandboxWorkspace,
} from '@patchlane/shared'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Page,
  PageActionBar,
  PageList,
} from '@/components/layout/page-primitives'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useResizableDefaultLayout,
} from '@/components/ui/resizable'
import { EmptyState, Field, MetricBadge } from './common'
import { IssueDetail } from './issue-detail'
import { IssueRow } from './issue-row'
import type { IssueDraft } from './types'
import { countStatus } from './utils'

const projectIssuePanelIds = ['project-issue-list', 'project-issue-detail']
const projectIssueResizableMediaQuery = '(min-width: 640px)'

export const ProjectIssuesView = ({
  createIssue,
  endpoints,
  issueDraft,
  issues,
  onIssueDraftChange,
  onOpenRun,
  onPlan,
  onSelectIssue,
  onStart,
  planningIssueId,
  project,
  runById,
  runningIssueId,
  savingIssue,
  selectedEndpoint,
  selectedIssue,
  workspaces,
}: {
  createIssue: (event: FormEvent<HTMLFormElement>) => Promise<boolean>
  endpoints: LlmEndpoint[]
  issueDraft: IssueDraft
  issues: Issue[]
  onIssueDraftChange: (updater: (current: IssueDraft) => IssueDraft) => void
  onOpenRun: (runId: string) => void
  onPlan: (issue: Issue) => Promise<void>
  onSelectIssue: (id: string | null) => void
  onStart: (issue: Issue) => Promise<void>
  planningIssueId: string | null
  project: AgentProject
  runById: Map<string, AgentRun>
  runningIssueId: string | null
  savingIssue: boolean
  selectedEndpoint: LlmEndpoint | null
  selectedIssue: Issue | null
  workspaces: SandboxWorkspace[]
}) => {
  const [issueDialogOpen, setIssueDialogOpen] = useState(false)
  const projectIssueLayout = useResizableDefaultLayout({
    id: 'patchlane-project-issues-layout',
    panelIds: projectIssuePanelIds,
  })
  const [resizableLayoutEnabled, setResizableLayoutEnabled] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia(projectIssueResizableMediaQuery).matches,
  )
  const selectedIssueEndpointId =
    issueDraft.endpointId ||
    project.defaultEndpointId ||
    selectedEndpoint?.id ||
    undefined

  useEffect(() => {
    const mediaQuery = window.matchMedia(projectIssueResizableMediaQuery)
    const syncResizableLayout = () =>
      setResizableLayoutEnabled(mediaQuery.matches)

    syncResizableLayout()
    mediaQuery.addEventListener('change', syncResizableLayout)

    return () => mediaQuery.removeEventListener('change', syncResizableLayout)
  }, [])

  const selectedWorkspace = useMemo(
    () =>
      selectedIssue
        ? workspaces.find(
            (workspace) =>
              workspace.id ===
              (selectedIssue.workspaceId ?? project.workspaceId),
          )
        : undefined,
    [project.workspaceId, selectedIssue, workspaces],
  )

  const handleCreateIssue = async (event: FormEvent<HTMLFormElement>) => {
    const created = await createIssue(event)

    if (created) {
      setIssueDialogOpen(false)
    }
  }

  return (
    <Page>
      <PageActionBar
        actions={
          <Button
            onClick={() => setIssueDialogOpen(true)}
            size="sm"
            type="button"
          >
            <Plus className="h-4 w-4" />
            New issue
          </Button>
        }
      >
        <MetricBadge label="Total" value={issues.length} />
        <MetricBadge label="Backlog" value={countStatus(issues, 'backlog')} />
        <MetricBadge label="Running" value={countStatus(issues, 'running')} />
        <MetricBadge
          label="Awaiting"
          value={countStatus(issues, 'awaiting_user')}
        />
        <MetricBadge label="Review" value={countStatus(issues, 'review')} />
        <MetricBadge label="Done" value={countStatus(issues, 'completed')} />
      </PageActionBar>

      <Dialog onOpenChange={setIssueDialogOpen} open={issueDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New issue</DialogTitle>
            <DialogDescription>
              Define the work item and choose the endpoint used for scoped agent
              tasks.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handleCreateIssue}>
            <Field label="Title">
              <Input
                onChange={(event) =>
                  onIssueDraftChange((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="New issue title"
                required
                value={issueDraft.title}
              />
            </Field>
            <Field label="Description">
              <Textarea
                className="min-h-24 resize-none"
                onChange={(event) =>
                  onIssueDraftChange((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Expected change, constraints, verification"
                required
                value={issueDraft.description}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
              <Field label="Priority">
                <Select
                  onValueChange={(value) =>
                    onIssueDraftChange((current) => ({
                      ...current,
                      priority: value as IssuePriority,
                    }))
                  }
                  value={issueDraft.priority}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      [
                        'low',
                        'medium',
                        'high',
                        'urgent',
                      ] satisfies IssuePriority[]
                    ).map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {priority}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Endpoint">
                <Select
                  onValueChange={(value) =>
                    onIssueDraftChange((current) => ({
                      ...current,
                      endpointId: value,
                    }))
                  }
                  value={selectedIssueEndpointId}
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
              </Field>
            </div>
            <DialogFooter className="border-t pt-4">
              <Button disabled={savingIssue} type="submit">
                {savingIssue ? <Loader2 className="animate-spin" /> : <Plus />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {resizableLayoutEnabled ? (
        <ResizablePanelGroup
          className="min-w-0 flex-1"
          defaultLayout={projectIssueLayout.defaultLayout}
          direction="horizontal"
          id="patchlane-project-issues-layout"
          onLayoutChanged={projectIssueLayout.onLayoutChanged}
        >
          <ResizablePanel
            className="min-w-0 overflow-hidden"
            defaultSize="32%"
            id="project-issue-list"
            maxSize="520px"
            minSize="240px"
          >
            <IssueListPane
              issues={issues}
              onSelectIssue={onSelectIssue}
              selectedIssue={selectedIssue}
              variant="resizable"
            />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel
            className="min-w-0 overflow-hidden"
            defaultSize="68%"
            id="project-issue-detail"
            minSize="320px"
          >
            <IssueDetailPane
              onOpenRun={onOpenRun}
              onPlan={onPlan}
              onStart={onStart}
              planningIssueId={planningIssueId}
              runById={runById}
              runningIssueId={runningIssueId}
              selectedIssue={selectedIssue}
              workspace={selectedWorkspace}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="grid min-h-0 flex-1 overflow-hidden bg-background sm:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
          <IssueListPane
            issues={issues}
            onSelectIssue={onSelectIssue}
            selectedIssue={selectedIssue}
            variant="stacked"
          />
          <IssueDetailPane
            onOpenRun={onOpenRun}
            onPlan={onPlan}
            onStart={onStart}
            planningIssueId={planningIssueId}
            runById={runById}
            runningIssueId={runningIssueId}
            selectedIssue={selectedIssue}
            workspace={selectedWorkspace}
          />
        </div>
      )}
    </Page>
  )
}

const IssueListPane = ({
  issues,
  onSelectIssue,
  selectedIssue,
  variant,
}: {
  issues: Issue[]
  onSelectIssue: (id: string | null) => void
  selectedIssue: Issue | null
  variant: 'resizable' | 'stacked'
}) => {
  return (
    <ScrollArea
      className={
        variant === 'resizable'
          ? 'h-full min-h-0 bg-background'
          : 'min-h-0 border-b bg-background sm:border-b-0 sm:border-r'
      }
    >
      {issues.length ? (
        <PageList>
          {issues.map((issue) => (
            <IssueRow
              issue={issue}
              key={issue.id}
              onSelect={() => onSelectIssue(issue.id)}
              selected={selectedIssue?.id === issue.id}
            />
          ))}
        </PageList>
      ) : (
        <div className="p-3">
          <EmptyState>No issues in this project</EmptyState>
        </div>
      )}
    </ScrollArea>
  )
}

const IssueDetailPane = ({
  onOpenRun,
  onPlan,
  onStart,
  planningIssueId,
  runById,
  runningIssueId,
  selectedIssue,
  workspace,
}: {
  onOpenRun: (runId: string) => void
  onPlan: (issue: Issue) => Promise<void>
  onStart: (issue: Issue) => Promise<void>
  planningIssueId: string | null
  runById: Map<string, AgentRun>
  runningIssueId: string | null
  selectedIssue: Issue | null
  workspace?: SandboxWorkspace
}) => {
  return (
    <section className="h-full min-h-[420px] min-w-0 bg-background sm:min-h-0">
      {selectedIssue ? (
        <IssueDetail
          issue={selectedIssue}
          onOpenRun={onOpenRun}
          onPlan={() => void onPlan(selectedIssue)}
          onStart={() => void onStart(selectedIssue)}
          planning={planningIssueId === selectedIssue.id}
          run={
            selectedIssue.agentRunId
              ? runById.get(selectedIssue.agentRunId)
              : undefined
          }
          running={runningIssueId === selectedIssue.id}
          workspace={workspace}
        />
      ) : (
        <div className="flex h-full min-h-[320px] items-center justify-center p-3">
          <EmptyState>
            Select an issue to inspect context and agent run state
          </EmptyState>
        </div>
      )}
    </section>
  )
}
