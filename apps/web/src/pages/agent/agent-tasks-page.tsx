import type {
  AgentProject,
  AgentRun,
  Issue,
} from '@patchlane/shared'
import { useMemo } from 'react'
import { Bot, Loader2, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, Field } from '@/components/app/panel-primitives'
import { StateBadge } from '@/components/app/status-badges'
import { AgentTaskConversation } from '@/components/agent/agent-task-conversation'
import {
  ErrorBanner,
  PageHeader,
  PagePane,
  PageScroll,
  PageSplit,
} from '@/components/layout/page-primitives'
import { cn } from '@/lib/utils'
import { useAgentRunController } from './agent-run-controller'

export const AgentTasksPage = () => {
  const {
    agentReplyDraft,
    agentRunning,
    agentTaskDraft,
    endpoint,
    error,
    issues,
    onAgentReplyChange,
    onAgentTaskChange,
    onContinueAgentRun,
    onCreateAgentRun,
    onDeleteAgentRun,
    onRewindAgentRun,
    onSelectAgentRun,
    onSendAgentMessage,
    onStartNewAgentRun,
    onStopAgentRun,
    projects,
    runDeletingId,
    runs,
    selectedRun,
    selectedRunStreaming,
    selectedWorkspace,
  } = useAgentRunController()
  const issueById = useMemo(
    () => new Map(issues.map((issue) => [issue.id, issue])),
    [issues],
  )
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  )

  return (
    <PageSplit variant="wide-list">
      <PagePane
        className="overflow-hidden border-b xl:border-b-0 xl:border-r"
        minHeight="compact"
      >
        <PageHeader
          actions={
          <Button
            disabled={agentRunning}
            onClick={onStartNewAgentRun}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Plus />
            New
          </Button>
          }
          icon={<Bot className="h-4 w-4" />}
          title="Agent tasks"
        />
        <PageScroll className="min-h-[220px] min-w-0">
          {runs.length ? (
            <div className="divide-y">
              {runs.map((run) => (
                <AgentRunCard
                  deleting={runDeletingId === run.id}
                  key={run.id}
                  onDelete={() => onDeleteAgentRun(run)}
                  onSelect={() => onSelectAgentRun(run)}
                  issue={run.issueId ? issueById.get(run.issueId) : undefined}
                  project={
                    run.projectId ? projectById.get(run.projectId) : undefined
                  }
                  run={run}
                  selected={selectedRun?.id === run.id}
                />
              ))}
            </div>
          ) : (
            <div className="p-2">
              <EmptyState>No runs</EmptyState>
            </div>
          )}
        </PageScroll>
      </PagePane>

      <PagePane minHeight="detail">
        <PageHeader
          actions={
            <>
            {endpoint ? (
              <Badge variant="secondary">{endpoint.defaultModel}</Badge>
            ) : null}
            {selectedWorkspace ? (
              <Badge variant="outline">{selectedWorkspace.name}</Badge>
            ) : (
              <StateBadge tone="warning">No workspace</StateBadge>
            )}
            {selectedRun ? <AgentRunKindBadge kind={selectedRun.kind} /> : null}
            {selectedRun ? (
              <AgentRunStatusBadge status={selectedRun.status} />
            ) : null}
            {selectedRun?.context ? (
              <AgentRunContextBadge context={selectedRun.context} />
            ) : null}
            </>
          }
          icon={<Bot className="h-4 w-4" />}
          title="Agent task"
        />
        <div className="min-h-0 flex-1">
          {selectedRun ? (
            <AgentTaskConversation
              draft={agentReplyDraft}
              endpoint={endpoint}
              error={error}
              isStreaming={selectedRunStreaming}
              onChange={onAgentReplyChange}
              onContinue={() => onContinueAgentRun(selectedRun)}
              onRewind={(messageId) => onRewindAgentRun(selectedRun, messageId)}
              onSend={onSendAgentMessage}
              onStop={onStopAgentRun}
              run={selectedRun}
            />
          ) : (
            <form className="space-y-2.5 p-3" onSubmit={onCreateAgentRun}>
              <Field label="New task">
                <Textarea
                  className="min-h-[160px] bg-background"
                  onChange={(event) => onAgentTaskChange(event.target.value)}
                  placeholder="Implement the requested change, run verification, commit to a branch, push, and open a PR."
                  required
                  value={agentTaskDraft}
                />
              </Field>
              <ErrorBanner message={error} variant="card" />
              <Button
                disabled={
                  agentRunning ||
                  !selectedWorkspace ||
                  !endpoint ||
                  selectedWorkspace.status !== 'ready'
                }
                type="submit"
              >
                {agentRunning ? <Loader2 className="animate-spin" /> : <Bot />}
                Start agent run
              </Button>
            </form>
          )}
        </div>
      </PagePane>
    </PageSplit>
  )
}

