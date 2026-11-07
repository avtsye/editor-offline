export type TextEditResult = { text: string; selectionStart: number; selectionEnd: number };

const lineStartAt = (text: string, offset: number) => {
  const newline = text.lastIndexOf("\n", Math.max(0, offset - 1));
  return newline + 1;
};

const lineEndAt = (text: string, offset: number) => {
  const newline = text.indexOf("\n", offset);
  return newline < 0 ? text.length : newline;
};

export function indentSelection(text: string, start: number, end: number, indent = "    ", outdent = false): TextEditResult {
  const from = lineStartAt(text, Math.max(0, Math.min(start, text.length)));
  const to = end > start ? lineEndAt(text, Math.min(end, text.length)) : from;
  const block = text.slice(from, to);
  const lines = block.split("\n");
  const transformed = lines.map(line => {
    if (!outdent) return indent + line;
    if (line.startsWith("\t")) return line.slice(1);
    if (line.startsWith(indent)) return line.slice(indent.length);
    const spaces = line.match(/^ {1,3}/)?.[0];
    return spaces ? line.slice(spaces.length) : line;
  }).join("\n");
  const delta = transformed.length - block.length;
  return {
    text: text.slice(0, from) + transformed + text.slice(to),
    selectionStart: from,
    selectionEnd: Math.max(from, end + delta),
  };
}

export function toggleLineComment(text: string, start: number, end: number, marker: string): TextEditResult {
  const from = lineStartAt(text, Math.max(0, Math.min(start, text.length)));
  const to = end > start ? lineEndAt(text, Math.min(end, text.length)) : from;
  const block = text.slice(from, to);
  const lines = block.split("\n");
  const nonEmpty = lines.map(line => line.trim()).filter(Boolean);
  const shouldUncomment = nonEmpty.length > 0 && nonEmpty.every(line => line.startsWith(marker));
  const transformed = lines.map(line => {
    if (!line.trim()) return line;
    if (shouldUncomment) {
      const leading = line.match(/^\s*/)?.[0] ?? "";
      const rest = line.slice(leading.length + marker.length);
      return leading + (rest.startsWith(" ") ? rest.slice(1) : rest);
    }
    const leading = line.match(/^\s*/)?.[0] ?? "";
    return leading + marker + " " + line.slice(leading.length);
  }).join("\n");
  const delta = transformed.length - block.length;
  return {
    text: text.slice(0, from) + transformed + text.slice(to),
    selectionStart: start + (start > from ? (transformed.split("\n")[0].length - lines[0].length) : 0),
    selectionEnd: Math.max(start, end + delta),
  };
}

export function moveLines(text: string, start: number, end: number, direction: -1 | 1): TextEditResult {
  const from = lineStartAt(text, Math.max(0, Math.min(start, text.length)));
  const selectedEnd = end > start ? lineEndAt(text, Math.min(end, text.length)) : lineEndAt(text, start);
  const blockEnd = selectedEnd < text.length ? selectedEnd + 1 : selectedEnd;
  const block = text.slice(from, blockEnd);
  const lines = block.split("\\n");
  const selectedLineCount = lines.length - (block.endsWith("\\n") ? 1 : 0);
  if (direction < 0) {
    if (from === 0) return { text, selectionStart: start, selectionEnd: end };
    const previousStart = lineStartAt(text, from);
    const previous = text.slice(previousStart, from);
    const moved = text.slice(0, previousStart) + block + previous + text.slice(blockEnd);
    const shift = block.length;
    return { text: moved, selectionStart: start + shift, selectionEnd: end + shift };
  }
  if (blockEnd >= text.length) return { text, selectionStart: start, selectionEnd: end };
  const nextEnd = lineEndAt(text, blockEnd + 1);
  const nextBlockEnd = nextEnd < text.length ? nextEnd + 1 : nextEnd;
  const next = text.slice(blockEnd, nextBlockEnd);
  const moved = text.slice(0, from) + next + block + text.slice(nextBlockEnd);
  const shift = next.length;
  return { text: moved, selectionStart: Math.max(from, start - shift), selectionEnd: Math.max(from, end - shift) };
}
