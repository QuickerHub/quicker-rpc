import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { MAX_GREP_MATCHES } from "@/lib/workspace-file-helpers";

export type TextGrepMatch = {
  path: string;
  line: number;
  column: number;
  lineText: string;
};

export type TextGrepOptions = {
  maxMatches?: number;
  caseInsensitive?: boolean;
  /** When false, query is treated as a RegExp pattern. Default true (literal). */
  literal?: boolean;
};

/** Line-oriented grep over an explicit file list (shared by workspace + indexed docs). */
export async function grepTextFiles(
  files: readonly { absolute: string; relative: string }[],
  query: string,
  options?: TextGrepOptions,
): Promise<{
  matches: TextGrepMatch[];
  truncated: boolean;
  filesScanned: number;
}> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return { matches: [], truncated: false, filesScanned: 0 };
  }

  const maxMatches = Math.min(
    options?.maxMatches ?? MAX_GREP_MATCHES,
    MAX_GREP_MATCHES,
  );
  const flags = options?.caseInsensitive ? "i" : "";
  const pattern = options?.literal === false
    ? new RegExp(trimmedQuery, flags)
    : null;

  const matches: TextGrepMatch[] = [];
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

  return { matches, truncated, filesScanned: files.length };
}
