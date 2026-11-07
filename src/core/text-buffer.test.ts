import { describe, expect, it } from "vitest";
import { TextBuffer } from "./text-buffer";

describe("TextBuffer", () => {
  it("starts with the supplied text", () => {
    const buffer = new TextBuffer("hello");
    expect(buffer.getText()).toBe("hello");
    expect(buffer.canUndo()).toBe(false);
  });

  it("records replacements and undoes them", () => {
    const buffer = new TextBuffer("one");
    buffer.replaceAll("two");
    buffer.replaceAll("three");
    expect(buffer.undo()).toBe("two");
    expect(buffer.undo()).toBe("one");
    expect(buffer.canUndo()).toBe(false);
  });

  it("redoes an undone replacement", () => {
    const buffer = new TextBuffer("before");
    buffer.replaceAll("after");
    buffer.undo();
    expect(buffer.redo()).toBe("after");
    expect(buffer.canRedo()).toBe(false);
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
    expect(buffer.canUndo()).toBe(false);
  });
});
