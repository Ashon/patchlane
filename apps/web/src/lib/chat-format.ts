export const splitThinking = (rawContent: string, rawReasoning = "") => {
  let content = rawContent;
  let reasoning = rawReasoning;

  while (content.includes("<think>")) {
    const openIndex = content.indexOf("<think>");
    const before = content.slice(0, openIndex);
    const afterOpen = content.slice(openIndex + "<think>".length);
    const closeIndex = afterOpen.indexOf("</think>");

    if (closeIndex < 0) {
      reasoning = joinReasoning(reasoning, afterOpen);
      content = before;
      break;
    }

    reasoning = joinReasoning(reasoning, afterOpen.slice(0, closeIndex));
    content = `${before}${afterOpen.slice(closeIndex + "</think>".length)}`;
  }

  return {
    content: content.trimStart(),
    reasoning: reasoning.trim()
  };
};

const joinReasoning = (current: string, next: string) => {
  if (!next.trim()) {
    return current;
  }

  return current ? `${current}${next}` : next;
};
