import {
  formatAgentIssueSummary,
  formatAgentResultSummary,
} from './agentSummary'

describe('Given agent summary formatting', () => {
  it('keeps compact result summaries as a single preview line', () => {
    expect(formatAgentResultSummary('Done.\n\nVerified with tests.')).toBe(
      'Done. Verified with tests.',
    )
  })

  it('preserves readable Markdown structure for issue summary comments', () => {
    const summary = formatAgentIssueSummary(
      [
        '## Summary',
        '- Implemented execution history.',
        '- Added tests.',
        '',
        '## Verification',
        '- pnpm test passed.',
      ].join('\n'),
    )

    expect(summary).toContain('## Summary')
    expect(summary).toContain('- Implemented execution history.')
    expect(summary).toContain('\n\n## Verification')
  })

  it('repairs long plain summaries whose sentences were concatenated', () => {
    const summary = formatAgentIssueSummary(
      [
        'I inspected the repo.The schema needs a migration.',
        'Tests should cover the new durable execution path.This is ready for implementation.',
      ].join(''),
    )

    expect(summary).toContain('repo.\n\nThe schema')
    expect(summary).toContain('path.\n\nThis is ready')
  })

  it('splits very long plain text into readable paragraphs', () => {
    const summary = formatAgentIssueSummary(
      Array.from(
        { length: 8 },
        (_, index) =>
          `Sentence ${index + 1} includes enough detail about the implementation, verification evidence, and residual risk to make the plain text summary long.`,
      ).join(' '),
    )

    expect(summary).toContain(
      'Sentence 1 includes enough detail about the implementation',
    )
    expect(summary).toContain('\n\nSentence 3 includes enough detail')
  })

  it('truncates summaries without dropping the overflow marker', () => {
    expect(formatAgentIssueSummary('Summary text that is too long.', 18)).toBe(
      'Summary text t\n...',
    )
  })

  it('returns an empty string when there is no summary content', () => {
    expect(formatAgentIssueSummary('   \n\t  ')).toBe('')
  })
})
