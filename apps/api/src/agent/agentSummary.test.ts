import { formatAgentResultSummary } from './agentSummary'

describe('Given agent summary formatting', () => {
  it('keeps compact result summaries as a single preview line', () => {
    expect(formatAgentResultSummary('Done.\n\nVerified with tests.')).toBe(
      'Done. Verified with tests.',
    )
  })
})
