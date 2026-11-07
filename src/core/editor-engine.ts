import { TextBuffer } from "./text-buffer";

export type EditorSelection = { anchor: number; head: number };
export type EditorEdit = { from: number; to: number; insert: string };

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, Math.floor(value)));
const ordered = (selection: EditorSelection) => ({
  from: Math.min(selection.anchor, selection.head),
  to: Math.max(selection.anchor, selection.head),
});

export class EditorEngine {
  readonly buffer: TextBuffer;
  private selections: EditorSelection[] = [{ anchor: 0, head: 0 }];

  constructor(value = "") {
    this.buffer = new TextBuffer(value);
  }

  getText(): string {
    return this.buffer.getText();
  }

  getSelections(): EditorSelection[] {
    return this.selections.map(selection => ({ ...selection }));
  }

  setSelections(next: EditorSelection[]): void {
    const length = this.buffer.length;
    const normalized = next
      .map(selection => ({ anchor: clamp(selection.anchor, length), head: clamp(selection.head, length) }))
      .sort((a, b) => Math.min(a.anchor, a.head) - Math.min(b.anchor, b.head));
    const merged: EditorSelection[] = [];
    for (const selection of normalized) {
      const range = ordered(selection);
      const previous = merged[merged.length - 1];
      if (!previous) {
        merged.push(selection);
        continue;
      }
      const previousRange = ordered(previous);
      if (range.from <= previousRange.to) {
        const from = Math.min(range.from, previousRange.from);
        const to = Math.max(range.to, previousRange.to);
        merged[merged.length - 1] = { anchor: from, head: to };
      } else {
        merged.push(selection);
      }
    }
    this.selections = merged.length ? merged : [{ anchor: 0, head: 0 }];
  }

  setPrimarySelection(anchor: number, head = anchor): void {
    this.setSelections([{ anchor, head }]);
  }

  addCursor(offset: number): void {
    this.setSelections([...this.selections, { anchor: offset, head: offset }]);
  }

  addCursorVertical(direction: -1 | 1): void {
    const text = this.getText();
    const primary = this.selections[this.selections.length - 1];
    const lineStart = text.lastIndexOf("\n", primary.head - 1) + 1;
    const lineEndIndex = text.indexOf("\n", primary.head);
    const lineEnd = lineEndIndex < 0 ? text.length : lineEndIndex;
    const column = primary.head - lineStart;
    if (direction < 0) {
      if (lineStart === 0) return;
      const previousEnd = lineStart - 1;
      const previousStart = text.lastIndexOf("\n", previousEnd - 1) + 1;
      this.addCursor(Math.min(previousStart + column, previousEnd));
    } else {
      if (lineEnd === text.length) return;
      const nextStart = lineEnd + 1;
      const nextEndIndex = text.indexOf("\n", nextStart);
      const nextEnd = nextEndIndex < 0 ? text.length : nextEndIndex;
      this.addCursor(Math.min(nextStart + column, nextEnd));
    }
  }

  insertText(value: string): string {
    return this.applyEdits(this.selections.map(selection => {
      const range = ordered(selection);
      return { from: range.from, to: range.to, insert: value };
    }));
  }

  applyEdits(edits: EditorEdit[]): string {
    const sorted = [...edits]
      .map(edit => ({ from: clamp(edit.from, this.buffer.length), to: clamp(edit.to, this.buffer.length), insert: edit.insert }))
      .map(edit => ({ ...edit, from: Math.min(edit.from, edit.to), to: Math.max(edit.from, edit.to) }))
      .sort((a, b) => b.from - a.from || b.to - a.to);
    let nextSelections: EditorSelection[] = [];
    let previousFrom = Number.POSITIVE_INFINITY;
    for (const edit of sorted) {
      if (edit.to > previousFrom) continue;
      this.buffer.replaceRange(edit.from, edit.to, edit.insert);
      nextSelections.push({ anchor: edit.from + edit.insert.length, head: edit.from + edit.insert.length });
      previousFrom = edit.from;
    }
    nextSelections.reverse();
    this.setSelections(nextSelections);
    return this.getText();
  }

  backspace(): string {
    const text = this.getText();
    const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'" };
    return this.applyEdits(this.selections.map(selection => {
      const range = ordered(selection);
      if (range.from !== range.to) return { ...range, insert: "" };
      if (range.from === 0) return { from: 0, to: 0, insert: "" };
      const before = text[range.from - 1];
      const after = text[range.from];
      if (pairs[before] === after) return { from: range.from - 1, to: range.from + 1, insert: "" };
      return { from: range.from - 1, to: range.from, insert: "" };
    }));
  }

  selectNextOccurrence(): boolean {
    const text = this.getText();
    const primary = ordered(this.selections[this.selections.length - 1]);
    if (primary.from === primary.to) return false;
    const needle = text.slice(primary.from, primary.to);
    const start = this.selections.some(selection => ordered(selection).from !== primary.from)
      ? primary.to
      : primary.to;
    const found = text.indexOf(needle, start);
    if (found < 0) return false;
    this.addSelection(found, found + needle.length);
    return true;
  }

  private addSelection(anchor: number, head: number): void {
    this.setSelections([...this.selections, { anchor, head }]);
  }

  undo(): string {
    const result = this.buffer.undo();
    this.setPrimarySelection(Math.min(this.selections[0]?.head ?? 0, result.length));
    return result;
  }

  redo(): string {
    const result = this.buffer.redo();
    this.setPrimarySelection(Math.min(this.selections[0]?.head ?? 0, result.length));
    return result;
  }
}
