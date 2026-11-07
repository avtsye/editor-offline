import { describe, expect, it } from "vitest";
import { tokenize } from "./tokenizer";

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
