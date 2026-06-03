import { createReadStream, existsSync } from "node:fs";
import { mkdir, open, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { StringDecoder } from "node:string_decoder";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";
import { getRequestCwd } from "@/lib/qkrpc-request-context";
import { resolveDefaultWorkingDirectory } from "@/lib/default-working-directory";
import {
  buildReadContinuationHint,
  countSubstringOccurrences,
  DEFAULT_READ_CHARS,
  lineNumbersForMatches,
  MAX_DIFF_SNAPSHOT_CHARS,
  MAX_EDIT_FILE_BYTES,
  MAX_UI_READ_BYTES,
  MAX_GREP_MATCHES,
  MAX_LINE_COUNT_SCAN,
  MAX_READ_CHARS,
  MAX_READ_LINES,
  resolveReadWindow,
} from "@/lib/workspace-file-helpers";

export {
  DEFAULT_READ_CHARS,
  MAX_DIFF_SNAPSHOT_CHARS,
  MAX_EDIT_FILE_BYTES,
  MAX_READ_CHARS,
} from "@/lib/workspace-file-helpers";

const MAX_LIST_ENTRIES = 500;
const STREAM_READ_CHUNK_BYTES = 64 * 1024;

type ReadUtf8SliceResult = {
  content: string;
  truncated: boolean;
  totalChars?: number;
};

async function readUtf8FileSlice(
  absolutePath: string,
  charOffset: number,
  charLimit: number,
  fileSizeBytes: number,
): Promise<ReadUtf8SliceResult> {
  if (fileSizeBytes === 0) {
    return { content: "", truncated: false, totalChars: 0 };
  }

  if (charOffset > 0 || fileSizeBytes <= charLimit * 4) {
    const raw = await readFile(absolutePath, "utf8");
    const slice = raw.slice(charOffset, charOffset + charLimit);
    return {
      content: slice,
      truncated: charOffset > 0 || raw.length > charOffset + charLimit,
      totalChars: raw.length,
    };
  }

  const handle = await open(absolutePath, "r");
  try {
    const decoder = new StringDecoder("utf8");
    let decoded = "";
    let byteOffset = 0;

    while (byteOffset < fileSizeBytes && decoded.length < charLimit) {
      const toRead = Math.min(STREAM_READ_CHUNK_BYTES, fileSizeBytes - byteOffset);
      const buffer = Buffer.allocUnsafe(toRead);
      const { bytesRead } = await handle.read(buffer, 0, toRead, byteOffset);
      if (bytesRead === 0) break;
      byteOffset += bytesRead;
      decoded += decoder.write(buffer.subarray(0, bytesRead));
    }

    const reachedEof = byteOffset >= fileSizeBytes;
    if (reachedEof) {
      decoded += decoder.end();
    }

    const truncated = !reachedEof || decoded.length > charLimit;
    return {
      content: decoded.slice(0, charLimit),
      truncated,
      totalChars: reachedEof ? decoded.length : undefined,
    };
  } finally {
    await handle.close();
  }
}

export type WorkspacePathResult =
  | { ok: true; absolute: string; relative: string }
  | { ok: false; error: string };

export function resolveWorkspaceRoot(): string {
  return getRequestCwd()?.trim() || resolveDefaultWorkingDirectory();
}

/** Resolve a relative path under the active working directory; reject traversal escapes. */
export function resolveWorkspacePath(inputPath: string): WorkspacePathResult {
  const root = resolveWorkspaceRoot();
  const trimmed = inputPath.trim();
  if (!trimmed) {
    return { ok: false, error: "path is required." };
  }

  const absolute = resolve(root, trimmed);
  const normalizedRoot = normalize(root + sep);
  const normalizedTarget = normalize(absolute);
  if (
    normalizedTarget !== normalizedRoot.slice(0, -1)
    && !normalizedTarget.startsWith(normalizedRoot)
  ) {
    return { ok: false, error: "path must stay inside the working directory." };
  }

  return {
    ok: true,
    absolute: normalizedTarget,
    relative: relative(root, normalizedTarget).replace(/\\/g, "/"),
  };
}

export type WorkspaceFileReadResult = {
  path: string;
  content: string;
  truncated: boolean;
  totalChars?: number;
  totalLines?: number;
  startLine?: number;
  endLine?: number;
  readHint?: string;
};

async function readUtf8LineSliceFixed(
  absolutePath: string,
  startLine: number,
  maxLines: number,
  explicitEndLine?: number,
): Promise<{
  content: string;
  truncated: boolean;
  startLine: number;
  endLine: number;
  totalLines?: number;
}> {
  const lines: string[] = [];
  let lineNo = 0;
  let endLine = startLine - 1;
  let stoppedEarly = false;

  const stream = createReadStream(absolutePath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      lineNo += 1;
      if (lineNo < startLine) continue;
      if (lines.length >= maxLines) {
        stoppedEarly = true;
        break;
      }
      lines.push(line);
      endLine = lineNo;
    }

    if (stoppedEarly) {
      for await (const _line of rl) {
        lineNo += 1;
      }
    }

    const content = lines.join("\n");
    const totalLines = lineNo;
    const truncated =
      explicitEndLine != null
        ? false
        : endLine < totalLines;
    return {
      content,
      truncated,
      startLine: lines.length > 0 ? startLine : startLine,
      endLine: lines.length > 0 ? endLine : Math.max(startLine - 1, 0),
      totalLines: lines.length > 0 ? totalLines : 0,
    };
  } finally {
    stream.destroy();
    rl.close();
  }
}

