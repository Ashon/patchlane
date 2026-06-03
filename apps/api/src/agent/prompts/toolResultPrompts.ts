export const defaultToolPromptContentMaxChars = 6_000

export const toToolPromptContent = (
  content: string,
  maxChars = defaultToolPromptContentMaxChars,
) => {
  if (content.length <= maxChars) {
    return content
  }

  const omittedChars = content.length - maxChars
  return `${content.slice(0, maxChars)}\n\n[truncated ${omittedChars} characters for in-loop context budget]`
}