const AgentRunCard = ({
  deleting,
  issue,
  onDelete,
  onSelect,
  project,
  run,
  selected,
}: {
  deleting: boolean
  issue?: Issue
  onDelete: () => void
  onSelect: () => void
  project?: AgentProject
  run: AgentRun
  selected: boolean
}) => {
  const description = getAgentRunCardDescription(run, issue)
  const scopeLabel = getAgentRunCardScope(run, issue)

  return (
    <div
      className={cn(
        'grid w-full min-w-0 border-l-2 border-l-transparent px-3 py-2.5 transition-colors hover:bg-muted/45',
        selected && 'border-l-primary bg-primary/5',
      )}
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
        <button
          className="min-w-0 overflow-hidden text-left"
          onClick={onSelect}
          type="button"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0">
              <AgentRunKindBadge kind={run.kind} />
            </span>
            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">
              {run.title}
            </h3>
            <span className="shrink-0">
              <AgentRunStatusBadge status={run.status} />
            </span>
          </div>
          {description ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {description}
            </p>
          ) : null}
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="shrink-0">{formatDateTime(run.updatedAt)}</span>
            {project ? (
              <span className="min-w-0 max-w-full truncate">
                {project.name}
              </span>
            ) : null}
            {scopeLabel ? (
              <span className="min-w-0 max-w-full truncate">{scopeLabel}</span>
            ) : null}
            {run.context ? (
              <span className="shrink-0">
                {formatAgentRunContext(run.context)}
              </span>
            ) : null}
          </div>
        </button>
        <Button
          disabled={deleting}
          onClick={onDelete}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  )
}

const AgentRunKindBadge = ({ kind }: { kind: AgentRun['kind'] }) => {
  if (kind === 'requirements') {
    return <Badge variant="outline">requirements</Badge>
  }

  if (kind === 'planning') {
    return <Badge variant="secondary">plan</Badge>
  }

  if (kind === 'verification') {
    return <Badge variant="secondary">verify</Badge>
  }

  if (kind === 'publish') {
    return <Badge variant="secondary">publish</Badge>
  }

  if (kind === 'followup') {
    return <Badge variant="outline">followup</Badge>
  }

  return <Badge variant="outline">coding</Badge>
}

const AgentRunStatusBadge = ({ status }: { status: AgentRun['status'] }) => {
  if (status === 'completed') {
    return <StateBadge tone="success">completed</StateBadge>
  }

  if (status === 'running') {
    return <Badge variant="secondary">running</Badge>
  }

  if (status === 'failed') {
    return <Badge variant="destructive">failed</Badge>
  }

  return <StateBadge tone="warning">{status}</StateBadge>
}

const AgentRunContextBadge = ({
  context,
}: {
  context: NonNullable<AgentRun['context']>
}) => {
  const usage = getAgentRunContextUsage(context)

  return (
    <Badge
      className={cn(
        'gap-1',
        context.strategy === 'compacted' &&
          'border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300',
      )}
      variant={context.strategy === 'compacted' ? 'outline' : 'secondary'}
    >
      Context {usage}%
      {context.strategy === 'compacted'
        ? ` · compacted ${context.summarizedMessages}`
        : ''}
    </Badge>
  )
}

const formatAgentRunContext = (context: NonNullable<AgentRun['context']>) => {
  const usage = getAgentRunContextUsage(context)

  if (context.strategy === 'compacted') {
    return `context ${usage}% · compacted ${context.summarizedMessages}`
  }

  return `context ${usage}%`
}

const getAgentRunPromptPreview = (run: AgentRun) => {
  const prompt = run.messages.find(
    (message) => message.role === 'user',
  )?.content

  if (!prompt) {
    return ''
  }

  return (
    prompt
      .split('\n')
      .find((line) => line.trim())
      ?.trim() ?? ''
  )
}

const getAgentRunCardDescription = (run: AgentRun, issue?: Issue) => {
  const prompt = getAgentRunPromptPreview(run)

  if (!prompt || isGeneratedAgentRunPrompt(prompt)) {
    return ''
  }

  const description = stripAgentRunPromptLabel(prompt)

  if (isRedundantAgentRunText(description, [run.title, issue?.title])) {
    return ''
  }

  return description
}

const getAgentRunCardScope = (run: AgentRun, issue?: Issue) => {
  if (!issue) {
    return ''
  }

  if (isRedundantAgentRunText(issue.title, [run.title])) {
    return ''
  }

  return `Issue: ${issue.title}`
}

const isGeneratedAgentRunPrompt = (value: string) => {
  const normalized = normalizeAgentRunText(value)

  return [
    'analyze requirements for this issue',
    'create a concrete work plan for the coding agent',
    'implement the requested change run verification commit to a branch push and open a pr',
  ].some((prefix) => normalized.startsWith(prefix))
}

const stripAgentRunPromptLabel = (value: string) => {
  return value
    .replace(/^(issue|task|prompt)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const isRedundantAgentRunText = (
  value: string,
  candidates: Array<string | undefined>,
) => {
  const normalized = normalizeAgentRunText(value)

  if (!normalized) {
    return true
  }

  return candidates.some((candidate) => {
    const candidateText = normalizeAgentRunText(candidate ?? '')

    if (!candidateText) {
      return false
    }

    return (
      candidateText.includes(normalized) || normalized.includes(candidateText)
    )
  })
}

const normalizeAgentRunText = (value: string) => {
  return value
    .toLowerCase()
    .replace(/^(work plan|requirements|issue|task|prompt)\s*:\s*/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const getAgentRunContextUsage = (context: NonNullable<AgentRun['context']>) => {
  return Math.min(
    100,
    Math.round((context.estimatedTokens / context.tokenBudget) * 100),
  )
}

const formatDateTime = (value?: string) => {
  if (!value) {
    return 'Never'
  }

  return new Date(value).toLocaleString()
}
