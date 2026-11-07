export type FoldKind = "block" | "indent" | "html" | "region";
export type FoldRange = {
  startLine: number;
  endLine: number;
  kind: FoldKind;
  label: string;
};

const lineAt = (source: string, offset: number): number => {
  let line = 1;
  for (let index = 0; index < offset; index += 1) if (source[index] === "\n") line += 1;
  return line;
};

export function findFoldRanges(source: string, languageId: string): FoldRange[] {
  if (!source) return [];
  const language = languageId.toLowerCase();
  const ranges: FoldRange[] = [];
  const stack: { char: string; offset: number }[] = [];
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1] ?? "";
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if ((language === "python" || language === "shell" || language === "yaml" || language === "yml") && char === "#") { lineComment = true; continue; }
    if (char === "/" && next === "/") { lineComment = true; index += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (char === "'" || char === '"' || char === "`") { quote = char; continue; }
    if (char === "{" || char === "[") stack.push({ char, offset: index });
    else if (char === "}" || char === "]") {
      const expected = char === "}" ? "{" : "[";
      // Recover from malformed inner delimiters without losing the matching outer block.
      let openingIndex = stack.length - 1;
      while (openingIndex >= 0 && stack[openingIndex].char !== expected) openingIndex -= 1;
      if (openingIndex >= 0) {
        const opening = stack[openingIndex];
        stack.splice(openingIndex);
        const startLine = lineAt(source, opening.offset);
        const endLine = lineAt(source, index);
        if (endLine > startLine) ranges.push({ startLine, endLine, kind: "block", label: char === "}" ? "}" : "]" });
      }
    }
  }

  if (language === "html" || language === "xml" || language === "jsx" || language === "tsx" || language === "vue") {
    const tagStack: { name: string; offset: number }[] = [];
    const voidTags = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);
    const tagPattern = /<\s*(\/?)\s*([A-Za-z][\w:.-]*)\b[^>]*?>/g;
    let match: RegExpExecArray | null;
    while ((match = tagPattern.exec(source))) {
      const closing = Boolean(match[1]);
      const name = match[2].toLowerCase();
      const raw = match[0];
      if (raw.startsWith("<!--") || /\/\s*>$/.test(raw) || voidTags.has(name)) continue;
      if (!closing) tagStack.push({ name, offset: match.index });
      else {
        const openingIndex = tagStack.map(item => item.name).lastIndexOf(name);
        if (openingIndex < 0) continue;
        const opening = tagStack[openingIndex];
        tagStack.splice(openingIndex);
        const startLine = lineAt(source, opening.offset);
        const endLine = lineAt(source, match.index);
        if (endLine > startLine) ranges.push({ startLine, endLine, kind: "html", label: name });
      }
    }
  }

  if (language === "python") {
    const lines = source.split("\n");
    for (let index = 0; index < lines.length - 1; index += 1) {
      const current = lines[index];
      if (!/^\s*(async\s+def|def|class|if|elif|else|for|while|try|except|finally|with)\b.*:\s*(#.*)?$/.test(current)) continue;
      const baseIndent = current.match(/^\s*/)?.[0].length ?? 0;
      let end = index + 1;
      while (end < lines.length) {
        if (!lines[end].trim()) { end += 1; continue; }
        const indent = lines[end].match(/^\s*/)?.[0].length ?? 0;
        if (indent <= baseIndent) break;
        end += 1;
      }
      if (end - 1 > index) ranges.push({ startLine: index + 1, endLine: end, kind: "indent", label: "…" });
    }
  }

  // Explicit region markers are supported across common editor conventions.
  const regionStack: { line: number; label: string }[] = [];
  const sourceLines = source.split("\n");
  sourceLines.forEach((line, index) => {
    const marker = line.match(/^\s*(?:\/\/\s*#?region\b(.*)|#\s*#?region\b(.*)|<!--\s*#?region\b(.*?)\s*-->)\s*$/i);
    const endMarker = /^\s*(?:\/\/\s*#?endregion\b|#\s*#?endregion\b|<!--\s*#?endregion\b.*?-->)\s*$/i.test(line);
    if (marker) {
      regionStack.push({ line: index + 1, label: (marker[1] ?? marker[2] ?? marker[3] ?? "").trim() || "region" });
    } else if (endMarker && regionStack.length) {
      const opening = regionStack.pop()!;
      if (index + 1 > opening.line) ranges.push({ startLine: opening.line, endLine: index + 1, kind: "region", label: opening.label });
    }
  });

  const unique = new Map<string, FoldRange>();
  for (const range of ranges) unique.set(`${range.startLine}:${range.endLine}:${range.kind}`, range);
  return [...unique.values()].sort((a, b) => a.startLine - b.startLine || b.endLine - a.endLine);
}

export function getFoldedLineSet(ranges: FoldRange[], collapsed: Set<string>): Set<number> {
  const hidden = new Set<number>();
  for (const range of ranges) {
    if (!collapsed.has(`${range.startLine}:${range.endLine}`)) continue;
    for (let line = range.startLine + 1; line <= range.endLine; line += 1) hidden.add(line);
  }
  return hidden;
}

export function foldKey(range: Pick<FoldRange, "startLine" | "endLine">): string {
  return `${range.startLine}:${range.endLine}`;
}


export type FoldProjectionRow = {
  line: number;
  hiddenLineCount: number;
  placeholder: string | null;
};

/** View-only folding state. The original source and offsets are never rewritten. */
export class FoldModel {
  private source = "";
  private languageId = "plain";
  private collapsed = new Set<string>();
  private ranges: FoldRange[] = [];
  private lineStarts: number[] = [0];

  constructor(source = "", languageId = "plain") {
    this.updateDocument(source, languageId);
  }

  updateDocument(source: string, languageId = this.languageId): void {
    const previous = this.collapsed;
    this.source = source;
    this.languageId = languageId;
    this.lineStarts = [0];
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] === "\n") this.lineStarts.push(index + 1);
    }
    this.ranges = findFoldRanges(source, languageId);
    const valid = new Set(this.ranges.map(foldKey));
    this.collapsed = new Set([...previous].filter(key => valid.has(key)));
  }

  getRanges(): FoldRange[] { return this.ranges.map(range => ({ ...range })); }
  isCollapsed(range: FoldRange): boolean {
    return this.collapsed.has(foldKey(range));
  }
  toggle(range: FoldRange): boolean {
    if (!range) return false;
    const key = foldKey(range);
    if (!this.ranges.some(candidate => foldKey(candidate) === key)) return false;
    if (this.collapsed.has(key)) this.collapsed.delete(key);
    else this.collapsed.add(key);
    return this.collapsed.has(key);
  }
  collapseAll(): void {
    for (const range of this.ranges) this.collapsed.add(foldKey(range));
  }
  expandAll(): void { this.collapsed.clear(); }

  getProjection(): FoldProjectionRow[] {
    const byStart = new Map<number, FoldRange>();
    for (const range of this.ranges) {
      if (this.collapsed.has(foldKey(range))) {
        const existing = byStart.get(range.startLine);
        if (!existing || range.endLine > existing.endLine) byStart.set(range.startLine, range);
      }
    }
    const rows: FoldProjectionRow[] = [];
    let line = 1;
    while (line <= this.lineStarts.length) {
      const range = byStart.get(line);
      rows.push({ line, hiddenLineCount: range ? range.endLine - line : 0,
        placeholder: range ? `… ${range.endLine - line} lines` : null });
      line = range ? range.endLine + 1 : line + 1;
    }
    return rows;
  }
  getVisibleLineCount(): number { return this.getProjection().length; }
  isLineHidden(line: number): boolean {
    const target = Math.max(1, Math.floor(line));
    return this.getProjection().every(row => row.line !== target);
  }
  visibleRowForSourceLine(line: number): number {
    const target = Math.max(1, Math.floor(line));
    const projection = this.getProjection();
    let visibleIndex = 0;
    for (const row of projection) {
      if (row.line === target || (row.hiddenLineCount > 0 && target > row.line && target <= row.line + row.hiddenLineCount))
        return visibleIndex;
      visibleIndex += 1;
    }
    return Math.max(0, projection.length - 1);
  }
  sourceLineForVisibleRow(rowIndex: number): number {
    const projection = this.getProjection();
    const index = Math.max(0, Math.min(projection.length - 1, Math.floor(rowIndex)));
    return projection[index]?.line ?? 1;
  }
  sourceOffsetAtLine(line: number): number {
    const index = Math.max(0, Math.min(this.lineStarts.length - 1, Math.floor(line) - 1));
    return this.lineStarts[index] ?? 0;
  }
  lineAtSourceOffset(offset: number): number {
    const target = Math.max(0, Math.min(this.source.length, Math.floor(offset)));
    let low = 0; let high = this.lineStarts.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.lineStarts[middle] <= target) low = middle + 1;
      else high = middle;
    }
    return Math.max(1, low);
  }
  revealLine(line: number): void {
    const target = Math.max(1, Math.floor(line));
    for (const range of this.ranges) {
      if (this.isCollapsed(range) && target > range.startLine && target <= range.endLine)
        this.collapsed.delete(foldKey(range));
    }
  }
}
