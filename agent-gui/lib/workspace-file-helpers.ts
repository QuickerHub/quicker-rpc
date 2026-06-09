/** Shared helpers for workspace file read/edit (no path resolution). */

export const DEFAULT_READ_CHARS = 16_000;
export const MAX_READ_CHARS = 200_000;
export const DEFAULT_READ_LINES = 400;
export const MAX_READ_LINES = 2_000;
export const MAX_EDIT_FILE_BYTES = 2 * 1024 * 1024;
/** Explorer / visual editor: load whole file when below this size. */
export const MAX_UI_READ_BYTES = 4 * 1024 * 1024;
export const MAX_DIFF_SNAPSHOT_CHARS = 8_192;
export const MAX_GREP_MATCHES = 50;
export const MAX_LINE_COUNT_SCAN = 500_000;

/** Directory names skipped during workspace grep directory walks. */
export const GREP_SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "__pycache__",
  ".turbo",
  "coverage",
]);

/** File extensions skipped during workspace grep (likely binary). */
export const GREP_SKIP_FILE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".zip",
  ".exe",
  ".dll",
  ".woff",
  ".woff2",
  ".pdf",
  ".pdb",
]);

export function shouldSkipGrepEntry(name: string, isDirectory: boolean): boolean {
  if (isDirectory) {
    return GREP_SKIP_DIR_NAMES.has(name);
  }
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return GREP_SKIP_FILE_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

export type ReadWindow =
  | { mode: "chars"; offset: number; limit: number }
  | { mode: "lines"; startLine: number; maxLines: number; explicitEndLine?: number };

export function resolveReadWindow(options?: {
  offset?: number;
  limit?: number;
  startLine?: number;
  endLine?: number;
  maxLines?: number;
}): ReadWindow {
  if (options?.startLine != null && options.startLine >= 1) {
    const startLine = Math.floor(options.startLine);
    let maxLines = options.maxLines ?? DEFAULT_READ_LINES;
    if (options.endLine != null && options.endLine >= startLine) {
      maxLines = Math.min(
        Math.floor(options.endLine) - startLine + 1,
        MAX_READ_LINES,
      );
    }
    return {
      mode: "lines",
      startLine,
      maxLines: Math.min(Math.max(1, maxLines), MAX_READ_LINES),
      explicitEndLine: options.endLine != null ? Math.floor(options.endLine) : undefined,
    };
  }

  const offset = Math.max(0, options?.offset ?? 0);
  const limit = Math.min(
    Math.max(1, options?.limit ?? DEFAULT_READ_CHARS),
    MAX_READ_CHARS,
  );
  return { mode: "chars", offset, limit };
}

export function countSubstringOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  while (true) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) break;
    count += 1;
    pos = idx + Math.max(needle.length, 1);
  }
  return count;
}

/** 1-based line numbers for each match start index (up to maxReport). */
export function lineNumbersForMatches(
  content: string,
  needle: string,
  maxReport = 5,
): number[] {
  const lines: number[] = [];
  let pos = 0;
  while (lines.length < maxReport) {
    const idx = content.indexOf(needle, pos);
    if (idx === -1) break;
    lines.push(content.slice(0, idx).split("\n").length);
    pos = idx + Math.max(needle.length, 1);
  }
  return lines;
}

export function buildReadContinuationHint(args: {
  truncated: boolean;
  mode: "chars" | "lines";
  offset?: number;
  contentLength: number;
  endLine?: number;
  totalChars?: number;
  totalLines?: number;
}): string | undefined {
  if (!args.truncated) return undefined;
  if (args.mode === "chars") {
    const next = (args.offset ?? 0) + args.contentLength;
    const total =
      args.totalChars !== undefined ? ` (${args.totalChars} chars total)` : "";
    return `Truncated. Continue with offset=${next}, limit=${DEFAULT_READ_CHARS}${total}.`;
  }
  if (args.endLine != null) {
    const nextLine = args.endLine + 1;
    const total =
      args.totalLines !== undefined ? ` (${args.totalLines} lines total)` : "";
    return `Truncated. Continue with startLine=${nextLine}, maxLines=${DEFAULT_READ_LINES}${total}.`;
  }
  return "Truncated. Use a larger limit or narrow startLine/endLine.";
}
