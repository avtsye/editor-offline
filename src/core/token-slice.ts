import type { SyntaxToken } from "./tokenizer";

/** Return the token fragments overlapping a UTF-16 source range. */
export function sliceTokens(
  tokens: readonly SyntaxToken[],
  startOffset: number,
  endOffset: number,
): SyntaxToken[] {
  const start = Math.max(0, Math.floor(startOffset));
  const end = Math.max(start, Math.floor(endOffset));
  const result: SyntaxToken[] = [];
  let offset = 0;

  for (const token of tokens) {
    const tokenStart = offset;
    const tokenEnd = tokenStart + token.value.length;
    offset = tokenEnd;

    if (tokenEnd <= start) continue;
    if (tokenStart >= end) break;

    const from = Math.max(0, start - tokenStart);
    const to = Math.min(token.value.length, end - tokenStart);
    const value = token.value.slice(from, to);
    if (!value) continue;

    const previous = result[result.length - 1];
    if (previous?.kind === token.kind) previous.value += value;
    else result.push({ kind: token.kind, value });
  }

  return result;
}
