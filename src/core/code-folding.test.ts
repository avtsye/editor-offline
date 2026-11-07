import { describe, expect, it } from "vitest";
import { findFoldRanges, foldKey, getFoldedLineSet } from "./code-folding";

describe("code folding ranges", () => {
  it("finds nested brace blocks and ignores braces in strings and comments", () => {
    const source = [
      "function run() {",
      "  const text = \"} not a block\";",
      "  /* { ignored } */",
      "  if (ready) {",
      "    work();",
      "  }",
      "}",
    ].join("\n");
    const ranges = findFoldRanges(source, "typescript");
    expect(ranges.map(({ startLine, endLine }) => [startLine, endLine])).toEqual([[1, 7], [4, 6]]);
  });

  it("finds paired HTML elements", () => {
    const ranges = findFoldRanges("<main>\n  <p>Text</p>\n</main>", "html");
    expect(ranges).toContainEqual({ startLine: 1, endLine: 3, kind: "html", label: "main" });
  });

  it("finds Python indentation blocks", () => {
    const ranges = findFoldRanges("def run():\n    first()\n    second()\nnext()", "python");
    expect(ranges).toContainEqual({ startLine: 1, endLine: 3, kind: "indent", label: "…" });
  });

  it("returns the hidden lines for collapsed ranges", () => {
    const ranges = findFoldRanges("{\n  one();\n  two();\n}", "javascript");
    expect(getFoldedLineSet(ranges, new Set([foldKey(ranges[0])]))).toEqual(new Set([2, 3, 4]));
  });
});
