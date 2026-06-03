import type { GitHubToolTestResult } from '@patchlane/shared'

const githubUserUrl = 'https://api.github.com/user'

export const testGitHubToken = async (
  token: string,
): Promise<GitHubToolTestResult> => {
  const startedAt = Date.now()
  const checkedAt = new Date().toISOString()

  try {
    const response = await fetch(githubUserUrl, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'user-agent': 'patchlane-local',
      },
    })

    const scopes = parseScopes(response.headers.get('x-oauth-scopes'))
    const rateLimitRemaining = parseHeaderInt(
      response.headers.get('x-ratelimit-remaining'),
    )

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        message?: unknown
      } | null
      const message =
        typeof payload?.message === 'string'
          ? payload.message
          : response.statusText

      return {
        ok: false,
        checkedAt,
        latencyMs: Date.now() - startedAt,
        scopes,
        rateLimitRemaining,
        error: `GitHub returned ${response.status}: ${message}`,
      }
    }

    const payload = (await response.json()) as { login?: unknown }

    return {
      ok: true,
      checkedAt,
      latencyMs: Date.now() - startedAt,
      scopes,
      username: typeof payload.login === 'string' ? payload.login : undefined,
      rateLimitRemaining,
    }
  } catch (error) {
    return {
      ok: false,
      checkedAt,
      latencyMs: Date.now() - startedAt,
      scopes: [],
      error: getErrorMessage(error),
    }
  }
}

const parseScopes = (header: string | null) => {
  if (!header) {
    return []
  }

  return header
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean)
}

const parseHeaderInt = (header: string | null) => {
  if (!header) {
    return undefined
  }

  const parsed = Number.parseInt(header, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown GitHub error'
}
