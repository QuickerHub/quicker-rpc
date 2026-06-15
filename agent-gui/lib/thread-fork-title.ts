const FORK_TITLE_PREFIX_RE = /^\((\d+)\)\s+(.+)$/;

/** Strip outer `(N) ` fork prefixes; returns the root sidebar title. */
export function stripForkTitlePrefix(title: string): string {
  let current = title.trim();
  for (;;) {
    const match = current.match(FORK_TITLE_PREFIX_RE);
    if (!match) return current;
    current = match[2]!.trim();
  }
}

function parseForkTitlePrefix(title: string): number | null {
  const match = title.trim().match(FORK_TITLE_PREFIX_RE);
  if (!match) return null;
  const index = Number.parseInt(match[1]!, 10);
  return Number.isFinite(index) && index > 0 ? index : null;
}

/** Next fork title: `(1) base`, `(2) base`, … based on existing threads sharing the same base. */
export function deriveNextForkThreadTitle(
  existingTitles: readonly string[],
  sourceTitle: string,
): string {
  const baseTitle = stripForkTitlePrefix(sourceTitle) || "新对话";
  let maxForkIndex = 0;

  for (const title of existingTitles) {
    const trimmed = title.trim();
    if (stripForkTitlePrefix(trimmed) !== baseTitle) continue;
    if (trimmed === baseTitle) continue;
    const forkIndex = parseForkTitlePrefix(trimmed);
    if (forkIndex !== null) {
      maxForkIndex = Math.max(maxForkIndex, forkIndex);
    }
  }

  return `(${maxForkIndex + 1}) ${baseTitle}`;
}
