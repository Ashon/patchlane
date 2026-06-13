import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { ChartColumn, Clock, Cpu, Sigma, Workflow, Wrench } from 'lucide-react'
import { Badge } from '@patchlane/ui/badge'
import { StateBadge } from '@/components/app/status-badges'
import {
  ErrorBanner,
  Page,
  PageHeader,
  PageScroll,
} from '@/components/layout/page-primitives'
import {
  formatCompactNumber,
  formatDurationMs,
} from '@/components/chat/chat-message-format'
import type {
  AgentStatisticsMetrics,
  AgentStatisticsRow,
} from '@/lib/agent-statistics'
import { buildAgentStatistics } from '@/lib/agent-statistics'
import { cn } from '@/lib/utils'
import { useAgentRunController } from '@/pages/agent/agent-run-controller'

type StatsColumn = {
  align?: 'left' | 'right'
  className?: string
  header: string
  id: string
  render: (row: AgentStatisticsRow) => ReactNode
}

type StatsTableGroup = {
  emptyLabel: string
  id: string
  rows: AgentStatisticsRow[]
  title: string
}

export const StatisticsPage = () => {
  const { endpoints, error, issues, issuesError, loading, projects, runs } =
    useAgentRunController()
  const stats = useMemo(
    () => buildAgentStatistics({ endpoints, issues, projects, runs }),
    [endpoints, issues, projects, runs],
  )
  const visibleError = error ?? issuesError

  return (
    <Page>
      <PageHeader
        actions={
          <div className="flex items-center gap-1">
            <Badge variant="outline">All time</Badge>
            <Badge variant="secondary">
              {loading
                ? 'Updating'
                : `${formatCompactNumber(runs.length)} runs`}
            </Badge>
          </div>
        }
        description="Agent responses, tools, reasoning, token usage, and work segments"
        icon={<ChartColumn className="h-4 w-4" />}
        title="Statistics"
      />

      <ErrorBanner message={visibleError} />

      <PageScroll viewportClassName="p-0">
        <div className="min-w-0">
          <OverviewGrid metrics={stats.totals} />

          <StatsNote />

          <StatsSection
            description="Stored workflow sources, project scopes, issue scopes, and run kinds in one table."
            icon={<Workflow />}
            title="Work Segments"
          >
            <StatsTable
              columns={segmentColumns}
              groups={[
                {
                  emptyLabel: 'No stored workflow sources',
                  id: 'sources',
                  rows: stats.sourceRows,
                  title: 'Sources',
                },
                {
                  emptyLabel: 'No project-scoped runs',
                  id: 'projects',
                  rows: stats.projectRows,
                  title: 'Projects',
                },
                {
                  emptyLabel: 'No issue-scoped runs',
                  id: 'issues',
                  rows: stats.issueRows,
                  title: 'Issues',
                },
                {
                  emptyLabel: 'No task kinds',
                  id: 'kinds',
                  rows: stats.kindRows,
                  title: 'Task Kinds',
                },
              ]}
            />
          </StatsSection>

          <StatsSection
            description="Provider usage is deduplicated per run attempt and iteration."
            icon={<Cpu />}
            title="Model Usage"
          >
            <StatsTable columns={modelColumns} rows={stats.modelRows} />
          </StatsSection>

          <StatsSection
            description="Tool input and output values are estimated from stored metadata."
            icon={<Wrench />}
            title="Tool Usage"
          >
            <StatsTable columns={toolColumns} rows={stats.toolRows} />
          </StatsSection>

          <StatsSection
            description="Latest runs with their current status and recorded usage."
            icon={<Clock />}
            title="Recent Runs"
          >
            <StatsTable
              columns={recentRunColumns}
              fitToWidth
              rows={stats.recentRunRows}
            />
          </StatsSection>
        </div>
      </PageScroll>
    </Page>
  )
}

