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
    content: removeToolTranscripts(content).trimStart(),
    reasoning: removeToolTranscripts(reasoning).trim()
  };
};

const joinReasoning = (current: string, next: string) => {
  if (!next.trim()) {
    return current;
  }

  return current ? `${current}${next}` : next;
};

const toolTranscriptMarkerPattern = /^[^\S\r\n]*\[tool:[^\]\n]+\][^\S\r\n]*$/gimu;

const removeToolTranscripts = (value: string) => {
  let output = "";
  let cursor = 0;

  for (const match of value.matchAll(toolTranscriptMarkerPattern)) {
    const markerStart = match.index ?? 0;
    const markerEnd = markerStart + match[0].length;

    output += value.slice(cursor, markerStart);

    const jsonStart = skipWhitespace(value, markerEnd);
    const jsonEnd = findJsonValueEnd(value, jsonStart);

    if (jsonEnd > jsonStart) {
      cursor = skipWhitespace(value, jsonEnd);
      continue;
    }

    cursor = markerEnd;
  }

  output += value.slice(cursor);
  return output;
};

const skipWhitespace = (value: string, start: number) => {
  let index = start;

  while (index < value.length && /\s/u.test(value[index] ?? "")) {
    index += 1;
  }

  return index;
};

const findJsonValueEnd = (value: string, start: number) => {
  const first = value[start];

  if (first === "{" || first === "[") {
    return findJsonContainerEnd(value, start, first === "{" ? "}" : "]");
  }

  if (first === "\"") {
    return findJsonStringEnd(value, start);
  }

  return start;
};

const findJsonContainerEnd = (value: string, start: number, closingCharacter: "}" | "]") => {
  const stack: string[] = [closingCharacter];
  let inString = false;
  let escaped = false;

  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = true;
        continue;
      }

      if (character === "\"") {
        inString = false;
      }

      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === "{") {
      stack.push("}");
      continue;
    }

    if (character === "[") {
      stack.push("]");
      continue;
    }

    if (character === "}" || character === "]") {
      if (character !== stack.pop()) {
        return start;
      }

      if (stack.length === 0) {
        return index + 1;
      }
    }
  }

  return start;
};

const findJsonStringEnd = (value: string, start: number) => {
  let escaped = false;

  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === "\"") {
      return index + 1;
    }
  }

  return start;
};
