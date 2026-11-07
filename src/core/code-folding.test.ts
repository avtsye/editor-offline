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


describe("FoldModel source/display mapping", () => {
  it("maps hidden source lines to their visible fold row", async () => {
    const { FoldModel } = await import("./code-folding");
    const model = new FoldModel("function f() {\n a();\n b();\n}\nend();", "javascript");
    model.toggle(model.getRanges()[0]);
    expect(model.isLineHidden(2)).toBe(true);
    expect(model.visibleRowForSourceLine(3)).toBe(0);
    expect(model.sourceLineForVisibleRow(1)).toBe(5);
  });

  it("keeps nested folds when an outer fold is expanded", async () => {
    const { FoldModel } = await import("./code-folding");
    const model = new FoldModel("outer {\n inner {\n  run();\n }\n}\nafter();", "javascript");
    const [outer, inner] = model.getRanges();
    model.toggle(inner);
    model.toggle(outer);
    expect(model.getVisibleLineCount()).toBe(2);
    model.toggle(outer);
    expect(model.getVisibleLineCount()).toBe(4);
    expect(model.isLineHidden(3)).toBe(true);
  });

  it("drops stale folds when a document is replaced", async () => {
    const { FoldModel } = await import("./code-folding");
    const model = new FoldModel("if (ok) {\n work();\n}", "javascript");
    model.collapseAll();
    model.updateDocument("plain();", "javascript");
    expect(model.getRanges()).toEqual([]);
    expect(model.getVisibleLineCount()).toBe(1);
  });
});


describe("fold parser resilience", () => {
  it("does not lose an open brace after a mismatched closer", () => {
    const ranges = findFoldRanges("function f() {\n  value[0);\n  run();\n}", "javascript");
    expect(ranges).toContainEqual({ startLine: 1, endLine: 4, kind: "block", label: "}" });
  });

  it("ignores braces inside template literals", () => {
    const ranges = findFoldRanges("function f() {\n  const value = `}`;\n  run();\n}", "javascript");
    expect(ranges.map(({ startLine, endLine }) => [startLine, endLine])).toEqual([[1, 4]]);
  });

  it("tracks folds that begin on the same line independently", async () => {
    const { FoldModel } = await import("./code-folding");
    const model = new FoldModel("function f() { if (ok) {\n  run();\n }\n}", "javascript");
    const [outer, inner] = model.getRanges();
    expect(outer.startLine).toBe(inner.startLine);
    model.toggle(inner);
    expect(model.isCollapsed(inner)).toBe(true);
    expect(model.isCollapsed(outer)).toBe(false);
    expect(model.getProjection()).toEqual([
      { line: 1, hiddenLineCount: 2, placeholder: "… 2 lines" },
      { line: 4, hiddenLineCount: 0, placeholder: null },
    ]);
  });
});


describe("explicit code regions", () => {
  it("finds nested C-style and hash-style regions", () => {
    const source = [
      "// region outer",
      "const first = 1;",
      "// region inner",
      "const second = 2;",
      "// endregion",
      "// endregion",
    ].join("\n");
    const ranges = findFoldRanges(source, "typescript");
    expect(ranges.filter(range => range.kind === "region").map(range => [range.startLine, range.endLine, range.label]))
      .toEqual([[1, 6, "outer"], [3, 5, "inner"]]);
  });

  it("supports Python region markers without confusing indentation blocks", () => {
    const source = "# region setup\nvalue = 1\n# endregion\n";
    expect(findFoldRanges(source, "python")).toContainEqual({
      startLine: 1, endLine: 3, kind: "region", label: "setup",
    });
  });
});


describe("Markdown and YAML folding", () => {
  it("folds Markdown headings to the line before the next peer heading", () => {
    const source = [
      "# Guide",
      "Intro",
      "## Install",
      "Steps",
      "### Windows",
      "Details",
      "## Usage",
      "End",
    ].join("\n");
    const ranges = findFoldRanges(source, "markdown");
    expect(ranges.filter(range => range.kind === "region").map(range => [range.startLine, range.endLine, range.label]))
      .toEqual([[1, 8, "Guide"], [3, 6, "Install"], [5, 6, "Windows"]]);
  });

  it("folds fenced Markdown code blocks and ignores headings inside them", () => {
    const source = ["# Notes", "```ts", "# not a heading", "const x = 1;", "```", "After"].join("\n");
    const ranges = findFoldRanges(source, "md");
    expect(ranges).toContainEqual({ startLine: 2, endLine: 5, kind: "block", label: "code" });
    expect(ranges.filter(range => range.kind === "region").map(range => [range.startLine, range.endLine]))
      .toEqual([[1, 6]]);
  });

  it("folds nested YAML indentation blocks", () => {
    const source = ["app:", "  server:", "    port: 8080", "  enabled: true", "other: value"].join("\n");
    const ranges = findFoldRanges(source, "yaml");
    expect(ranges).toContainEqual({ startLine: 1, endLine: 4, kind: "indent", label: "…" });
    expect(ranges).toContainEqual({ startLine: 2, endLine: 3, kind: "indent", label: "…" });
  });
});