export async function countWorkspaceFileLines(
  inputPath: string,
): Promise<{ ok: true; lineCount: number; capped: boolean } | { ok: false; error: string }> {
  const resolved = resolveWorkspacePath(inputPath);
  if (!resolved.ok) return resolved;
  if (!existsSync(resolved.absolute)) {
    return { ok: false, error: `file not found: ${resolved.relative}` };
  }
  const fileStat = await stat(resolved.absolute);
  if (!fileStat.isFile()) {
    return { ok: false, error: `not a file: ${resolved.relative}` };
  }

  let lineCount = 0;
  const stream = createReadStream(resolved.absolute, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const _line of rl) {
      lineCount += 1;
      if (lineCount >= MAX_LINE_COUNT_SCAN) {
        return { ok: true, lineCount, capped: true };
      }
    }
    return { ok: true, lineCount, capped: false };
  } finally {
    stream.destroy();
    rl.close();
  }
}

export async function readWorkspaceFile(
  inputPath: string,
  options?: {
    offset?: number;
    limit?: number;
    startLine?: number;
    endLine?: number;
    maxLines?: number;
  },
): Promise<{ ok: true } & WorkspaceFileReadResult | { ok: false; error: string }> {
  const resolved = resolveWorkspacePath(inputPath);
  if (!resolved.ok) return resolved;

  if (!existsSync(resolved.absolute)) {
    return { ok: false, error: `file not found: ${resolved.relative}` };
  }

  const fileStat = await stat(resolved.absolute);
  if (!fileStat.isFile()) {
    return { ok: false, error: `not a file: ${resolved.relative}` };
  }

  const window = resolveReadWindow(options);

  if (window.mode === "lines") {
    const slice = await readUtf8LineSliceFixed(
      resolved.absolute,
      window.startLine,
      window.maxLines,
      window.explicitEndLine,
    );
    const readHint = buildReadContinuationHint({
      truncated: slice.truncated,
      mode: "lines",
      contentLength: slice.content.length,
      endLine: slice.endLine,
      totalLines: slice.totalLines,
    });
    return {
      ok: true,
      path: resolved.relative,
      content: slice.content,
      truncated: slice.truncated,
      totalLines: slice.totalLines,
      startLine: slice.startLine,
      endLine: slice.endLine,
      readHint,
    };
  }

  const slice = await readUtf8FileSlice(
    resolved.absolute,
    window.offset,
    window.limit,
    fileStat.size,
  );
  const readHint = buildReadContinuationHint({
    truncated: slice.truncated,
    mode: "chars",
    offset: window.offset,
    contentLength: slice.content.length,
    totalChars: slice.totalChars,
  });

  return {
    ok: true,
    path: resolved.relative,
    content: slice.content,
    truncated: slice.truncated,
    totalChars: slice.totalChars,
    readHint,
  };
}

