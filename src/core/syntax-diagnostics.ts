import type { SyntaxToken } from "./tokenizer";

export type SyntaxDiagnostic = {
  severity: "error";
  message: string;
  offset: number;
  line: number;
  column: number;
};

const OPEN_TO_CLOSE: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSE_TO_OPEN: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
const SUPPORTED_LANGUAGES = new Set([
  "js", "jsx", "ts", "tsx", "javascript", "typescript", "py", "python",
  "rs", "rust", "json", "css", "c", "cpp", "cs", "csharp", "java",
  "go", "dart", "sql", "php",
]);

/** Lightweight delimiter diagnostics, deliberately limited to languages where
 * these delimiters are structural rather than ordinary prose punctuation. */
export function findDelimiterDiagnostics(
  source: string,
  tokens: readonly SyntaxToken[],
  languageId: string,
): SyntaxDiagnostic[] {
  if (!SUPPORTED_LANGUAGES.has(languageId.toLowerCase())) return [];

  const stack: { char: string; offset: number }[] = [];
  const diagnostics: SyntaxDiagnostic[] = [];
  let offset = 0;

  const report = (message: string, at: number) => {
    const lineStart = source.lastIndexOf("\n", at - 1) + 1;
    diagnostics.push({
      severity: "error",
      message,
      offset: at,
      line: source.slice(0, at).split("\n").length,
      column: at - lineStart + 1,
    });
  };

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
        if (matching < 0) {
          report(`סוגר סוגר '${char}' ללא סוגר פותח תואם`, at);
          continue;
        }
        for (let unmatched = stack.length - 1; unmatched > matching; unmatched -= 1) {
          const item = stack[unmatched];
          report(`חסר סוגר סוגר עבור '${item.char}'`, item.offset);
        }
        stack.length = matching;
      }
    }
    offset += token.value.length;
  }

  for (const item of stack) {
    report(`חסר סוגר סוגר עבור '${item.char}'`, item.offset);
  }

  return diagnostics.sort((a, b) => a.offset - b.offset);
}
