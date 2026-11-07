import { describe, expect, it } from "vitest";
import { EditorEngine } from "./editor-engine";

describe("EditorEngine", () => {
  it("inserts at multiple cursors from right to left", () => {
    const editor = new EditorEngine("one\ntwo\nthree");
    editor.setSelections([{ anchor: 0, head: 0 }, { anchor: 4, head: 4 }, { anchor: 8, head: 8 }]);
    expect(editor.insertText("> ")).toBe("> one\n> two\n> three");
    expect(editor.getSelections()).toEqual([
      { anchor: 2, head: 2 }, { anchor: 8, head: 8 }, { anchor: 14, head: 14 },
    ]);
  });

  it("normalizes duplicate and overlapping selections", () => {
    const editor = new EditorEngine("abcdefghij");
    editor.setSelections([{ anchor: 1, head: 4 }, { anchor: 3, head: 6 }, { anchor: 8, head: 8 }]);
    expect(editor.getSelections()).toEqual([{ anchor: 1, head: 6 }, { anchor: 8, head: 8 }]);
  });

  it("adds a cursor on the adjacent line while preserving its column", () => {
    const editor = new EditorEngine("abcd\nxy\n123456");
    editor.setPrimarySelection(3);
    editor.addCursorVertical(1);
    expect(editor.getSelections()).toEqual([{ anchor: 3, head: 3 }, { anchor: 7, head: 7 }]);
  });

  it("selects the next exact occurrence", () => {
    const editor = new EditorEngine("name = name");
    editor.setPrimarySelection(0, 4);
    expect(editor.selectNextOccurrence()).toBe(true);
    expect(editor.getSelections()).toEqual([{ anchor: 0, head: 4 }, { anchor: 7, head: 11 }]);
  });

  it("deletes matching bracket pairs at every cursor", () => {
    const editor = new EditorEngine("()\n[]");
    editor.setSelections([{ anchor: 1, head: 1 }, { anchor: 4, head: 4 }]);
    expect(editor.backspace()).toBe("\n");
  });

  it("supports undo and redo for multi-cursor insertion", () => {
    const editor = new EditorEngine("ab cd");
    editor.setSelections([{ anchor: 0, head: 0 }, { anchor: 3, head: 3 }]);
    editor.insertText("_");
    expect(editor.getText()).toBe("_ab _cd");
    expect(editor.getSelections()).toEqual([{ anchor: 1, head: 1 }, { anchor: 5, head: 5 }]);
    expect(editor.undo()).toBe("ab cd");
    expect(editor.getSelections()).toEqual([{ anchor: 0, head: 0 }, { anchor: 3, head: 3 }]);
    expect(editor.redo()).toBe("_ab _cd");
    expect(editor.getSelections()).toEqual([{ anchor: 1, head: 1 }, { anchor: 5, head: 5 }]);
  });
});
