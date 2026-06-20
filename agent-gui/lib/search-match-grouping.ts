export type GroupedPathHits<Hit> = {
  path: string;
  hits: Hit[];
};

/** Merge flat per-line matches into per-file hit arrays (preserves first-seen file order). */
export function groupMatchesByPath<Hit, Match extends { path: string } & Hit>(
  matches: Match[],
  pickHit: (match: Match) => Hit,
): GroupedPathHits<Hit>[] {
  const order: string[] = [];
  const map = new Map<string, Hit[]>();
  for (const match of matches) {
    if (!map.has(match.path)) {
      order.push(match.path);
      map.set(match.path, []);
    }
    map.get(match.path)!.push(pickHit(match));
  }
  return order.map((path) => ({ path, hits: map.get(path)! }));
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Count line hits in grouped or legacy flat match payloads. */
export function countSearchMatchHits(matches: unknown[]): number {
  let total = 0;
  for (const item of matches) {
    const row = readRecord(item);
    if (!row) continue;
    if (Array.isArray(row.hits)) {
      total += row.hits.length;
    } else if (typeof row.line === "number" || typeof row.content === "string") {
      total += 1;
    } else {
      total += 1;
    }
  }
  return total;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

type FlatGrepMatch = {
  path: string;
  line?: number;
  content?: string;
  count?: number;
};

/**
 * Normalize grep matches to `{ path, hits[] }` — merges flat rows and duplicate paths.
 */
export function normalizeGrepMatchesByPath(
  matches: unknown[],
): GroupedPathHits<Record<string, unknown>>[] {
  const flat: FlatGrepMatch[] = [];
  for (const item of matches) {
    const row = readRecord(item);
    if (!row) continue;
    const path = readString(row.path);
    if (!path) continue;
    if (Array.isArray(row.hits)) {
      for (const hit of row.hits) {
        const hitRow = readRecord(hit);
        if (!hitRow) continue;
        flat.push({
          path,
          ...(typeof hitRow.line === "number" ? { line: hitRow.line } : {}),
          ...(typeof hitRow.content === "string" ? { content: hitRow.content } : {}),
          ...(typeof hitRow.count === "number" ? { count: hitRow.count } : {}),
        });
      }
    } else {
      flat.push({
        path,
        ...(typeof row.line === "number" ? { line: row.line } : {}),
        ...(typeof row.content === "string" ? { content: row.content } : {}),
        ...(typeof row.count === "number" ? { count: row.count } : {}),
      });
    }
  }
  return groupMatchesByPath(flat, (match) => {
    const hit: Record<string, unknown> = {};
    if (match.line != null) hit.line = match.line;
    if (match.content != null) hit.content = match.content;
    if (match.count != null) hit.count = match.count;
    return hit;
  });
}
