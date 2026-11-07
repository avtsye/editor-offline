import type { SyntaxToken } from "./tokenizer";

const OPEN_TO_CLOSE: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSE_TO_OPEN: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

/** Build a reusable source-offset lookup once per tokenized document. */
export function buildBracketPairMap(tokens: readonly SyntaxToken[]): Map<number, number> {
  const pairs = new Map<number, number>();
  const stack: { char: string; offset: number }[] = [];
  let offset = 0;

  for (const token of tokens) {
    if (token.kind === "punctuation") {
      for (let index = 0; index < token.value.length; index += 1) {
        const char = token.value[index];
        const at = offset + index;
        if (OPEN_TO_CLOSE[char]) {
          stack.push({ char, offset: at });
          continue;
        }
        if (!CLOSE_TO_OPEN[char]) continue;

        let matching = stack.length - 1;
        while (matching >= 0 && stack[matching].char !== CLOSE_TO_OPEN[char]) matching -= 1;
        if (matching < 0) continue;

        const opener = stack[matching];
        pairs.set(opener.offset, at);
        pairs.set(at, opener.offset);
        // Discard the matched opener and any malformed nested openers above it.
        stack.length = matching;
      }
    }
    offset += token.value.length;
  }
  return pairs;
}

/** Find the pair at the caret or immediately before it. */
export function findMatchingBrackets(
  tokens: readonly SyntaxToken[],
  caretOffset: number,
): [number, number] | null {
  const pairs = buildBracketPairMap(tokens);
  const caret = Math.max(0, Math.floor(caretOffset));
  const sourceOffset = pairs.has(caret) ? caret : caret - 1;
  const partner = pairs.get(sourceOffset);
  return partner === undefined ? null : [sourceOffset, partner];
}
