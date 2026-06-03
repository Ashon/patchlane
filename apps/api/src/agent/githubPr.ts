import type { SandboxWorkspace } from '@patchlane/shared'

type CreatePullRequestInput = {
  workspace: SandboxWorkspace
  token: string
  title: string
  body: string
  head: string
  base: string
}

export const createPullRequest = async ({
  workspace,
  token,
  title,
  body,
  head,
  base,
}: CreatePullRequestInput) => {
  const repository = parseGitHubRepository(workspace.repositoryUrl)

  if (!repository) {
    throw new Error('Workspace repository is not a GitHub HTTPS repository')
  }

  const response = await fetch(
    `https://api.github.com/repos/${repository.owner}/${repository.repo}/pulls`,
    {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'user-agent': 'patchlane-local',
      },
      body: JSON.stringify({
        title,
        body,
        head,
        base,
      }),
    },
  )

  const payload = (await response.json().catch(() => null)) as {
    html_url?: unknown
    message?: unknown
    errors?: unknown
  } | null

  if (!response.ok) {
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : response.statusText
    const details = formatGitHubValidationErrors(payload?.errors)
    throw new Error(
      `GitHub PR creation failed: ${[message, details]
        .filter(Boolean)
        .join(' - ')}`,
    )
  }

  if (typeof payload?.html_url !== 'string') {
    throw new Error('GitHub PR creation succeeded without a URL')
  }

  return payload.html_url
}

const formatGitHubValidationErrors = (errors: unknown) => {
  if (!Array.isArray(errors)) {
    return ''
  }

  return errors
    .map((error) => {
      if (!error || typeof error !== 'object') {
        return ''
      }

      const item = error as Record<string, unknown>
      const field = [item.resource, item.field].filter(Boolean).join('.')
      const code = typeof item.code === 'string' ? item.code : ''
      const message = typeof item.message === 'string' ? item.message : ''

      return [field, code, message].filter(Boolean).join(': ')
    })
    .filter(Boolean)
    .join('; ')
}

const parseGitHubRepository = (repositoryUrl?: string) => {
  if (!repositoryUrl) {
    return null
  }

  const sshMatch = repositoryUrl.match(
    /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/u,
  )

  if (sshMatch?.[1] && sshMatch[2]) {
    return {
      owner: sshMatch[1],
      repo: sshMatch[2].replace(/\.git$/u, ''),
    }
  }

  const parsed = new URL(repositoryUrl)
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
    return null
  }

  const [owner, rawRepo] = parsed.pathname.split('/').filter(Boolean)
  const repo = rawRepo?.replace(/\.git$/u, '')

  return owner && repo ? { owner, repo } : null
}
