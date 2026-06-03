import { describe, expect, it } from '@jest/globals'
import { toToolPromptContent } from './toolResultPrompts'

describe('Given tool result prompt content', () => {
  it('when the content fits the budget, then it is preserved exactly', () => {
    const content = 'short tool result'

    expect(toToolPromptContent(content, 100)).toBe(content)
  })

  it('when the content exceeds the budget, then it is truncated with the omitted size', () => {
    const content = 'abcdefghij'

    expect(toToolPromptContent(content, 4)).toBe(
      'abcd\n\n[truncated 6 characters for in-loop context budget]',
    )
  })
})
