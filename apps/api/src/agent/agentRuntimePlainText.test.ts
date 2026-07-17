import { shouldAwaitUserAfterPlainTextAssistant } from './agentRuntime'

describe('Given plain-text assistant responses', () => {
  it('when a run emits plain text, then the runtime waits for the user', () => {
    expect(shouldAwaitUserAfterPlainTextAssistant({ id: 'run-1' })).toBe(true)
  })
})
