import type {
  GitHubToolTestResult,
  LlmEndpointTestResult,
} from '@patchlane/shared'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@patchlane/ui/badge'
import { cn } from '@/lib/utils'

export const StateBadge = ({
  children,
  tone,
}: {
  children: ReactNode
  tone: 'success' | 'warning'
}) => {
  return (
    <Badge
      className={cn(
        'gap-1 hover:bg-current/0',
        tone === 'success' &&
          'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300',
        tone === 'warning' &&
          'border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300',
      )}
      variant="outline"
    >
      {children}
    </Badge>
  )
}

export const StatusBadge = ({ online }: { online: boolean | null }) => {
  if (online === null) {
    return <Badge variant="secondary">API pending</Badge>
  }

  return online ? (
    <Badge
      className="gap-1 border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
      variant="outline"
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      API online
    </Badge>
  ) : (
    <Badge className="gap-1" variant="destructive">
      <XCircle className="h-3.5 w-3.5" />
      API offline
    </Badge>
  )
}

export const TestBadge = ({ result }: { result: LlmEndpointTestResult }) => {
  return result.ok ? (
    <Badge
      className="gap-1 border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
      variant="outline"
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      {result.latencyMs} ms
    </Badge>
  ) : (
    <Badge className="gap-1" variant="destructive">
      <XCircle className="h-3.5 w-3.5" />
      Failed
    </Badge>
  )
}

export const GitHubTestBadge = ({
  result,
}: {
  result: GitHubToolTestResult
}) => {
  return result.ok ? (
    <Badge
      className="gap-1 border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
      variant="outline"
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      {result.latencyMs} ms
    </Badge>
  ) : (
    <Badge className="gap-1" variant="destructive">
      <XCircle className="h-3.5 w-3.5" />
      Failed
    </Badge>
  )
}

