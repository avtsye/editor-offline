export type VisibleLineRange = { start: number; end: number };

/** Calculate a zero-based, end-exclusive line window with overscan. */
export function getVisibleLineRange(
  lineCount: number,
  scrollTop: number,
  viewportHeight: number,
  lineHeight: number,
  overscan = 8,
): VisibleLineRange {
  const total = Math.max(0, Math.floor(lineCount));
  if (total === 0) return { start: 0, end: 0 };

  const rowHeight = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 1;
  const top = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0;
  const height = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0;
  const extra = Number.isFinite(overscan) ? Math.max(0, Math.floor(overscan)) : 0;
  const start = Math.min(total - 1, Math.max(0, Math.floor(top / rowHeight) - extra));
  const end = Math.min(
    total,
    Math.max(start + 1, Math.ceil((top + height) / rowHeight) + extra),
  );

  return { start, end };
}
