import { describe, expect, it } from "vitest";
import { tokenize } from "./tokenizer";
import { sliceTokens } from "./token-slice";

describe("sliceTokens", () => {
  it("preserves the exact source text for a partial token range", () => {
    const source = 'const title = "hello";\nreturn title;';
    const tokens = tokenize(source, "javascript");
    const start = 4;
    const end = 24;
    expect(sliceTokens(tokens, start, end).map(token => token.value).join(""))
      .toBe(source.slice(start, end));
  });

  it("keeps token kinds when a range starts or ends inside a token", () => {
    const tokens = tokenize("const value = 123;", "javascript");
    const sliced = sliceTokens(tokens, 1, 5);
    expect(sliced).toEqual([{ kind: "keyword", value: "onst" }]);
  });

  it("returns an empty list for an empty or out-of-range selection", () => {
    const tokens = tokenize("let value = 1;", "javascript");
    expect(sliceTokens(tokens, 3, 3)).toEqual([]);
    expect(sliceTokens(tokens, 100, 120)).toEqual([]);
  });

  it("handles UTF-16 offsets and Unicode text", () => {
    const source = 'const label = "שלום";';
    const tokens = tokenize(source, "javascript");
    const start = source.indexOf("שלום");
    const end = start + "שלום".length;
    expect(sliceTokens(tokens, start, end).map(token => token.value).join(""))
      .toBe("שלום");
  });
});
