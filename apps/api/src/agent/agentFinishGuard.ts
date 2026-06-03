const incompleteSummaryPatterns = [
  /\bbefore I could\b/iu,
  /\bsession (?:was )?terminated\b/iu,
  /\bI was planning\b/iu,
  /\bproposed solution\b/iu,
  /\bto proceed\b/iu,
  /\bwould need\b/iu,
  /\bnot implemented\b/iu,
  /\bcould not implement\b/iu,
  /\bunable to implement\b/iu,
]

const noChangeAllowedPatterns = [
  /\bno (?:file|code) changes? (?:were )?needed\b/iu,
  /\bno changes? needed\b/iu,
  /\balready satisfied\b/iu,
  /\balready implemented\b/iu,
  /\binvestigation only\b/iu,
  /\banalysis only\b/iu,
]

export const getFinishRejection = ({
  gitStatusShort,
  issueRun,
  summary,
}: {
  gitStatusShort?: string
  issueRun: boolean
  summary: string
}) => {
  if (!issueRun) {
    return undefined
  }

  if (incompleteSummaryPatterns.some((pattern) => pattern.test(summary))) {
    return [
      'finish rejected: the summary describes incomplete, planned, or interrupted work.',
      'Continue with a concrete implementation, focused verification, and a final summary only after the issue is actually complete.',
    ].join(' ')
  }

  if (
    typeof gitStatusShort === 'string' &&
    gitStatusShort.trim().length === 0 &&
    !noChangeAllowedPatterns.some((pattern) => pattern.test(summary))
  ) {
    return [
      'finish rejected: this issue run has no workspace changes.',
      'If no file change is required, explicitly say why no changes were needed. Otherwise implement the requested change before finishing.',
    ].join(' ')
  }

  return undefined
}
