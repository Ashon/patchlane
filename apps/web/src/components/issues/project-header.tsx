import type { AgentProject, SandboxWorkspace } from '@patchlane/shared'
import { Badge } from '@patchlane/ui/badge'
import { ProjectRepositoryBadge, StateBadge } from './common'

export const ProjectHeader = ({
  issueCount,
  project,
  workspace,
}: {
  issueCount: number
  project: AgentProject | null
  workspace?: SandboxWorkspace
}) => (
  <header className="flex flex-col gap-2 border-b px-3 py-2 md:flex-row md:items-center md:justify-between">
    <div className="min-w-0">
      <h1 className="truncate text-sm font-semibold">
        {project?.name ?? 'New project'}
      </h1>
      <p className="truncate text-xs text-muted-foreground">
        {project?.repositoryUrl ??
          'Connect a repository or sandbox workspace, then register issues for the coding agent.'}
      </p>
    </div>
    <div className="flex flex-wrap gap-2">
      {project ? (
        <ProjectRepositoryBadge project={project} />
      ) : (
        <StateBadge tone="warning">Draft</StateBadge>
      )}
      <Badge variant="secondary">{issueCount} issues</Badge>
      {workspace ? <Badge variant="outline">{workspace.name}</Badge> : null}
    </div>
  </header>
)