const OverviewGrid = ({ metrics }: { metrics: AgentStatisticsMetrics }) => {
  const toolIoTokens = metrics.toolInputTokens + metrics.toolOutputTokens

  return (
    <section className="grid border-b bg-background @2xl:grid-cols-2 @5xl:grid-cols-6">
      <MetricTile
        detail={`${metrics.completedRuns} completed / ${metrics.awaitingRuns} awaiting / ${metrics.failedRuns} failed`}
        label="Runs"
        value={formatCompactNumber(metrics.runs)}
      />
      <MetricTile
        detail={`${formatCompactNumber(metrics.userMessages)} user messages`}
        label="Responses"
        value={formatCompactNumber(metrics.assistantResponses)}
      />
      <MetricTile
        detail={`${formatDuration(metrics.durationMs)} recorded duration`}
        label="Tool Uses"
        value={formatCompactNumber(metrics.toolUses)}
      />
      <MetricTile
        detail={`${formatTokenCount(metrics.estimatedReasoningTokens)} stored estimate`}
        label="Reasoning"
        value={formatCompactNumber(metrics.reasoningBlocks)}
      />
      <MetricTile
        detail={`${formatTokenCount(metrics.providerInputTokens)} in / ${formatTokenCount(metrics.providerOutputTokens)} out`}
        label="Provider Tokens"
        value={formatTokenCount(metrics.providerTotalTokens)}
      />
      <MetricTile
        detail={`${formatTokenCount(metrics.toolInputTokens)} in / ${formatTokenCount(metrics.toolOutputTokens)} out`}
        label="Tool I/O Est."
        value={formatTokenCount(toolIoTokens)}
      />
    </section>
  )
}

const MetricTile = ({
  detail,
  label,
  value,
}: {
  detail: string
  label: string
  value: string
}) => {
  return (
    <div className="min-w-0 border-b border-r px-3 py-2 @2xl:[&:nth-child(2n)]:border-r-0 @5xl:border-b-0 @5xl:[&:nth-child(2n)]:border-r @5xl:[&:nth-child(6n)]:border-r-0">
      <div className="truncate text-[11px] font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate text-lg font-semibold tabular-nums">
        {value}
      </div>
      <div className="mt-1 truncate text-xs text-muted-foreground">
        {detail}
      </div>
    </div>
  )
}

const StatsNote = () => {
  return (
    <div className="flex items-start gap-2 border-b bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      <Sigma className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
      <p className="min-w-0">
        Provider tokens are counted once per run attempt and iteration, even
        when the same metadata is attached to assistant and tool messages. Tool
        input/output, content, and reasoning token values are stored estimates.
      </p>
    </div>
  )
}

const StatsSection = ({
  children,
  description,
  icon,
  title,
}: {
  children: ReactNode
  description: string
  icon: ReactNode
  title: string
}) => {
  return (
    <section className="min-w-0 overflow-hidden border-b bg-background">
      <div className="border-b px-3 py-2">
        <div className="flex min-w-0 items-start gap-2">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-muted/30 text-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{title}</h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
      </div>
      {children}
    </section>
  )
}

