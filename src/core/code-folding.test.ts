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


describe("FoldModel", () => {
  it("projects folded blocks without changing source text or offsets", async () => {
    const { FoldModel } = await import("./code-folding");
    const source = "function run() {\n  first();\n  second();\n}\nafter();";
    const model = new FoldModel(source, "javascript");
    const range = model.getRanges()[0];
    expect(model.toggle(range)).toBe(true);
    expect(model.getProjection()).toEqual([
      { line: 1, hiddenLineCount: 3, placeholder: "… 3 lines" },
      { line: 5, hiddenLineCount: 0, placeholder: null },
    ]);
    expect(model.getVisibleLineCount()).toBe(2);
    expect(model.sourceOffsetAtLine(5)).toBe(source.indexOf("after"));
    expect(model.lineAtSourceOffset(source.indexOf("second"))).toBe(3);
  });
  it("reveals hidden lines on navigation", async () => {
    const { FoldModel } = await import("./code-folding");
    const model = new FoldModel("if (ok) {\n  nested();\n}\nnext();", "javascript");
    model.collapseAll();
    expect(model.getVisibleLineCount()).toBe(2);
    model.revealLine(2);
    expect(model.getVisibleLineCount()).toBe(4);
  });
  it("supports collapse all and expand all", async () => {
    const { FoldModel } = await import("./code-folding");
    const model = new FoldModel("a {\n b {\n  c();\n }\n}", "javascript");
    model.collapseAll();
    expect(model.getVisibleLineCount()).toBe(1);
    model.expandAll();
    expect(model.getVisibleLineCount()).toBe(5);
  });
});
