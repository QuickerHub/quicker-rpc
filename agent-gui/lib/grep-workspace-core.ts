import { relative } from "node:path";

export const DEFAULT_GREP_HEAD_LIMIT = 25;
export const MAX_GREP_HEAD_LIMIT = 200;

export type GrepOutputMode = "content" | "files_with_matches" | "count";

export type GrepWorkspaceMatch = {
  path: string;
  line?: number;
  content?: string;
  count?: number;
};

export type GrepWorkspaceOptions = {
  pattern: string;
  path?: string;
  glob?: string;
  type?: string;
  outputMode?: GrepOutputMode;
  caseInsensitive?: boolean;
  multiline?: boolean;
  contextBefore?: number;
  contextAfter?: number;
  context?: number;
  headLimit?: number;
  offset?: number;
};

export type GrepWorkspaceResult =
  | { ok: false; error: string }
  | {
      ok: true;
      pattern: string;
      searchPath: string;
      outputMode: GrepOutputMode;
      matches: GrepWorkspaceMatch[];
      truncated: boolean;
      totalMatches: number;
    };

type RgJsonLine = {
  type?: string;
  data?: {
    path?: { text?: string };
    lines?: { text?: string };
    line_number?: number;
  };
};

export function buildRipgrepArgs(
  options: GrepWorkspaceOptions,
  searchRelative: string,
): string[] {
  const outputMode = options.outputMode ?? "content";
  const args = ["--color=never", "--max-columns=500"];

  if (outputMode === "content") {
    args.push("--json");
  } else if (outputMode === "files_with_matches") {
    args.push("-l");
  } else {
    args.push("-c");
  }

  if (options.caseInsensitive) args.push("-i");
  if (options.multiline) args.push("-U", "--multiline-dotall");
  if (options.context != null) args.push("-C", String(options.context));
  else {
    if (options.contextBefore != null) args.push("-B", String(options.contextBefore));
    if (options.contextAfter != null) args.push("-A", String(options.contextAfter));
  }
  if (options.glob?.trim()) args.push("--glob", options.glob.trim());
  if (options.type?.trim()) args.push("--type", options.type.trim());

  args.push("--", options.pattern.trim(), searchRelative);
  return args;
}

export function parseRipgrepJsonLine(
  line: string,
  workspaceRoot: string,
): GrepWorkspaceMatch | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let parsed: RgJsonLine;
  try {
    parsed = JSON.parse(trimmed) as RgJsonLine;
  } catch {
    return null;
  }
  if (parsed.type !== "match" || !parsed.data?.path?.text) return null;
  const absPath = parsed.data.path.text;
  const root = workspaceRoot.replace(/\\/g, "/");
  const normalizedAbs = absPath.replace(/\\/g, "/");
  const relPath = normalizedAbs.startsWith(root)
    ? relative(workspaceRoot, absPath).replace(/\\/g, "/")
    : normalizedAbs;
  return {
    path: relPath,
    line: parsed.data.line_number,
    content: parsed.data.lines?.text?.replace(/\r?\n$/, ""),
  };
}

export function parsePlainCountLine(
  line: string,
  workspaceRoot: string,
): GrepWorkspaceMatch | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const colon = trimmed.lastIndexOf(":");
  if (colon <= 0) return null;
  const filePart = trimmed.slice(0, colon);
  const countPart = trimmed.slice(colon + 1);
  const count = Number.parseInt(countPart, 10);
  if (!Number.isFinite(count)) return null;
  const relPath = filePart.startsWith(workspaceRoot)
    ? relative(workspaceRoot, filePart).replace(/\\/g, "/")
    : filePart.replace(/\\/g, "/");
  return { path: relPath, count };
}

export function applyGrepHeadLimit<T>(items: T[], headLimit: number, offset: number): {
  items: T[];
  truncated: boolean;
  totalMatches: number;
} {
  const total = items.length;
  const start = Math.max(0, offset);
  const end = start + headLimit;
  const slice = items.slice(start, end);
  return {
    items: slice,
    truncated: end < total,
    totalMatches: total,
  };
}