/** Full read for workspace explorer UI (not agent tool slices). */
export async function readWorkspaceFileForExplorer(
  inputPath: string,
  options?: { offset?: number; limit?: number },
): Promise<{ ok: true } & WorkspaceFileReadResult | { ok: false; error: string }> {
  const hasSlice =
    (options?.offset != null && options.offset > 0)
    || options?.limit != null;
  if (hasSlice) {
    return readWorkspaceFile(inputPath, options);
  }

  const resolved = resolveWorkspacePath(inputPath);
  if (!resolved.ok) return resolved;

  if (!existsSync(resolved.absolute)) {
    return { ok: false, error: `file not found: ${resolved.relative}` };
  }

  const fileStat = await stat(resolved.absolute);
  if (!fileStat.isFile()) {
    return { ok: false, error: `not a file: ${resolved.relative}` };
  }

  if (fileStat.size > MAX_UI_READ_BYTES) {
    const slice = await readWorkspaceFile(inputPath, {
      offset: 0,
      limit: MAX_READ_CHARS,
    });
    if (!slice.ok) return slice;
    return {
      ...slice,
      readHint:
        `File is ${fileStat.size} bytes (UI max ${MAX_UI_READ_BYTES}). `
        + "Showing first slice only; use Agent file_read/file_edit for large files.",
    };
  }

  const content = await readFile(resolved.absolute, "utf8");
  return {
    ok: true,
    path: resolved.relative,
    content,
    truncated: false,
    totalChars: content.length,
  };
}

export async function readWorkspaceFileSnapshot(
  inputPath: string,
  maxChars = MAX_DIFF_SNAPSHOT_CHARS,
): Promise<
  | { ok: true; content: string; truncated: boolean; totalChars?: number }
  | { ok: false; error: string }
> {
  const result = await readWorkspaceFile(inputPath, { offset: 0, limit: maxChars });
  if (!result.ok) return result;
  return {
    ok: true,
    content: result.content,
    truncated: result.truncated,
    totalChars: result.totalChars,
  };
}

export async function writeWorkspaceFile(
  inputPath: string,
  content: string,
  options?: { createDirs?: boolean },
): Promise<{ ok: true; path: string; bytesWritten: number } | { ok: false; error: string }> {
  const resolved = resolveWorkspacePath(inputPath);
  if (!resolved.ok) return resolved;

  if (options?.createDirs !== false) {
    await mkdir(dirname(resolved.absolute), { recursive: true });
  }

  await writeFile(resolved.absolute, content, "utf8");
  return {
    ok: true,
    path: resolved.relative,
    bytesWritten: Buffer.byteLength(content, "utf8"),
  };
}

export type WorkspaceGrepMatch = {
  path: string;
  line: number;
  column: number;
  lineText: string;
};

export type WorkspaceFileInfo = {
  path: string;
  sizeBytes: number;
  lineCount?: number;
  lineCountCapped?: boolean;
  exceedsEditLimit: boolean;
  readRecommended: "summary" | "lineRange" | "charRange" | "full";
};

export async function getWorkspaceFileInfo(
  inputPath: string,
): Promise<{ ok: true } & WorkspaceFileInfo | { ok: false; error: string }> {
  const resolved = resolveWorkspacePath(inputPath);
  if (!resolved.ok) return resolved;

  if (!existsSync(resolved.absolute)) {
    return { ok: false, error: `file not found: ${resolved.relative}` };
  }

  const fileStat = await stat(resolved.absolute);
  if (!fileStat.isFile()) {
    return { ok: false, error: `not a file: ${resolved.relative}` };
  }

  const exceedsEditLimit = fileStat.size > MAX_EDIT_FILE_BYTES;
  let readRecommended: WorkspaceFileInfo["readRecommended"] = "full";
  if (fileStat.size > MAX_READ_CHARS * 4) {
    readRecommended = "lineRange";
  } else if (fileStat.size > DEFAULT_READ_CHARS * 2) {
    readRecommended = "charRange";
  }

  const lineResult = await countWorkspaceFileLines(resolved.relative);
  const lineCount = lineResult.ok ? lineResult.lineCount : undefined;
  const lineCountCapped = lineResult.ok ? lineResult.capped : undefined;
  if (lineCount != null && lineCount > MAX_READ_LINES) {
    readRecommended = "lineRange";
  }

  return {
    ok: true,
    path: resolved.relative,
    sizeBytes: fileStat.size,
    lineCount,
    lineCountCapped,
    exceedsEditLimit,
    readRecommended,
  };
}

