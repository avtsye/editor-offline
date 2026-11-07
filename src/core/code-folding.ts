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
    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === "{" || char === "[") stack.push({ char, offset: index });
    else if (char === "}" || char === "]") {
      const expected = char === "}" ? "{" : "[";
      const opening = stack.pop();
      if (opening?.char === expected) {
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
