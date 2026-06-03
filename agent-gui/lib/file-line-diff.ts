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

/** Count inserted/deleted lines from a real line diff (not whole-block line counts). */
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
  return computeLineDiff(oldText, newText).length;
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
