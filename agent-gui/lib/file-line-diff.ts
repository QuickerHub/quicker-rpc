/** Line-level diff rows (Monaco / git unified style). */
export type LineDiffKind = "equal" | "insert" | "delete";

export type LineDiffRow = {
  kind: LineDiffKind;
  text: string;
};

function splitLinesForDiff(text: string): string[] {
  if (!text) return [];
  return text.split("\n");
}

/**
 * LCS-based line diff (same line granularity as Monaco DiffEditor).
 */
export function computeLineDiff(oldText: string, newText: string): LineDiffRow[] {
  const a = splitLinesForDiff(oldText);
  const b = splitLinesForDiff(newText);
  const n = a.length;
  const m = b.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array<number>(m + 1).fill(0),
  );

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const stack: LineDiffRow[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      stack.push({ kind: "equal", text: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ kind: "insert", text: b[j - 1] });
      j--;
    } else {
      stack.push({ kind: "delete", text: a[i - 1] });
      i--;
    }
  }

  return stack.reverse();
}

/**
 * Insert/delete line counts from LCS line diff (fast; no CodeMirror).
 * Used for tool-card +N/-N badges; collapse/merge view is separate.
 */
export function countLineDiffStats(
  oldText: string,
  newText: string,
): { addLines: number; removeLines: number } {
  let addLines = 0;
  let removeLines = 0;
  for (const row of computeLineDiff(oldText, newText)) {
    if (row.kind === "insert") addLines++;
    if (row.kind === "delete") removeLines++;
  }
  return { addLines, removeLines };
}

export function countUnifiedDiffDisplayLines(oldText: string, newText: string): number {
  const collapsed = buildCollapsedDiffTexts(oldText, newText);
  return collapsed.displayLineCount;
}

export const FILE_DIFF_CONTEXT_LINES = 3;
export const FILE_DIFF_MIN_EQUAL_COLLAPSE = 8;

export type FileDiffDisplay = {
  /** Collapsed old side for merge/diff editor. */
  removed: string;
  /** Collapsed new side for merge/diff editor. */
  added: string;
  addLines: number;
  removeLines: number;
  displayLineCount: number;
};

function joinDiffLines(lines: string[]): string {
  if (lines.length === 0) return "";
  return `${lines.join("\n")}\n`;
}

function collapseEqualTexts(
  texts: string[],
  contextLines: number,
  minCollapse: number,
  out: string[],
): void {
  if (texts.length < minCollapse) {
    out.push(...texts);
    return;
  }
  const head = texts.slice(0, contextLines);
  const tail = texts.slice(texts.length - contextLines);
  const omitted = texts.length - head.length - tail.length;
  out.push(...head, `… ${omitted} 行未修改 …`, ...tail);
}

const COLLAPSED_MARKER_RE = /^… \d+ 行未修改 …$/;

export function isCollapsedDiffContextLine(text: string): boolean {
  return COLLAPSED_MARKER_RE.test(text.trim());
}

/** Focus diff on changed hunks; collapse long unchanged runs (agent-style). */
export function buildCollapsedDiffTexts(
  oldText: string,
  newText: string,
  options?: { contextLines?: number; minEqualCollapse?: number },
): FileDiffDisplay {
  const contextLines = options?.contextLines ?? FILE_DIFF_CONTEXT_LINES;
  const minCollapse = options?.minEqualCollapse ?? FILE_DIFF_MIN_EQUAL_COLLAPSE;
  const rows = computeLineDiff(oldText, newText);
  let addLines = 0;
  let removeLines = 0;
  for (const row of rows) {
    if (row.kind === "insert") addLines++;
    if (row.kind === "delete") removeLines++;
  }

  const oldLines: string[] = [];
  const newLines: string[] = [];
  let idx = 0;

  while (idx < rows.length) {
    if (rows[idx].kind === "equal") {
      let end = idx;
      while (end < rows.length && rows[end].kind === "equal") end++;
      const texts = rows.slice(idx, end).map((row) => row.text);
      collapseEqualTexts(texts, contextLines, minCollapse, oldLines);
      collapseEqualTexts(texts, contextLines, minCollapse, newLines);
      idx = end;
      continue;
    }

    let end = idx;
    while (end < rows.length && rows[end].kind !== "equal") end++;
    for (let k = idx; k < end; k++) {
      const row = rows[k];
      if (row.kind === "delete") oldLines.push(row.text);
      if (row.kind === "insert") newLines.push(row.text);
    }
    idx = end;
  }

  const removed = joinDiffLines(oldLines);
  const added = joinDiffLines(newLines);
  const displayLineCount = Math.max(oldLines.length, newLines.length);

  return { removed, added, addLines, removeLines, displayLineCount };
}

function gutterSymbol(kind: LineDiffKind): string {
  switch (kind) {
    case "insert":
      return "+";
    case "delete":
      return "−";
    default:
      return " ";
  }
}

export function lineDiffGutterSymbol(kind: LineDiffKind): string {
  return gutterSymbol(kind);
}
