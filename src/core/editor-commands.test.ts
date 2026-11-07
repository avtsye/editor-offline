import { describe, expect, it } from "vitest";
import { deleteLines, duplicateLines, indentSelection, insertSmartNewline, moveLines, toggleLineComment } from "./editor-commands";

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

  it("duplicates the current line or selected lines", () => {
    expect(duplicateLines("one\ntwo\nthree", 4, 7).text).toBe("one\ntwo\ntwo\nthree");
    expect(duplicateLines("one\ntwo\n", 0, 3).text).toBe("one\none\ntwo\n");
  });

  it("deletes selected lines and leaves a valid caret", () => {
    const result = deleteLines("one\ntwo\nthree", 4, 7);
    expect(result.text).toBe("one\nthree");
    expect(result.selectionStart).toBe(4);
    expect(deleteLines("one\ntwo", 0, 3).text).toBe("two");
    expect(deleteLines("one\ntwo", 4, 7).text).toBe("one");
  });

  it("moves a selected line up and keeps its selection", () => {
    const result = moveLines("one\ntwo\nthree", 4, 7, -1);
    expect(result.text).toBe("two\none\nthree");
    expect(result.selectionStart).toBe(0);
    expect(result.selectionEnd).toBe(3);
  });

  it("preserves an existing final newline when moving lines down", () => {
    const result = moveLines("one\ntwo\nthree\n", 4, 7, 1);
    expect(result.text).toBe("one\nthree\ntwo\n");
  });

  it("does not add a final newline when moving lines in a file without one", () => {
    const result = moveLines("one\ntwo\nthree", 4, 7, 1);
    expect(result.text.endsWith("\n")).toBe(false);
  });

  it("moves a selected line down and keeps its selection", () => {
    const result = moveLines("one\ntwo\nthree", 4, 7, 1);
    expect(result.text).toBe("one\nthree\ntwo");
    expect(result.selectionStart).toBe(10);
    expect(result.selectionEnd).toBe(13);
  });
  it("adds an indented line inside an empty brace pair", () => {
    const result = insertSmartNewline("if (ready) {\n}", 12, 12);
    expect(result.text).toBe("if (ready) {\n    \n}");
    expect(result.selectionStart).toBe(17);
    expect(result.selectionEnd).toBe(17);
  });

  it("keeps a closing brace at the outer indentation when splitting before it", () => {
    const source = "function run() {\n    }";
    const caret = source.indexOf("}");
    const result = insertSmartNewline(source, caret, caret);
    expect(result.text).toBe("function run() {\n    \n        }");
    expect(result.selectionStart).toBe(30);
  });

  it("preserves indentation on ordinary Enter and indents after an opener", () => {
    expect(insertSmartNewline("    const value = 1;", 4, 4).text)
      .toBe("    \n    const value = 1;");
    expect(insertSmartNewline("    call(", 9, 9).text)
      .toBe("    call(\n        ");
  });

  it("replaces a selected range with one smart newline", () => {
    const result = insertSmartNewline("alpha beta", 5, 10);
    expect(result.text).toBe("alpha\n");
    expect(result.selectionStart).toBe(6);
  });

});