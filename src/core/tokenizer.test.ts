import { describe, expect, it } from "vitest";
import { tokenize } from "./tokenizer";
import { findMatchingBrackets } from "./bracket-matching";
import { findDelimiterDiagnostics } from "./syntax-diagnostics";

describe("tokenize", () => {
  it("recognizes JavaScript keywords, calls, strings and comments", () => {
    const tokens = tokenize('const title = "hello"; // note\nprint(title)', "javascript");
    expect(tokens.some(token => token.kind === "keyword" && token.value === "const")).toBe(true);
    expect(tokens.some(token => token.kind === "string" && token.value === '"hello"')).toBe(true);
    expect(tokens.some(token => token.kind === "comment" && token.value === "// note")).toBe(true);
    expect(tokens.some(token => token.kind === "function" && token.value === "print")).toBe(true);
  });

  it("recognizes Python comments and triple-quoted strings", () => {
    const tokens = tokenize('def greet():\n    """hello"""\n    # note', "python");
    expect(tokens.some(token => token.kind === "keyword" && token.value === "def")).toBe(true);
    expect(tokens.some(token => token.kind === "string" && token.value === '"""hello"""')).toBe(true);
    expect(tokens.some(token => token.kind === "comment" && token.value === "# note")).toBe(true);
  });

  it("recognizes JSON literals and numbers", () => {
    const tokens = tokenize('{"enabled": true, "count": 42}', "json");
    expect(tokens.some(token => token.kind === "literal" && token.value === "true")).toBe(true);
    expect(tokens.some(token => token.kind === "number" && token.value === "42")).toBe(true);
  });

  it("recognizes HTML tags, attributes and attribute strings", () => {
    const tokens = tokenize('<button class="primary">Go</button>', "html");
    expect(tokens.some(token => token.kind === "tag" && token.value === "button")).toBe(true);
    expect(tokens.some(token => token.kind === "attribute" && token.value === "class")).toBe(true);
    expect(tokens.some(token => token.kind === "string" && token.value === '"primary"')).toBe(true);
  });

  it("preserves every source character and line break", () => {
    const source = "fn main() {\n  let value = 12;\n}\n";
    const tokens = tokenize(source, "rust");
    expect(tokens.map(token => token.value).join("")).toBe(source);
  });

  it("returns no tokens for an empty source", () => {
    expect(tokenize("", "javascript")).toEqual([]);
  });
});

describe("bracket matching", () => {
  it("matches nested brackets in both directions", () => {
    const source = "call([value, { enabled: true }])";
    const tokens = tokenize(source, "typescript");
    const outerOpen = source.indexOf("(");
    const outerClose = source.lastIndexOf(")");
    const innerOpen = source.indexOf("{");
    const innerClose = source.indexOf("}");
    expect(findMatchingBrackets(tokens, outerOpen)).toEqual([outerOpen, outerClose]);
    expect(findMatchingBrackets(tokens, innerClose + 1)).toEqual([innerOpen, innerClose]);
  });

  it("ignores bracket characters inside strings and comments", () => {
    const source = 'const text = "not a }"; // nor a ]\nrun({ value: 1 });';
    const tokens = tokenize(source, "typescript");
    const open = source.lastIndexOf("{");
    const close = source.indexOf("}", open);
    expect(findMatchingBrackets(tokens, open)).toEqual([open, close]);
    expect(findMatchingBrackets(tokens, source.indexOf("}") + 1)).toBeNull();
  });

  it("returns null for unmatched or non-bracket positions", () => {
    const tokens = tokenize("const value = (1;", "typescript");
    expect(findMatchingBrackets(tokens, 14)).toBeNull();
    expect(findMatchingBrackets(tokens, 0)).toBeNull();
  });
});

describe("syntax delimiter diagnostics", () => {
  const diagnose = (source: string, language = "typescript") =>
    findDelimiterDiagnostics(source, tokenize(source, language), language);

  it("reports unmatched closing and unclosed opening delimiters with positions", () => {
    const diagnostics = diagnose("run(]\nnext{");
    expect(diagnostics.map(item => [item.offset, item.line, item.column])).toEqual([
      [3, 1, 4],
      [4, 1, 5],
      [10, 2, 5],
    ]);
    expect(diagnostics.map(item => item.severity)).toEqual(["error", "error"]);
  });

  it("ignores delimiter characters in strings and comments", () => {
    const source = 'const text = "not a }"; // nor a ]\\nrun({ value: 1 });';
    expect(diagnose(source)).toEqual([]);
  });

  it("does not lint prose-oriented files", () => {
    expect(diagnose("This text has (an unmatched bracket", "markdown")).toEqual([]);
  });

  it("reports an inner mismatched opener while preserving a matching outer pair", () => {
    const diagnostics = diagnose("({])");
    expect(diagnostics.map(item => item.offset)).toEqual([1, 2]);
  });
});
