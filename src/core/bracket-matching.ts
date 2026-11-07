import type { SyntaxToken } from "./tokenizer";

const OPEN_TO_CLOSE: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSE_TO_OPEN: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

/**
 * Returns the source offsets of the bracket under (or immediately before) the
 * caret and its partner. Only punctuation tokens are considered, so brackets
 * inside strings and comments are ignored.
 */
export function findMatchingBrackets(
  tokens: readonly SyntaxToken[],
  caretOffset: number,
): [number, number] | null {
  const brackets: { char: string; offset: number }[] = [];
  let offset = 0;

  for (const token of tokens) {
    if (token.kind === "punctuation") {
      for (let index = 0; index < token.value.length; index += 1) {
        const char = token.value[index];
        if (OPEN_TO_CLOSE[char] || CLOSE_TO_OPEN[char]) {
          brackets.push({ char, offset: offset + index });
        }
      }
    }
    offset += token.value.length;
  }

  const caret = Math.max(0, Math.min(caretOffset, offset));
  const candidate = brackets.find(item => item.offset === caret)
    ?? [...brackets].reverse().find(item => item.offset === caret - 1);
  if (!candidate) return null;

  const candidateIndex = brackets.findIndex(item => item.offset === candidate.offset);
  const stack: number[] = [];

  if (OPEN_TO_CLOSE[candidate.char]) {
    for (let index = candidateIndex; index < brackets.length; index += 1) {
      const item = brackets[index];
      if (OPEN_TO_CLOSE[item.char]) {
        stack.push(index);
        continue;
      }
      const openerIndex = stack[stack.length - 1];
      if (openerIndex === undefined) continue;
      if (OPEN_TO_CLOSE[brackets[openerIndex].char] === item.char) {
        stack.pop();
        if (openerIndex === candidateIndex) return [candidate.offset, item.offset];
      }
    }
    return null;
  }

  for (let index = candidateIndex; index >= 0; index -= 1) {
    const item = brackets[index];
    if (CLOSE_TO_OPEN[item.char]) {
      stack.push(index);
      continue;
    }
    const closerIndex = stack[stack.length - 1];
    if (closerIndex === undefined) continue;
    if (CLOSE_TO_OPEN[brackets[closerIndex].char] === item.char) {
      stack.pop();
      if (closerIndex === candidateIndex) return [item.offset, candidate.offset];
    }
  }
  return null;
}
