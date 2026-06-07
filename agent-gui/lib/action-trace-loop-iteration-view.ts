import type { ActionTraceTimelineRow } from "@/lib/action-trace-timeline-model";

const SKIP_ROW_KINDS = new Set(["group_begin", "group_end"]);
const MIN_INNER_ROWS_TO_FOLD = 1;
const MIN_PREFIX_ROWS_TO_FOLD = 2;

export type CompactIterationRow = {
  kind: "row";
  row: ActionTraceTimelineRow;
};

export type CompactIterationFold = {
  kind: "fold";
  id: string;
  label: string;
  depth: number;
  rows: ActionTraceTimelineRow[];
  running: boolean;
};

export type CompactIterationItem = CompactIterationRow | CompactIterationFold;

export function buildCompactIterationView(
  rows: ActionTraceTimelineRow[],
): CompactIterationItem[] {
  const items: CompactIterationItem[] = [];
  let index = 0;

  while (index < rows.length) {
    if (SKIP_ROW_KINDS.has(rows[index]?.kind ?? "")) {
      index += 1;
      continue;
    }

    if (rows[index]?.kind === "step_begin") {
      const stepItems = readStepBlock(rows, index);
      items.push(...stepItems.items);
      index = stepItems.nextIndex;
      continue;
    }

    const prefix = readPrefixRows(rows, index);
    if (prefix.consumed > 0) {
      items.push(...prefix.items);
      index = prefix.nextIndex;
      continue;
    }

    const row = rows[index];
    if (row) items.push({ kind: "row", row });
    index += 1;
  }

  return items;
}

function readPrefixRows(
  rows: ActionTraceTimelineRow[],
  start: number,
): { items: CompactIterationItem[]; nextIndex: number; consumed: number } {
  const buffer: ActionTraceTimelineRow[] = [];
  let index = start;

  while (index < rows.length) {
    const row = rows[index];
    if (!row || row.kind === "step_begin" || SKIP_ROW_KINDS.has(row.kind)) {
      break;
    }
    buffer.push(row);
    index += 1;
  }

  if (buffer.length >= MIN_PREFIX_ROWS_TO_FOLD) {
    return {
      items: [
        {
          kind: "fold",
          id: `prefix-${buffer[0]?.index ?? start}`,
          label: formatFoldLabel("循环参数", buffer),
          depth: buffer[0]?.depth ?? 0,
          rows: buffer,
          running: buffer.some((row) => row.running),
        },
      ],
      nextIndex: index,
      consumed: buffer.length,
    };
  }

  if (buffer.length > 0) {
    return {
      items: buffer.map((row) => ({ kind: "row" as const, row })),
      nextIndex: index,
      consumed: buffer.length,
    };
  }

  return { items: [], nextIndex: start, consumed: 0 };
}

function readStepBlock(
  rows: ActionTraceTimelineRow[],
  start: number,
): { items: CompactIterationItem[]; nextIndex: number } {
  const begin = rows[start]!;
  const inner: ActionTraceTimelineRow[] = [];
  let index = start + 1;

  while (index < rows.length) {
    const row = rows[index];
    if (!row) break;
    if (row.kind === "step_end" && matchesStepEnd(begin, row)) {
      index += 1;
      break;
    }
    if (row.kind === "step_begin") break;
    if (SKIP_ROW_KINDS.has(row.kind)) {
      index += 1;
      continue;
    }
    inner.push(row);
    index += 1;
  }

  const stepName = begin.label.trim() || "step";
  const allRows = [begin, ...inner];
  const running = allRows.some((row) => row.running);

  if (inner.length >= MIN_INNER_ROWS_TO_FOLD) {
    return {
      items: [
        {
          kind: "fold",
          id: `step-${begin.index}-${begin.event.stepId ?? "unknown"}`,
          label: formatFoldLabel(stepName, inner),
          depth: begin.depth,
          rows: allRows,
          running,
        },
      ],
      nextIndex: index,
    };
  }

  return {
    items: allRows.map((row) => ({ kind: "row" as const, row })),
    nextIndex: index,
  };
}

function matchesStepEnd(
  begin: ActionTraceTimelineRow,
  end: ActionTraceTimelineRow,
): boolean {
  const beginId = begin.event.stepId?.trim();
  const endId = end.event.stepId?.trim();
  if (beginId && endId) return beginId === endId;
  return true;
}

function formatFoldLabel(
  title: string,
  rows: ActionTraceTimelineRow[],
): string {
  const outputs = rows.filter((row) => row.kind === "output");
  if (outputs.length > 0) {
    const summary = outputs
      .map((row) => row.label.trim())
      .filter(Boolean)
      .join(" · ");
    return summary ? `${title} · ${summary}` : title;
  }

  const inputs = rows.filter((row) => row.kind === "input");
  if (inputs.length > 0) {
    return `${title} · ${inputs.length} 条参数`;
  }

  return `${title} · ${rows.length} 条`;
}

export function expandIterationFold(
  expandedIds: ReadonlySet<string>,
  foldId: string,
): Set<string> {
  const next = new Set(expandedIds);
  next.add(foldId);
  return next;
}
