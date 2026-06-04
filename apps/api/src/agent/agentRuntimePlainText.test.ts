import { shouldAwaitUserAfterPlainTextAssistant } from './agentRuntime'

describe('Given plain-text assistant responses', () => {
  it('when an ad-hoc run has no issue, then the runtime waits for the user', () => {
    expect(
      shouldAwaitUserAfterPlainTextAssistant({ issueId: undefined }),
    ).toBe(true)
  })

  it('when an issue run emits plain text, then the runtime keeps the finish/tool-call guard', () => {
    expect(shouldAwaitUserAfterPlainTextAssistant({ issueId: 'issue-1' })).toBe(
      false,
    )
  })
})