async function collectFilesUnderDir(
  dirAbsolute: string,
  dirRelative: string,
  out: { absolute: string; relative: string }[],
): Promise<void> {
  const names = await readdir(dirAbsolute, { withFileTypes: true });
  names.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of names) {
    const rel = dirRelative ? `${dirRelative}/${entry.name}` : entry.name;
    const abs = join(dirAbsolute, entry.name);
    if (entry.isDirectory()) {
      await collectFilesUnderDir(abs, rel, out);
      continue;
    }
    if (entry.isFile()) {
      out.push({ absolute: abs, relative: rel });
    }
  }
}

export async function grepWorkspacePath(
  inputPath: string,
  query: string,
  options?: {
    maxMatches?: number;
    caseInsensitive?: boolean;
    literal?: boolean;
  },
): Promise<
  | {
      ok: true;
      path: string;
      matches: WorkspaceGrepMatch[];
      truncated: boolean;
      filesScanned: number;
    }
  | { ok: false; error: string }
> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return { ok: false, error: "query must not be empty." };
  }

  const resolved = resolveWorkspacePath(inputPath);
  if (!resolved.ok) return resolved;

  if (!existsSync(resolved.absolute)) {
    return { ok: false, error: `path not found: ${resolved.relative}` };
  }

  const targetStat = await stat(resolved.absolute);
  const maxMatches = Math.min(options?.maxMatches ?? MAX_GREP_MATCHES, MAX_GREP_MATCHES);
  const flags = options?.caseInsensitive ? "i" : "";
  const pattern = options?.literal === false
    ? new RegExp(trimmedQuery, flags)
    : null;

  const files: { absolute: string; relative: string }[] = [];
  if (targetStat.isFile()) {
    files.push({ absolute: resolved.absolute, relative: resolved.relative });
  } else if (targetStat.isDirectory()) {
    await collectFilesUnderDir(resolved.absolute, resolved.relative, files);
  } else {
    return { ok: false, error: `not a file or directory: ${resolved.relative}` };
  }

  const matches: WorkspaceGrepMatch[] = [];
  let truncated = false;

  for (const file of files) {
    if (matches.length >= maxMatches) {
      truncated = true;
      break;
    }
    const stream = createReadStream(file.absolute, { encoding: "utf8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let lineNo = 0;
    try {
      for await (const line of rl) {
        lineNo += 1;
        let hit = false;
        let column = 0;
        if (pattern) {
          const m = pattern.exec(line);
          if (m && m.index !== undefined) {
            hit = true;
            column = m.index + 1;
          }
        } else {
          const hay = options?.caseInsensitive ? line.toLowerCase() : line;
          const needle = options?.caseInsensitive
            ? trimmedQuery.toLowerCase()
            : trimmedQuery;
          const idx = hay.indexOf(needle);
          if (idx >= 0) {
            hit = true;
            column = idx + 1;
          }
        }
        if (!hit) continue;
        matches.push({
          path: file.relative.replace(/\\/g, "/"),
          line: lineNo,
          column,
          lineText: line.length > 500 ? `${line.slice(0, 500)}…` : line,
        });
        if (matches.length >= maxMatches) {
          truncated = true;
          break;
        }
      }
    } finally {
      stream.destroy();
      rl.close();
    }
    if (truncated) break;
  }

  return {
    ok: true,
    path: resolved.relative,
    matches,
    truncated,
    filesScanned: files.length,
  };
}

export async function editWorkspaceFile(
  inputPath: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): Promise<
  | { ok: true; path: string; replacements: number; matchLines?: number[] }
  | { ok: false; error: string; matchCount?: number; matchLines?: number[] }
> {
  if (!oldString) {
    return { ok: false, error: "oldString must not be empty." };
  }

  const resolved = resolveWorkspacePath(inputPath);
  if (!resolved.ok) return resolved;

  if (!existsSync(resolved.absolute)) {
    return { ok: false, error: `file not found: ${resolved.relative}` };
  }

  const fileStat = await stat(resolved.absolute);
  if (!fileStat.isFile()) {
    return { ok: false, error: `not a file: ${resolved.relative}` };
  }

  if (fileStat.size > MAX_EDIT_FILE_BYTES) {
    return {
      ok: false,
      error:
        `file is ${fileStat.size} bytes (max ${MAX_EDIT_FILE_BYTES} for edit). `
        + "Use workspace_action_file_search to locate anchors, edit smaller unique oldString spans, or split into files/.",
    };
  }

  const content = await readFile(resolved.absolute, "utf8");
  const matchCount = countSubstringOccurrences(content, oldString);
  if (matchCount === 0) {
    return {
      ok: false,
      error: `oldString not found in ${resolved.relative}. Read a slice with file_read (startLine/offset) before editing.`,
      matchCount: 0,
    };
  }

  if (!replaceAll && matchCount > 1) {
    const matchLines = lineNumbersForMatches(content, oldString, 5);
    return {
      ok: false,
      error:
        `oldString matches ${matchCount} times in ${resolved.relative} (lines: ${matchLines.join(", ")}). `
        + "Use a longer unique oldString from file_read, or replaceAll=true when intentional.",
      matchCount,
      matchLines,
    };
  }

  const replacements = matchCount;
  const next = replaceAll
    ? content.replaceAll(oldString, newString)
    : content.replace(oldString, newString);

  await writeFile(resolved.absolute, next, "utf8");
  const matchLines = replaceAll ? undefined : lineNumbersForMatches(content, oldString, 1);
  return { ok: true, path: resolved.relative, replacements, matchLines };
}

export type WorkspaceListEntry = {
  path: string;
  kind: "file" | "directory";
  sizeBytes?: number;
};

export async function listWorkspaceFiles(
  inputPath: string,
  options?: {
    recursive?: boolean;
    maxEntries?: number;
    /** When false, skip per-file stat (faster explorer tree scans). Default true. */
    includeFileSizes?: boolean;
  },
): Promise<
  | { ok: true; path: string; entries: WorkspaceListEntry[]; truncated: boolean }
  | { ok: false; error: string }
> {
  const resolved = resolveWorkspacePath(inputPath || ".");
  if (!resolved.ok) return resolved;

  if (!existsSync(resolved.absolute)) {
    return { ok: false, error: `path not found: ${resolved.relative}` };
  }

  const rootStat = await stat(resolved.absolute);
  const maxEntries = Math.min(options?.maxEntries ?? 200, MAX_LIST_ENTRIES);
  const includeFileSizes = options?.includeFileSizes ?? true;
  const entries: WorkspaceListEntry[] = [];
  let truncated = false;

  async function walk(dir: string, prefix: string): Promise<void> {
    if (truncated) return;
    const names = await readdir(dir, { withFileTypes: true });
    names.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of names) {
      if (truncated) break;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        entries.push({ path: rel, kind: "directory" });
        if (entries.length >= maxEntries) {
          truncated = true;
          break;
        }
        if (options?.recursive) {
          await walk(join(dir, entry.name), rel);
        }
        continue;
      }

      if (entry.isFile()) {
        let sizeBytes: number | undefined;
        if (includeFileSizes) {
          const full = join(dir, entry.name);
          const fileStat = await stat(full);
          sizeBytes = fileStat.size;
        }
        entries.push({
          path: rel,
          kind: "file",
          sizeBytes,
        });
        if (entries.length >= maxEntries) {
          truncated = true;
        }
      }
    }
  }

  if (rootStat.isDirectory()) {
    await walk(resolved.absolute, "");
  } else {
    entries.push({
      path: resolved.relative,
      kind: "file",
      sizeBytes: rootStat.size,
    });
  }

  return {
    ok: true,
    path: resolved.relative,
    entries,
    truncated,
  };
}
