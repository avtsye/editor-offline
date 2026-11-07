export class TextBuffer {
  private value: string;
  private undoStack: string[];
  private redoStack: string[] = [];
  private readonly historyLimit: number;

  constructor(initialValue = "", historyLimit = 250) {
    this.value = initialValue;
    this.undoStack = [initialValue];
    this.historyLimit = Math.max(2, historyLimit);
  }

  getText(): string { return this.value; }

  load(value: string): void {
    this.value = value;
    this.undoStack = [value];
    this.redoStack = [];
  }

  replaceAll(nextValue: string): string {
    if (nextValue === this.value) return this.value;
    this.undoStack.push(this.value);
    if (this.undoStack.length > this.historyLimit) this.undoStack.shift();
    this.value = nextValue;
    this.redoStack = [];
    return this.value;
  }

  undo(): string {
    if (this.undoStack.length <= 1) return this.value;
    this.redoStack.push(this.value);
    this.undoStack.pop();
    this.value = this.undoStack[this.undoStack.length - 1] ?? "";
    return this.value;
  }

  redo(): string {
    const nextValue = this.redoStack.pop();
    if (nextValue === undefined) return this.value;
    this.undoStack.push(this.value);
    this.value = nextValue;
    return this.value;
  }

  canUndo(): boolean { return this.undoStack.length > 1; }
  canRedo(): boolean { return this.redoStack.length > 0; }
}
