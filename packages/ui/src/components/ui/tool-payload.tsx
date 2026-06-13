import {
  detectJson,
  formatJson,
  truncateForPreview,
} from '../../lib/tool-format'
import { cn } from '../../lib/utils'
import { CheckCircle, Copy, File, Folder } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { CodeBlock, CodeBlockCode } from './code-block'

export type ToolPayloadPart = {
  type: string
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available'
    | 'output-error'
  input?: Record<string, unknown>
  output?: unknown
  toolCallId?: string
  errorText?: string
}

export const getToolPayloadPreview = (toolPart: ToolPayloadPart) => {
  if (toolPart.errorText) {
    return normalizePreview(truncateForPreview(toolPart.errorText, 100))
  }

  const output = getParsedOutput(toolPart.output)

  if (toolPart.type === 'read_file' && isRecord(output)) {
    return normalizePreview(
      [
        asString(output.path),
        getLineRangeLabel(output),
        output.truncated ? 'truncated' : null,
      ]
        .filter(Boolean)
        .join(' · '),
    )
  }

  if (toolPart.type === 'write_file') {
    const path = getToolPath(toolPart)
    return normalizePreview(path ? `wrote ${path}` : 'file written')
  }

  if (toolPart.type === 'list_files' && isRecord(output)) {
    const entries = Array.isArray(output.entries) ? output.entries : []
    return `${entries.length.toLocaleString()} entries`
  }

  if (isCommandTool(toolPart.type) && isRecord(output)) {
    const command = getCommandLabel(toolPart, output)
    const exitCode =
      typeof output.exitCode === 'number' ? `exit ${output.exitCode}` : null
    return normalizePreview([command, exitCode].filter(Boolean).join(' · '))
  }

  if (toolPart.type === 'add_issue_comment' && isRecord(output)) {
    const comment = isRecord(output.comment) ? output.comment : undefined
    const kind = asString(comment?.kind)
    return normalizePreview(
      kind ? `comment recorded · ${kind}` : 'comment recorded',
    )
  }

  if (toolPart.output !== undefined && toolPart.output !== null) {
    return normalizePreview(truncateForPreview(toolPart.output, 100))
  }

  if (toolPart.input && Object.keys(toolPart.input).length > 0) {
    return normalizePreview(truncateForPreview(toolPart.input, 100))
  }

  if (toolPart.state === 'input-streaming') {
    return 'Processing tool call...'
  }

  return ''
}

export const ToolPayloadView = ({
  compact,
  showCallId = true,
  toolPart,
}: {
  compact: boolean
  showCallId?: boolean
  toolPart: ToolPayloadPart
}) => {
  const output = getParsedOutput(toolPart.output)

  return (
    <>
      {renderSpecializedToolPayload(toolPart, output, compact)}

      {toolPart.state === 'output-error' && toolPart.errorText ? (
        <ToolPayloadSection title="Error" tone="error">
          <div
            className={cn(
              'min-w-0 break-words rounded-md border border-destructive/25 bg-destructive/10 p-2 text-destructive',
              compact && 'p-1.5 text-xs',
            )}
          >
            {toolPart.errorText}
          </div>
        </ToolPayloadSection>
      ) : null}

      {toolPart.state === 'input-streaming' ? (
        <div className="text-muted-foreground">Processing tool call...</div>
      ) : null}

      {showCallId && toolPart.toolCallId ? (
        <div className="text-[11px] text-muted-foreground">
          <span className="font-mono">Call ID: {toolPart.toolCallId}</span>
        </div>
      ) : null}

      {!hasToolPayload(toolPart) ? (
        <div className="text-muted-foreground">No tool payload recorded.</div>
      ) : null}
    </>
  )
}

const renderSpecializedToolPayload = (
  toolPart: ToolPayloadPart,
  output: unknown,
  compact: boolean,
) => {
  if (toolPart.type === 'read_file' && isReadFileOutput(output)) {
    return <ReadFilePayload compact={compact} output={output} />
  }

  if (toolPart.type === 'write_file') {
    return (
      <WriteFilePayload compact={compact} output={output} toolPart={toolPart} />
    )
  }

  if (toolPart.type === 'list_files' && isRecord(output)) {
    return <ListFilesPayload compact={compact} output={output} />
  }

  if (isCommandTool(toolPart.type) && isRecord(output)) {
    return (
      <CommandPayload compact={compact} output={output} toolPart={toolPart} />
    )
  }

  if (toolPart.type === 'add_issue_comment') {
    return (
      <IssueCommentPayload
        compact={compact}
        output={output}
        toolPart={toolPart}
      />
    )
  }

  return <GenericPayload compact={compact} toolPart={toolPart} />
}

