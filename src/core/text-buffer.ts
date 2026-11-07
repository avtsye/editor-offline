export type TextPosition = {
  /** 1-based line number. */
  line: number;
  /** 1-based UTF-16 column, matching textarea selection offsets. */
  column: number;
};

type EditTransaction = {
  start: number;
  deleted: string;
  inserted: string;
};

const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;
const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

export class TextBuffer {
  private value: string;
  private undoStack: EditTransaction[] = [];
  private redoStack: EditTransaction[] = [];
  private readonly historyLimit: number;
  private lineStarts: number[] = [0];

  constructor(initialValue = "", historyLimit = 500) {
    this.value = initialValue;
    this.historyLimit = Math.max(2, historyLimit);
    this.rebuildLineIndex();
  }

  getText(): string {
    return this.value;
  }

  get length(): number {
    return this.value.length;
  }

  get lineCount(): number {
    return this.lineStarts.length;
  }

  load(value: string): void {
    this.value = value;
    this.undoStack = [];
    this.redoStack = [];
    this.rebuildLineIndex();
  }

  /**
   * Replace a UTF-16 range. Offsets intentionally match textarea selectionStart
   * and selectionEnd so the UI and model share one coordinate system.
   */
  replaceRange(start: number, end: number, inserted: string): string {
    const from = this.clampOffset(Math.min(start, end));
    const to = this.clampOffset(Math.max(start, end));
    const deleted = this.value.slice(from, to);
    if (deleted === inserted) return this.value;

    this.applyTransaction({ start: from, deleted, inserted });
    this.undoStack.push({ start: from, deleted, inserted });
    if (this.undoStack.length > this.historyLimit) this.undoStack.shift();
    this.redoStack = [];
    return this.value;
  }

  /**
   * Replace the whole value while storing only the changed middle segment.
   * This keeps normal keystrokes from retaining a complete document snapshot.
   */
  replaceAll(nextValue: string): string {
    if (nextValue === this.value) return this.value;

    let prefix = 0;
    const sharedLimit = Math.min(this.value.length, nextValue.length);
    while (prefix < sharedLimit && this.value.charCodeAt(prefix) === nextValue.charCodeAt(prefix)) {
      prefix += 1;
    }
    while (prefix > 0 && (!this.isSafeBoundary(this.value, prefix) || !this.isSafeBoundary(nextValue, prefix))) {
      prefix -= 1;
    }

    let suffix = 0;
    while (
      suffix < this.value.length - prefix &&
      suffix < nextValue.length - prefix &&
      this.value.charCodeAt(this.value.length - suffix - 1) === nextValue.charCodeAt(nextValue.length - suffix - 1)
    ) {
      suffix += 1;
    }
    while (
      suffix > 0 &&
      (!this.isSafeBoundary(this.value, this.value.length - suffix) ||
        !this.isSafeBoundary(nextValue, nextValue.length - suffix))
    ) {
      suffix -= 1;
    }

    return this.replaceRange(prefix, this.value.length - suffix, nextValue.slice(prefix, nextValue.length - suffix));
  }

  undo(): string {
    const transaction = this.undoStack.pop();
    if (!transaction) return this.value;

    this.applyTransaction({
      start: transaction.start,
      deleted: transaction.inserted,
      inserted: transaction.deleted,
    });
    this.redoStack.push(transaction);
    return this.value;
  }

  redo(): string {
    const transaction = this.redoStack.pop();
    if (!transaction) return this.value;

    this.applyTransaction(transaction);
    this.undoStack.push(transaction);
    return this.value;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  getLine(lineNumber: number): string {
    const index = Math.max(0, Math.min(this.lineStarts.length - 1, Math.floor(lineNumber) - 1));
    const start = this.lineStarts[index];
    let end = index + 1 < this.lineStarts.length ? this.lineStarts[index + 1] - 1 : this.value.length;
    if (end > start && this.value.charCodeAt(end - 1) === 13) end -= 1;
    return this.value.slice(start, end);
  }

  getLineStart(lineNumber: number): number {
    const index = Math.max(0, Math.min(this.lineStarts.length - 1, Math.floor(lineNumber) - 1));
    return this.lineStarts[index];
  }

  positionAt(offset: number): TextPosition {
    const target = this.clampOffset(offset);
    let low = 0;
    let high = this.lineStarts.length - 1;

    while (low <= high) {
      const middle = (low + high) >>> 1;
      if (this.lineStarts[middle] <= target) low = middle + 1;
      else high = middle - 1;
    }

    const lineIndex = Math.max(0, high);
    return { line: lineIndex + 1, column: target - this.lineStarts[lineIndex] + 1 };
  }

  offsetAt(position: TextPosition): number {
    const line = Math.max(1, Math.min(this.lineStarts.length, Math.floor(position.line)));
    const start = this.lineStarts[line - 1];
    const lineText = this.getLine(line);
    const columnOffset = Math.max(0, Math.min(lineText.length, Math.floor(position.column) - 1));
    return start + columnOffset;
  }

  private applyTransaction(transaction: EditTransaction): void {
    const { start, deleted, inserted } = transaction;
    this.updateLineIndex(start, start + deleted.length, inserted);
    this.value = this.value.slice(0, start) + inserted + this.value.slice(start + deleted.length);
  }

  private updateLineIndex(start: number, end: number, inserted: string): void {
    const delta = inserted.length - (end - start);
    let prefixEnd = 0;
    while (prefixEnd < this.lineStarts.length && this.lineStarts[prefixEnd] <= start) prefixEnd += 1;
    let suffixStart = 0;
    while (suffixStart < this.lineStarts.length && this.lineStarts[suffixStart] <= end) suffixStart += 1;

    const nextStarts = this.lineStarts.slice(0, prefixEnd);
    for (let index = 0; index < inserted.length; index += 1) {
      if (inserted.charCodeAt(index) === 10) nextStarts.push(start + index + 1);
    }
    for (let index = suffixStart; index < this.lineStarts.length; index += 1) {
      nextStarts.push(this.lineStarts[index] + delta);
    }
    this.lineStarts = nextStarts;
  }

  private rebuildLineIndex(): void {
    const starts = [0];
    for (let index = 0; index < this.value.length; index += 1) {
      if (this.value.charCodeAt(index) === 10) starts.push(index + 1);
    }
    this.lineStarts = starts;
  }

  private clampOffset(offset: number): number {
    return Math.max(0, Math.min(this.value.length, Math.floor(offset)));
  }

  private isSafeBoundary(value: string, offset: number): boolean {
    if (offset <= 0 || offset >= value.length) return true;
    return !(isHighSurrogate(value.charCodeAt(offset - 1)) && isLowSurrogate(value.charCodeAt(offset)));
  }
}
