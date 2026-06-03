import { describe, expect, it } from '@jest/globals'
import type { SandboxSettings, SandboxWorkspace } from '@patchlane/shared'
import {
  buildCodingSystemPrompt,
  buildDurabilityRetryPrompt,
} from './codingPrompts'

describe('Given coding agent prompts', () => {
  const settings: SandboxSettings = {
    allowedCommands: ['git', 'pnpm', 'rg', 'sed'],
    defaultTimeoutMs: 120_000,
    envAllowlist: ['PATH', 'HOME'],
    maxOutputBytes: 131_072,
    rootDir: '/tmp/patchlane',
  }

  const workspace: SandboxWorkspace = {
    cleanupStatus: 'active',
    createdAt: '2026-06-03T00:00:00.000Z',
    id: 'workspace-1',
    kind: 'task_worktree',
    name: 'Patchlane task',
    path: '/tmp/patchlane/repo',
    repositoryUrl: 'https://github.com/ashon/patchlane',
    status: 'ready',
    updatedAt: '2026-06-03T00:00:00.000Z',
  }

  it('when building the system prompt, then it states workspace and command boundaries', () => {
    const prompt = buildCodingSystemPrompt({ settings, workspace })

    expect(prompt).toContain('isolated sandbox workspace')
    expect(prompt).toContain('Workspace path: /tmp/patchlane/repo')
    expect(prompt).toContain('Repository: https://github.com/ashon/patchlane')
    expect(prompt).toContain('Allowed run_command commands: git, pnpm, rg, sed')
    expect(prompt).toContain('Never rely on shell metacharacters')
    expect(prompt).toContain('run reasonable verification')
    expect(prompt).toContain('use add_issue_comment')
  })

  it('when building a durability retry prompt, then it preserves retry budget context', () => {
    const prompt = buildDurabilityRetryPrompt({
      attempt: 2,
      maxRetries: 3,
      totalToolIterations: 12,
    })

    expect(prompt).toContain('Durability auto-retry mode')
    expect(prompt).toContain('12 tool-call budget')
    expect(prompt).toContain('automatic retry 2 of 3')
    expect(prompt).toContain('Do not repeat broad file listing')
  })
})