const ReadFilePayload = ({
  compact,
  output,
}: {
  compact: boolean
  output: ReadFileOutput
}) => {
  return (
    <>
      <ToolMetaGrid
        compact={compact}
        items={[
          ['Path', output.path],
          ['Lines', getLineRangeLabel(output)],
          ['Size', formatBytes(output.size)],
          ['Modified', formatTimestamp(output.modifiedAt)],
          output.truncated ? ['Window', 'truncated'] : undefined,
        ]}
      />
      <ToolPayloadSection title="File content">
        <CodePanel
          code={output.content}
          compact={compact}
          language={getLanguageFromPath(output.path)}
        />
      </ToolPayloadSection>
    </>
  )
}

const WriteFilePayload = ({
  compact,
  output,
  toolPart,
}: {
  compact: boolean
  output: unknown
  toolPart: ToolPayloadPart
}) => {
  const outputRecord = isRecord(output) ? output : undefined
  const path = getToolPath(toolPart)
  const content =
    typeof toolPart.input?.content === 'string' ? toolPart.input.content : ''

  return (
    <>
      <ToolMetaGrid
        compact={compact}
        items={[
          ['Path', path],
          ['Status', outputRecord?.written === true ? 'written' : undefined],
          ['Size', formatBytes(outputRecord?.size)],
          ['Modified', formatTimestamp(outputRecord?.modifiedAt)],
        ]}
      />
      {content ? (
        <ToolPayloadSection title="Written content">
          <CodePanel
            code={content}
            compact={compact}
            language={getLanguageFromPath(path)}
          />
        </ToolPayloadSection>
      ) : null}
      {outputRecord ? (
        <ToolPayloadSection title="Write result">
          <JsonPanel compact={compact} value={outputRecord} />
        </ToolPayloadSection>
      ) : null}
    </>
  )
}

