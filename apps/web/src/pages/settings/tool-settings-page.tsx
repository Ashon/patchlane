import type {
  GitHubToolTestResult,
  PublicToolSettings,
  UpdateGitHubToolSettingsInput,
} from '@patchlane/shared'
import { type FormEvent, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Github,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
} from 'lucide-react'
import {
  emptyGitHubToolDraft,
  type GitHubToolDraft,
} from '@/components/app/app-types'
import { Button } from '@patchlane/ui/button'
import { Input } from '@patchlane/ui/input'
import {
  Field,
  ToolStatusRow,
} from '@/components/app/panel-primitives'
import { GitHubTestBadge, StateBadge } from '@/components/app/status-badges'
import {
  ErrorBanner,
  PageAside,
  PageHeader,
  PagePane,
  PageScroll,
  PageSection,
  PageSplit,
} from '@/components/layout/page-primitives'
import { api } from '@/lib/api'
import { getErrorMessage, getQueryErrorMessage } from '@/lib/errors'
import { queryKeys } from '@/lib/query-client'

export const ToolSettingsPage = () => {
  const queryClient = useQueryClient()
  const [draftOverride, setDraftOverride] =
    useState<GitHubToolDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] =
    useState<GitHubToolTestResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const settingsQuery = useQuery({
    queryKey: queryKeys.toolSettings,
    queryFn: api.getToolSettings,
  })
  const settings = settingsQuery.data?.settings ?? null
  const github = settings?.github
  const draft = draftOverride ?? {
    ...emptyGitHubToolDraft,
    enabled: github?.enabled ?? emptyGitHubToolDraft.enabled,
  }
  const visibleError = error ?? getQueryErrorMessage(settingsQuery.error)
  const tokenInputDisabled = draft.clearToken && !draft.token
  const ready = Boolean(github?.enabled && github.tokenConfigured)

  const applyToolSettings = (settings: PublicToolSettings) => {
    queryClient.setQueryData<{ settings: PublicToolSettings }>(
      queryKeys.toolSettings,
      { settings },
    )
    setDraftOverride({
      enabled: settings.github.enabled,
      token: '',
      clearToken: false,
    })
  }

  const saveGitHubToolSettings = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const response = await api.updateGitHubToolSettings(
        normalizeGitHubToolDraft(draft),
      )
      applyToolSettings(response.settings)
      setTestResult(null)
    } catch (saveError) {
      setError(getErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  const testGitHubTool = async () => {
    setTesting(true)
    setError(null)

    try {
      const response = await api.testGitHubTool()
      setTestResult(response.result)
      applyToolSettings(response.settings)
    } catch (testError) {
      setTestResult(null)
      setError(getErrorMessage(testError))
    } finally {
      setTesting(false)
    }
  }

  return (
    <PageSplit>
      <PagePane minHeight="none">
        <PageHeader
          actions={
            <>
              <StateBadge tone={draft.enabled ? 'success' : 'warning'}>
                {draft.enabled ? 'Enabled' : 'Disabled'}
              </StateBadge>
              <StateBadge
                tone={github?.tokenConfigured ? 'success' : 'warning'}
              >
                {github?.tokenConfigured ? 'PAT configured' : 'PAT missing'}
              </StateBadge>
              {testResult ? <GitHubTestBadge result={testResult} /> : null}
            </>
          }
          description="Repository tooling and credentials"
          icon={<Github className="h-4 w-4" />}
          title="Tools"
        />
        <PageScroll viewportClassName="p-3">
          <form className="space-y-2.5" onSubmit={saveGitHubToolSettings}>
            <label className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm">
              <span className="font-medium">Enabled</span>
              <input
                checked={draft.enabled}
                className="h-4 w-4 accent-primary"
                onChange={(event) =>
                  setDraftOverride({
                    ...draft,
                    enabled: event.target.checked,
                  })
                }
                type="checkbox"
              />
            </label>

            <Field label="Personal access token">
              <Input
                autoComplete="off"
                disabled={tokenInputDisabled}
                onChange={(event) =>
                  setDraftOverride({
                    ...draft,
                    clearToken: false,
                    token: event.target.value,
                  })
                }
                placeholder={
                  github?.tokenConfigured
                    ? 'Stored token configured'
                    : 'github_pat_...'
                }
                spellCheck={false}
                type="password"
                value={draft.token}
              />
            </Field>

            {github?.tokenConfigured ? (
              <label className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm">
                <span className="font-medium">Clear stored PAT</span>
                <input
                  checked={draft.clearToken}
                  className="h-4 w-4 accent-primary"
                  disabled={Boolean(draft.token.trim())}
                  onChange={(event) =>
                    setDraftOverride({
                      ...draft,
                      clearToken: event.target.checked,
                    })
                  }
                  type="checkbox"
                />
              </label>
            ) : null}

            <ErrorBanner message={visibleError} variant="card" />

            {testResult?.error ? (
              <p className="text-sm text-destructive">{testResult.error}</p>
            ) : null}

            <div className="flex items-center justify-end gap-2 border-t pt-3">
              <Button
                disabled={testing || !github?.tokenConfigured || !draft.enabled}
                onClick={() => void testGitHubTool()}
                size="sm"
                type="button"
                variant="outline"
              >
                {testing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Test
              </Button>
              <Button disabled={saving} size="sm" type="submit">
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                Save
              </Button>
            </div>
          </form>
        </PageScroll>
      </PagePane>

      <PageAside viewportClassName="">
        <PageSection
          title={
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Git clone readiness
            </span>
          }
        >
          <div className="space-y-0">
            <ToolStatusRow
              label="Status"
              value={ready ? 'Ready' : 'Not ready'}
            />
            <ToolStatusRow
              icon={<KeyRound className="h-4 w-4" />}
              label="Credential"
              value={github?.tokenPreview || 'Missing'}
            />
            <ToolStatusRow
              label="Account"
              value={github?.username || 'Not validated'}
            />
            <ToolStatusRow
              label="Scopes"
              value={
                github?.scopes.length
                  ? github.scopes.join(', ')
                  : 'Not reported'
              }
            />
            <ToolStatusRow
              label="Last validation"
              value={formatDateTime(github?.validatedAt)}
            />
          </div>
        </PageSection>
      </PageAside>
    </PageSplit>
  )
}

export const normalizeGitHubToolDraft = (
  draft: GitHubToolDraft,
): UpdateGitHubToolSettingsInput => {
  const token = draft.token.trim()
  const input: UpdateGitHubToolSettingsInput = {
    enabled: draft.enabled,
  }

  if (token) {
    input.token = token
    return input
  }

  if (draft.clearToken) {
    input.clearToken = true
  }

  return input
}

const formatDateTime = (value?: string) => {
  if (!value) {
    return 'Never'
  }

  return new Date(value).toLocaleString()
}
