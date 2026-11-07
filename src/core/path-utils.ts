/** Portable path helpers for workspace paths returned by the native filesystem layer. */
export function isPathWithin(candidate: string, base: string): boolean {
  if (candidate === base) return true;
  const separator = base.includes("\\") ? "\\" : "/";
  const prefix = base.endsWith(separator) ? base : base + separator;
  return candidate.startsWith(prefix);
}

export function remapPath(candidate: string, oldPath: string, newPath: string): string {
  if (candidate === oldPath) return newPath;
  return isPathWithin(candidate, oldPath)
    ? newPath + candidate.slice(oldPath.length)
    : candidate;
}

export function parentPath(path: string): string {
  const separator = path.includes("\\") ? "\\" : "/";
  const trimmed = path.length > 1 ? path.replace(/[\\/]+$/, "") : path;
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (index < 0) return "";
  if (separator === "\\" && index === 2 && /^[A-Za-z]:/.test(trimmed)) {
    return trimmed.slice(0, 3);
  }
  if (index === 0) return "/";
  return trimmed.slice(0, index);
}
