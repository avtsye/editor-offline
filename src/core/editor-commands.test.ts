import { describe, expect, it } from "vitest";
import { indentSelection, moveLines, toggleLineComment } from "./editor-commands";

describe("editor commands", () => {
  it("indents every selected line and preserves the selection", () => {
    const result = indentSelection("one\ntwo\nthree", 1, 7);
    expect(result.text).toBe("    one\n    two\nthree");
    expect(result.selectionStart).toBe(0);
    expect(result.selectionEnd).toBe(15);
  });

  it("outdents mixed indentation without deleting non-indent text", () => {
    const result = indentSelection("    one\n\ttwo\nthree", 0, 14, "    ", true);
    expect(result.text).toBe("one\ntwo\nthree");
  });

  it("comments selected lines and toggles them back", () => {
    const commented = toggleLineComment("const a = 1;\n  const b = 2;", 0, 25, "//");
    expect(commented.text).toBe("// const a = 1;\n  // const b = 2;");
    const uncommented = toggleLineComment(commented.text, 0, commented.text.length, "//");
    expect(uncommented.text).toBe("const a = 1;\n  const b = 2;");
  });

  it("does not add comment markers to blank lines", () => {
    expect(toggleLineComment("one\n\ntwo", 0, 7, "#").text).toBe("# one\n\n# two");
  });

  it("moves a selected line up and keeps its selection", () => {
    const result = moveLines("one\ntwo\nthree", 4, 7, -1);
    expect(result.text).toBe("two\none\nthree");
    expect(result.selectionStart).toBe(0);
    expect(result.selectionEnd).toBe(3);
  });

  it("preserves an existing final newline when moving lines down", () => {
    const result = moveLines("one\\ntwo\\nthree\\n", 4, 7, 1);
    expect(result.text).toBe("one\\nthree\\ntwo\\n");
  });

  it("does not add a final newline when moving the last line upward", () => {
    const result = moveLines("one\\ntwo\\nthree", 4, 7, 1);
    expect(result.text.endsWith("\\n")).toBe(false);
  });

  it("moves a selected line down and keeps its selection", () => {
    const result = moveLines("one\ntwo\nthree", 4, 7, 1);
    expect(result.text).toBe("one\nthree\ntwo");
    expect(result.selectionStart).toBe(10);
    expect(result.selectionEnd).toBe(13);
  });
});