const ListFilesPayload = ({
  compact,
  output,
}: {
  compact: boolean
  output: Record<string, unknown>
}) => {
  const entries = Array.isArray(output.entries)
    ? output.entries.filter(isRecord)
    : []

  return (
    <ToolPayloadSection title="Files">
      <div
        className={cn(
          'max-h-72 min-w-0 overflow-auto rounded-md border bg-background',
          compact && 'max-h-56',
        )}
      >
        {entries.length ? (
          <div className="divide-y">
            {entries.map((entry, index) => (
              <div
                className="grid min-w-0 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-2 px-2 py-1.5"
                key={`${entry.path ?? entry.name ?? index}`}
              >
                {entry.type === 'directory' ? (
                  <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <File className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {asString(entry.path) || asString(entry.name) || '-'}
                  </div>
                  {entry.modifiedAt ? (
                    <div className="truncate text-[11px] text-muted-foreground">
                      {formatTimestamp(entry.modifiedAt)}
                    </div>
                  ) : null}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {entry.type === 'directory'
                    ? 'dir'
                    : formatBytes(entry.size) || 'file'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-2 text-muted-foreground">No files recorded.</div>
        )}
      </div>
    </ToolPayloadSection>
  )
}

const CommandPayload = ({
  compact,
  output,
  toolPart,
}: {
  compact: boolean
  output: Record<string, unknown>
  toolPart: ToolPayloadPart
}) => {
  const stdout = asString(output.stdout)
  const stderr = asString(output.stderr)
  const commandLabel = getCommandLabel(toolPart, output)
  const exitCode =
    typeof output.exitCode === 'number' ? String(output.exitCode) : undefined

  return (
    <>
      <ToolMetaGrid
        compact={compact}
        items={[
          ['Command', commandLabel],
          ['Exit', exitCode],
          ['Duration', formatDuration(output.durationMs)],
          ['CWD', asString(output.cwd)],
          output.truncated ? ['Output', 'truncated'] : undefined,
          output.timedOut ? ['Timeout', 'timed out'] : undefined,
        ]}
      />
      {stdout ? (
        <ToolPayloadSection title="Stdout">
          <CodePanel
            code={stdout}
            compact={compact}
            language={getCommandOutputLanguage(toolPart, output)}
          />
        </ToolPayloadSection>
      ) : null}
      {stderr ? (
        <ToolPayloadSection title="Stderr" tone="error">
          <CodePanel code={stderr} compact={compact} language="text" />
        </ToolPayloadSection>
      ) : null}
      {!stdout && !stderr ? (
        <ToolPayloadSection title="Output">
          <div className="rounded-md border bg-background p-2 text-muted-foreground">
            No stdout or stderr recorded.
          </div>
        </ToolPayloadSection>
      ) : null}
    </>
  )
}

const IssueCommentPayload = ({
  compact,
  output,
  toolPart,
}: {
  compact: boolean
  output: unknown
  toolPart: ToolPayloadPart
}) => {
  const outputRecord = isRecord(output) ? output : undefined
  const comment = isRecord(outputRecord?.comment)
    ? outputRecord.comment
    : undefined
  const body = asString(comment?.body) || asString(toolPart.input?.body)
  const kind = asString(comment?.kind) || asString(toolPart.input?.kind)

  return (
    <>
      <ToolMetaGrid
        compact={compact}
        items={[
          ['Kind', kind],
          ['Recorded', outputRecord?.recorded === true ? 'yes' : undefined],
          ['Created', formatTimestamp(comment?.createdAt)],
        ]}
      />
      {body ? (
        <ToolPayloadSection title="Comment">
          <div className="min-w-0 whitespace-pre-wrap rounded-md border bg-background p-2 leading-5">
            {body}
          </div>
        </ToolPayloadSection>
      ) : null}
    </>
  )
}

const GenericPayload = ({
  compact,
  toolPart,
}: {
  compact: boolean
  toolPart: ToolPayloadPart
}) => {
  return (
    <>
      {toolPart.input && Object.keys(toolPart.input).length > 0 ? (
        <ToolPayloadSection title="Input">
          <KeyValuePayload compact={compact} value={toolPart.input} />
        </ToolPayloadSection>
      ) : null}
      {toolPart.output !== undefined && toolPart.output !== null ? (
        <ToolPayloadSection title="Output">
          <JsonPanel compact={compact} value={toolPart.output} />
        </ToolPayloadSection>
      ) : null}
    </>
  )
}

const KeyValuePayload = ({
  compact,
  value,
}: {
  compact: boolean
  value: Record<string, unknown>
}) => {
  return (
    <div className="grid gap-1">
      {Object.entries(value).map(([key, item]) => {
        const json = detectJson(item)

        return (
          <div className="min-w-0 break-words" key={key}>
            <span className="text-muted-foreground">{key}:</span>{' '}
            {json.isJson ? (
              <JsonPanel compact={compact} value={json.parsed} />
            ) : (
              <span className="font-mono">{formatPlainValue(item)}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

const ToolMetaGrid = ({
  compact,
  items,
}: {
  compact: boolean
  items: Array<[string, string | undefined] | undefined>
}) => {
  const visibleItems = items.filter((item): item is [string, string] =>
    Boolean(item?.[1]),
  )

  if (!visibleItems.length) {
    return null
  }

  return (
    <div
      className={cn(
        'grid min-w-0 gap-1 rounded-md border bg-background p-2',
        compact ? 'grid-cols-2 text-xs' : 'grid-cols-3 text-sm',
      )}
    >
      {visibleItems.map(([label, value]) => (
        <div className="min-w-0" key={label}>
          <div className="truncate text-[10px] font-medium uppercase text-muted-foreground">
            {label}
          </div>
          <div className="truncate font-medium">{value}</div>
        </div>
      ))}
    </div>
  )
}

const ToolPayloadSection = ({
  children,
  title,
  tone = 'default',
}: {
  children: ReactNode
  title: string
  tone?: 'default' | 'error'
}) => {
  return (
    <section className="min-w-0">
      <h4
        className={cn(
          'mb-1 text-xs font-medium uppercase',
          tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {title}
      </h4>
      {children}
    </section>
  )
}

const JsonPanel = ({
  compact,
  value,
}: {
  compact: boolean
  value: unknown
}) => {
  const json = detectJson(value)
  const formatted = json.isJson
    ? formatJson(json.parsed, 2)
    : formatPlainValue(value)

  return <CodePanel code={formatted} compact={compact} language="json" />
}

const CodePanel = ({
  code,
  compact,
  language,
}: {
  code: string
  compact: boolean
  language?: string
}) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => {
      setCopied(false)
    }, 2000)
  }

  return (
    <div className="relative min-w-0">
      {shouldHighlight(language) ? (
        <CodeBlock className="max-w-full overflow-hidden rounded-md bg-background">
          <CodeBlockCode
            className={cn(
              'max-h-72 min-w-0 overflow-hidden text-xs leading-5',
              '[&>pre]:!m-0 [&>pre]:!max-h-72 [&>pre]:!overflow-auto [&>pre]:!whitespace-pre-wrap [&>pre]:!bg-transparent [&>pre]:!p-2 [&>pre]:!pr-10',
              '[&>pre_code]:block [&>pre_code]:min-w-0 [&>pre_code]:break-words',
              compact &&
                'max-h-56 text-xs leading-4 [&>pre]:!max-h-56 [&>pre]:!p-1.5 [&>pre]:!pr-8',
            )}
            code={code}
            language={language}
          />
        </CodeBlock>
      ) : (
        <pre
          className={cn(
            'max-h-72 min-w-0 overflow-auto whitespace-pre rounded-md border bg-background p-2 pr-10 font-mono leading-5',
            compact && 'max-h-56 p-1.5 pr-8 text-xs leading-4',
          )}
        >
          {code}
        </pre>
      )}
      <button
        aria-label={copied ? 'Copied' : 'Copy content'}
        className={cn(
          'absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md border bg-background text-muted-foreground transition-colors hover:text-foreground',
          compact && 'right-1 top-1 h-6 w-6',
        )}
        onClick={handleCopy}
        type="button"
      >
        {copied ? (
          <CheckCircle
            className={cn('h-3.5 w-3.5 text-emerald-500', compact && 'h-3 w-3')}
          />
        ) : (
          <Copy className={cn('h-3.5 w-3.5', compact && 'h-3 w-3')} />
        )}
      </button>
    </div>
  )
}

const shouldHighlight = (language?: string) => {
  return Boolean(language && language !== 'text')
}

type ReadFileOutput = {
  content: string
  endLine?: number
  modifiedAt?: string
  path: string
  size?: number
  startLine?: number
  totalLines?: number
  truncated?: boolean
}

const isReadFileOutput = (value: unknown): value is ReadFileOutput => {
  return (
    isRecord(value) &&
    typeof value.path === 'string' &&
    typeof value.content === 'string'
  )
}

const getParsedOutput = (output: unknown) => {
  const json = detectJson(output)

  return json.isJson ? json.parsed : output
}

const hasToolPayload = (toolPart: ToolPayloadPart) => {
  return Boolean(
    (toolPart.input && Object.keys(toolPart.input).length > 0) ||
    toolPart.output !== undefined ||
    toolPart.errorText ||
    toolPart.state === 'input-streaming',
  )
}

const isCommandTool = (toolName: string) => {
  return (
    toolName === 'run_command' ||
    toolName === 'git_status' ||
    toolName === 'git_diff'
  )
}

const getCommandLabel = (
  toolPart: ToolPayloadPart,
  output: Record<string, unknown>,
) => {
  const command = asString(output.command) || asString(toolPart.input?.command)
  const args = Array.isArray(output.args)
    ? output.args.map(String)
    : Array.isArray(toolPart.input?.args)
      ? toolPart.input.args.map(String)
      : []

  if (command) {
    return [command, ...args].join(' ')
  }

  if (toolPart.type === 'git_status') {
    return 'git status --short --branch'
  }

  if (toolPart.type === 'git_diff') {
    return 'git diff --stat'
  }

  return toolPart.type
}

const getCommandOutputLanguage = (
  toolPart: ToolPayloadPart,
  output: Record<string, unknown>,
) => {
  const commandLabel = getCommandLabel(toolPart, output)

  if (toolPart.type === 'git_diff' || /\bgit\s+diff\b/u.test(commandLabel)) {
    return 'diff'
  }

  return 'text'
}

const getToolPath = (toolPart: ToolPayloadPart) => {
  const output = getParsedOutput(toolPart.output)

  if (isRecord(output)) {
    const path = asString(output.path)

    if (path) {
      return path
    }
  }

  return asString(toolPart.input?.path)
}

const getLineRangeLabel = (value: Record<string, unknown>) => {
  const startLine =
    typeof value.startLine === 'number' ? value.startLine : undefined
  const endLine = typeof value.endLine === 'number' ? value.endLine : undefined
  const totalLines =
    typeof value.totalLines === 'number' ? value.totalLines : undefined

  if (startLine && endLine && totalLines) {
    return `${startLine}-${endLine} / ${totalLines}`
  }

  if (startLine && endLine) {
    return `${startLine}-${endLine}`
  }

  return undefined
}

const getLanguageFromPath = (path?: string) => {
  const extension = path?.split('.').pop()?.toLowerCase()

  if (!extension) {
    return 'text'
  }

  const languageByExtension: Record<string, string> = {
    cjs: 'javascript',
    css: 'css',
    js: 'javascript',
    json: 'json',
    jsx: 'jsx',
    md: 'markdown',
    mts: 'typescript',
    ts: 'typescript',
    tsx: 'tsx',
    yaml: 'yaml',
    yml: 'yaml',
  }

  return languageByExtension[extension] ?? 'text'
}

const formatPlainValue = (value: unknown) => {
  if (value === null) {
    return 'null'
  }

  if (value === undefined) {
    return 'undefined'
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }

  return String(value)
}

const formatBytes = (value: unknown) => {
  if (typeof value !== 'number') {
    return undefined
  }

  if (value < 1024) {
    return `${value.toLocaleString()} B`
  }

  return `${(value / 1024).toFixed(1)} KB`
}

const formatTimestamp = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

const formatDuration = (value: unknown) => {
  if (typeof value !== 'number') {
    return undefined
  }

  if (value < 1000) {
    return `${value.toLocaleString()}ms`
  }

  return `${(value / 1000).toFixed(1)}s`
}

const asString = (value: unknown) => {
  return typeof value === 'string' && value.trim() ? value : undefined
}

const normalizePreview = (value: string) => value.replace(/\s+/g, ' ').trim()

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
