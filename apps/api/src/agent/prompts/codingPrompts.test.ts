import { describe, expect, it } from '@jest/globals'
import type { SandboxSettings, SandboxWorkspace } from '@patchlane/shared'
import {
  buildCodingSystemPrompt,
  buildDurabilityRetryPrompt,
  plainTextContinuationPrompt,
  postDiffCompletionPrompt,
  postEditCompletionPrompt,
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
    expect(prompt).toContain('Completion contract')
    expect(prompt).toContain('inspect git status/diff')
    expect(prompt).toContain('short loops')
    expect(prompt).toContain('three consecutive tool calls')
    expect(prompt).toContain('Verification failures are normal coding feedback')
    expect(prompt).toContain('read the error')
    expect(prompt).toContain('use add_issue_comment')
    expect(prompt).toContain('final summary issue comment')
  })

  it('when building a research system prompt, then it prevents implementation drift', () => {
    const prompt = buildCodingSystemPrompt({
      runKind: 'research',
      settings,
      workspace,
    })

    expect(prompt).toContain('research-only run')
    expect(prompt).toContain('Do not modify files')
    expect(prompt).toContain('read-only inspection')
    expect(prompt).toContain('Do not stop at the first plausible answer')
    expect(prompt).toContain('confirm no repository files changed')
    expect(prompt).toContain('final research summary issue comment')
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
    expect(prompt).toContain('If verification failed')
    expect(prompt).toContain('completion pass')
  })

  it('when a model emits plain text without a tool, then the continuation prompt forces a concrete run action', () => {
    expect(plainTextContinuationPrompt).toContain('cannot stop')
    expect(plainTextContinuationPrompt).toContain('convert it into a finish')
    expect(plainTextContinuationPrompt).toContain('call finish')
    expect(plainTextContinuationPrompt).toContain('request_user_input')
    expect(plainTextContinuationPrompt).toContain('next concrete tool')
  })

  it('when a file has been edited, then the post-edit prompt drives the run toward verification and finish', () => {
    expect(postEditCompletionPrompt).toContain('A file was just edited')
    expect(postEditCompletionPrompt).toContain(
      'narrowest relevant verification',
    )
    expect(postEditCompletionPrompt).toContain('git status/diff')
    expect(postEditCompletionPrompt).toContain('call finish')
  })

  it('when diff has been inspected, then the checkpoint prompt discourages extra tools', () => {
    expect(postDiffCompletionPrompt).toContain('inspected workspace status')
    expect(postDiffCompletionPrompt).toContain('call finish now')
    expect(postDiffCompletionPrompt).toContain('specific failing check')
  })
})
