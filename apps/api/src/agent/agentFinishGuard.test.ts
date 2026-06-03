import { describe, expect, it } from '@jest/globals'
import { getFinishRejection } from './agentFinishGuard'

describe('Given agent finish guard', () => {
  it('when an issue finish summary describes planned or interrupted work, then it rejects completion', () => {
    const rejection = getFinishRejection({
      gitStatusShort: '',
      issueRun: true,
      summary:
        'I analyzed the code and proposed solution. The session was terminated before I could implement the changes.',
    })

    expect(rejection).toContain('finish rejected')
    expect(rejection).toContain('incomplete')
  })

  it('when an issue run has no workspace changes, then it rejects completion unless no-change work is explicit', () => {
    expect(
      getFinishRejection({
        gitStatusShort: '',
        issueRun: true,
        summary: 'Updated the issue successfully.',
      }),
    ).toContain('no workspace changes')

    expect(
      getFinishRejection({
        gitStatusShort: '',
        issueRun: true,
        summary:
          'No code changes were needed because the behavior was already implemented.',
      }),
    ).toBeUndefined()
  })

  it('when an issue run has workspace changes, then it allows completion', () => {
    expect(
      getFinishRejection({
        gitStatusShort: ' M packages/shared/src/issues.ts',
        issueRun: true,
        summary: 'Implemented title-only issue creation and verified it.',
      }),
    ).toBeUndefined()
  })

  it('when this is not an issue run, then it does not enforce issue completion rules', () => {
    expect(
      getFinishRejection({
        gitStatusShort: '',
        issueRun: false,
        summary: 'Proposed solution only.',
      }),
    ).toBeUndefined()
  })
})