const StatsTable = ({
  columns,
  fitToWidth = false,
  groups,
  rows,
}: {
  columns: StatsColumn[]
  fitToWidth?: boolean
  groups?: StatsTableGroup[]
  rows?: AgentStatisticsRow[]
}) => {
  const visibleRows = rows ?? []

  if (!groups?.length && !visibleRows.length) {
    return (
      <div className="px-3 py-6 text-center text-sm text-muted-foreground">
        No data
      </div>
    )
  }

  return (
    <div className={cn(fitToWidth ? 'overflow-hidden' : 'overflow-x-auto')}>
      <table className="w-full table-fixed text-left text-xs">
        <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
          <tr className="border-b">
            {columns.map((column) => (
              <th
                className={cn(
                  'h-8 whitespace-nowrap px-3 font-medium',
                  fitToWidth && 'overflow-hidden text-ellipsis',
                  column.align === 'right' && 'text-right',
                  column.className,
                )}
                key={column.id}
                scope="col"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups?.length
            ? groups.map((group) => (
                <StatsTableGroupRows
                  columns={columns}
                  group={group}
                  key={group.id}
                />
              ))
            : visibleRows.map((row) => (
                <StatsTableRow columns={columns} key={row.id} row={row} />
              ))}
        </tbody>
      </table>
    </div>
  )
}

const StatsTableGroupRows = ({
  columns,
  group,
}: {
  columns: StatsColumn[]
  group: StatsTableGroup
}) => {
  return (
    <>
      <tr className="border-b bg-muted/15">
        <td
          className="h-7 px-3 text-[11px] font-semibold uppercase text-muted-foreground"
          colSpan={columns.length}
        >
          {group.title}
        </td>
      </tr>
      {group.rows.length ? (
        group.rows.map((row) => (
          <StatsTableRow
            columns={columns}
            key={`${group.id}:${row.id}`}
            row={row}
          />
        ))
      ) : (
        <tr className="border-b">
          <td
            className="h-10 px-3 py-2 text-muted-foreground"
            colSpan={columns.length}
          >
            {group.emptyLabel}
          </td>
        </tr>
      )}
    </>
  )
}

const StatsTableRow = ({
  columns,
  row,
}: {
  columns: StatsColumn[]
  row: AgentStatisticsRow
}) => {
  return (
    <tr className="border-b last:border-b-0">
      {columns.map((column) => (
        <td
          className={cn(
            'h-10 px-3 py-2 align-middle',
            'overflow-hidden',
            column.align === 'right' && 'text-right tabular-nums',
            column.className,
          )}
          key={column.id}
        >
          {column.render(row)}
        </td>
      ))}
    </tr>
  )
}

const SegmentCell = ({
  row,
  showMetadata = true,
}: {
  row: AgentStatisticsRow
  showMetadata?: boolean
}) => {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">{row.label}</span>
        {row.status === 'not_collected' ? (
          <StateBadge tone="warning">not collected</StateBadge>
        ) : row.status === 'available' ? (
          <StateBadge tone="success">collected</StateBadge>
        ) : null}
      </div>
      <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
        {row.description ? (
          <span className="min-w-0 max-w-full truncate">{row.description}</span>
        ) : null}
        {showMetadata && row.metadata ? (
          <Badge className="shrink-0" variant="outline">
            {row.metadata}
          </Badge>
        ) : null}
      </div>
    </div>
  )
}

const RecentRunCell = ({ row }: { row: AgentStatisticsRow }) => {
  const title = [row.label, row.description].filter(Boolean).join('\n')

  return (
    <div className="min-w-0" title={title}>
      <div className="truncate font-medium">{row.label}</div>
      {row.description ? (
        <div className="mt-0.5 truncate text-muted-foreground">
          {row.description}
        </div>
      ) : null}
    </div>
  )
}

const metricColumn = (
  id: string,
  header: string,
  getValue: (metrics: AgentStatisticsMetrics) => number,
  format: (value: number) => string = formatCompactNumber,
): StatsColumn => ({
  align: 'right',
  header,
  id,
  render: (row) => format(getValue(row.metrics)),
})

const segmentColumns: StatsColumn[] = [
  {
    className: 'w-[36%]',
    header: 'Segment',
    id: 'segment',
    render: (row) => <SegmentCell row={row} />,
  },
  metricColumn('runs', 'Runs', (metrics) => metrics.runs),
  metricColumn(
    'responses',
    'Responses',
    (metrics) => metrics.assistantResponses,
  ),
  metricColumn('tools', 'Tools', (metrics) => metrics.toolUses),
  metricColumn('reasoning', 'Reasoning', (metrics) => metrics.reasoningBlocks),
  metricColumn(
    'provider',
    'Provider',
    (metrics) => metrics.providerTotalTokens,
    formatTokenCount,
  ),
  metricColumn(
    'tool-io',
    'Tool I/O',
    (metrics) => metrics.toolInputTokens + metrics.toolOutputTokens,
    formatTokenCount,
  ),
  metricColumn(
    'duration',
    'Duration',
    (metrics) => metrics.durationMs,
    formatDuration,
  ),
]

const modelColumns: StatsColumn[] = [
  {
    className: 'w-[34%]',
    header: 'Model',
    id: 'model',
    render: (row) => <SegmentCell row={row} />,
  },
  metricColumn('requests', 'Requests', (metrics) => metrics.providerRequests),
  metricColumn(
    'input',
    'Input',
    (metrics) => metrics.providerInputTokens,
    formatTokenCount,
  ),
  metricColumn(
    'output',
    'Output',
    (metrics) => metrics.providerOutputTokens,
    formatTokenCount,
  ),
  metricColumn(
    'reasoning',
    'Reasoning',
    (metrics) => metrics.providerReasoningTokens,
    formatTokenCount,
  ),
  metricColumn(
    'cached',
    'Cached',
    (metrics) => metrics.cachedInputTokens,
    formatTokenCount,
  ),
  metricColumn(
    'total',
    'Total',
    (metrics) => metrics.providerTotalTokens,
    formatTokenCount,
  ),
]

const toolColumns: StatsColumn[] = [
  {
    className: 'w-[38%]',
    header: 'Tool',
    id: 'tool',
    render: (row) => <SegmentCell row={row} />,
  },
  metricColumn('uses', 'Uses', (metrics) => metrics.toolUses),
  metricColumn(
    'input',
    'Input Est.',
    (metrics) => metrics.toolInputTokens,
    formatTokenCount,
  ),
  metricColumn(
    'output',
    'Output Est.',
    (metrics) => metrics.toolOutputTokens,
    formatTokenCount,
  ),
  metricColumn(
    'duration',
    'Duration',
    (metrics) => metrics.durationMs,
    formatDuration,
  ),
]

const recentRunColumns: StatsColumn[] = [
  {
    className: 'w-[42%]',
    header: 'Run',
    id: 'run',
    render: (row) => <RecentRunCell row={row} />,
  },
  {
    className: 'w-[13%]',
    header: 'Status',
    id: 'status',
    render: (row) => (
      <Badge className="whitespace-nowrap" variant="outline">
        {row.metadata ?? 'unknown'}
      </Badge>
    ),
  },
  {
    className: 'w-[23%]',
    header: 'Activity',
    id: 'activity',
    render: (row) => (
      <span className="block truncate text-muted-foreground">
        {formatCompactNumber(row.metrics.messages)} msg ·{' '}
        {formatCompactNumber(row.metrics.assistantResponses)} resp ·{' '}
        {formatCompactNumber(row.metrics.toolUses)} tools ·{' '}
        {formatCompactNumber(row.metrics.reasoningBlocks)} reason
      </span>
    ),
  },
  metricColumn(
    'provider',
    'Provider',
    (metrics) => metrics.providerTotalTokens,
    formatTokenCount,
  ),
  {
    align: 'right',
    className: 'w-[12%]',
    header: 'Updated',
    id: 'updated',
    render: (row) => (
      <span
        className="block truncate text-muted-foreground"
        title={row.timestamp ? new Date(row.timestamp).toLocaleString() : ''}
      >
        {row.timestamp ? formatShortDateTime(row.timestamp) : '-'}
      </span>
    ),
  },
]

function formatTokenCount(value: number) {
  return `${formatCompactNumber(value)} tok`
}

function formatDuration(value: number) {
  if (!value) {
    return '-'
  }

  return formatDurationMs(value)
}

function formatShortDateTime(value: string) {
  const date = new Date(value)

  return date.toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'numeric',
  })
}
