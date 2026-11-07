import { describe, expect, it } from "vitest";
import { TextBuffer } from "./text-buffer";

describe("TextBuffer", () => {
  it("starts with the supplied text and has one line", () => {
    const buffer = new TextBuffer("hello");
    expect(buffer.getText()).toBe("hello");
    expect(buffer.lineCount).toBe(1);
    expect(buffer.canUndo()).toBe(false);
  });

  it("records range edits and undoes/redoes them", () => {
    const buffer = new TextBuffer("hello world");
    buffer.replaceRange(6, 11, "editor");
    expect(buffer.getText()).toBe("hello editor");
    expect(buffer.undo()).toBe("hello world");
    expect(buffer.redo()).toBe("hello editor");
  });

  it("keeps only the changed section for replaceAll and supports multiple undos", () => {
    const buffer = new TextBuffer("one");
    buffer.replaceAll("two");
    buffer.replaceAll("three");
    expect(buffer.undo()).toBe("two");
    expect(buffer.undo()).toBe("one");
    expect(buffer.canUndo()).toBe(false);
  });

  it("clears redo history after a new edit", () => {
    const buffer = new TextBuffer("a");
    buffer.replaceAll("b");
    buffer.undo();
    buffer.replaceAll("c");
    expect(buffer.redo()).toBe("c");
    expect(buffer.canRedo()).toBe(false);
  });

  it("resets history when a file is loaded", () => {
    const buffer = new TextBuffer("old");
    buffer.replaceAll("changed");
    buffer.load("new file");
    expect(buffer.getText()).toBe("new file");
    expect(buffer.canUndo()).toBe(false);
    expect(buffer.canRedo()).toBe(false);
  });

  it("keeps history within its configured limit", () => {
    const buffer = new TextBuffer("0", 3);
    buffer.replaceAll("1");
    buffer.replaceAll("2");
    buffer.replaceAll("3");
    buffer.replaceAll("4");
    expect(buffer.undo()).toBe("3");
    expect(buffer.undo()).toBe("2");
    expect(buffer.undo()).toBe("1");
    expect(buffer.canUndo()).toBe(false);
  });

  it("indexes lines and converts offsets to positions", () => {
    const buffer = new TextBuffer("alpha\nbeta\ngamma");
    expect(buffer.lineCount).toBe(3);
    expect(buffer.getLine(2)).toBe("beta");
    expect(buffer.positionAt(8)).toEqual({ line: 2, column: 3 });
    expect(buffer.offsetAt({ line: 3, column: 2 })).toBe(12);
  });

  it("updates line positions incrementally after edits, undo and redo", () => {
    const buffer = new TextBuffer("first\nsecond\nthird");
    buffer.replaceRange(5, 6, "\ninserted\n");
    expect(buffer.lineCount).toBe(4);
    expect(buffer.getLine(2)).toBe("inserted");
    expect(buffer.getLine(3)).toBe("second");
    expect(buffer.undo()).toBe("first\nsecond\nthird");
    expect(buffer.lineCount).toBe(3);
    expect(buffer.redo()).toBe("first\ninserted\nsecond\nthird");
    expect(buffer.lineCount).toBe(4);
  });

  it("handles CRLF line endings without including CR in line text", () => {
    const buffer = new TextBuffer("one\r\ntwo\r\n");
    expect(buffer.lineCount).toBe(3);
    expect(buffer.getLine(1)).toBe("one");
    expect(buffer.getLine(2)).toBe("two");
    expect(buffer.getLine(3)).toBe("");
  });

  it("supports edits at the beginning and end of a document", () => {
    const buffer = new TextBuffer("middle");
    buffer.replaceRange(0, 0, "start ");
    buffer.replaceRange(buffer.length, buffer.length, " end");
    expect(buffer.getText()).toBe("start middle end");
    expect(buffer.undo()).toBe("start middle");
    expect(buffer.undo()).toBe("middle");
  });

  it("does not split a surrogate pair when finding a replaceAll diff", () => {
    const buffer = new TextBuffer("A😀B");
    buffer.replaceAll("A😃B");
    expect(buffer.getText()).toBe("A😃B");
    expect(buffer.undo()).toBe("A😀B");
  });

  it("clamps out-of-range edit positions", () => {
    const buffer = new TextBuffer("abc");
    buffer.replaceRange(-20, 200, "x");
    expect(buffer.getText()).toBe("x");
  });
});
