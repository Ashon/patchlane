import { type FormEvent, useState } from 'react'
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
import { Page, PageActionBar } from '@/components/layout/page-primitives'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, Field, MetricBadge } from './common'
import { IssueDetail } from './issue-detail'
import { IssueRow } from './issue-row'
import type { IssueDraft } from './types'
import { countStatus } from './utils'

export const ProjectIssuesView = ({
  createIssue,
  endpoints,
  issueDraft,
  issues,
  onAnalyze,
  onIssueDraftChange,
  onOpenRun,
  onSelectIssue,
  onStart,
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
  onAnalyze: (issue: Issue) => Promise<void>
  onIssueDraftChange: (updater: (current: IssueDraft) => IssueDraft) => void
  onOpenRun: (runId: string) => void
  onSelectIssue: (id: string | null) => void
  onStart: (issue: Issue) => Promise<void>
  project: AgentProject
  runById: Map<string, AgentRun>
  runningIssueId: string | null
  savingIssue: boolean
  selectedEndpoint: LlmEndpoint | null
  selectedIssue: Issue | null
  workspaces: SandboxWorkspace[]
}) => {
  const [issueDialogOpen, setIssueDialogOpen] = useState(false)
  const selectedIssueEndpointId =
    issueDraft.endpointId ||
    project.defaultEndpointId ||
    selectedEndpoint?.id ||
    undefined

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
        <MetricBadge label="Ready" value={countStatus(issues, 'ready')} />
        <MetricBadge label="Planning" value={countStatus(issues, 'planning')} />
        <MetricBadge label="Running" value={countStatus(issues, 'running')} />
        <MetricBadge label="Review" value={countStatus(issues, 'review')} />
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
                      ['low', 'medium', 'high', 'urgent'] satisfies IssuePriority[]
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

      <div className="grid min-h-0 flex-1 overflow-hidden bg-background xl:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
        <ScrollArea className="min-h-0 border-b bg-background xl:border-b-0 xl:border-r">
          {issues.length ? (
            <div className="divide-y">
              {issues.map((issue) => (
                <IssueRow
                  agentRun={
                    issue.agentRunId
                      ? runById.get(issue.agentRunId)
                      : undefined
                  }
                  issue={issue}
                  key={issue.id}
                  loading={runningIssueId === issue.id}
                  onAnalyze={() => void onAnalyze(issue)}
                  onOpenRun={onOpenRun}
                  onSelect={() => onSelectIssue(issue.id)}
                  onStart={() => void onStart(issue)}
                  planningRun={
                    issue.planningRunId
                      ? runById.get(issue.planningRunId)
                      : undefined
                  }
                  projectWorkspaceId={project.workspaceId}
                  requirementRun={
                    issue.requirementRunId
                      ? runById.get(issue.requirementRunId)
                      : undefined
                  }
                  selected={selectedIssue?.id === issue.id}
                />
              ))}
            </div>
          ) : (
            <div className="p-3">
              <EmptyState>No issues in this project</EmptyState>
            </div>
          )}
        </ScrollArea>

        <section className="min-h-[420px] min-w-0 bg-background xl:min-h-0">
          {selectedIssue ? (
            <IssueDetail
              issue={selectedIssue}
              onOpenRun={onOpenRun}
              planningRun={
                selectedIssue.planningRunId
                  ? runById.get(selectedIssue.planningRunId)
                  : undefined
              }
              requirementRun={
                selectedIssue.requirementRunId
                  ? runById.get(selectedIssue.requirementRunId)
                  : undefined
              }
              run={
                selectedIssue.agentRunId
                  ? runById.get(selectedIssue.agentRunId)
                  : undefined
              }
              workspace={workspaces.find(
                (workspace) =>
                  workspace.id ===
                  (selectedIssue.workspaceId ?? project.workspaceId),
              )}
            />
          ) : (
            <div className="flex h-full min-h-[320px] items-center justify-center p-3">
              <EmptyState>
                Select an issue to inspect requirements, plan, and run state
              </EmptyState>
            </div>
          )}
        </section>
      </div>
    </Page>
  )
}
