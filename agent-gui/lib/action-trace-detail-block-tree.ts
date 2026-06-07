import type { ActionTraceTimelineRow } from "@/lib/action-trace-timeline-model";

const BLOCK_BEGIN_TO_END: Record<string, string> = {
  group_begin: "group_end",
  step_begin: "step_end",
};

export type DetailTreeRow = {
  kind: "row";
  row: ActionTraceTimelineRow;
};

export type DetailTreeBlock = {
  kind: "block";
  id: string;
  blockType: "group" | "step";
  begin: ActionTraceTimelineRow;
  end: ActionTraceTimelineRow | null;
  children: DetailTreeNode[];
};

export type DetailTreeNode = DetailTreeRow | DetailTreeBlock;

export function isDetailTreeBlock(
  node: DetailTreeNode,
): node is DetailTreeBlock {
  return node.kind === "block";
}

export function buildDetailBlockTree(
  rows: ActionTraceTimelineRow[],
): DetailTreeNode[] {
  const items: DetailTreeNode[] = [];
  let index = 0;

  while (index < rows.length) {
    const row = rows[index];
    if (!row) {
      index += 1;
      continue;
    }

    const endKind = BLOCK_BEGIN_TO_END[row.kind];
    if (endKind) {
      let nestedDepth = 0;
      let endIndex = index + 1;

      while (endIndex < rows.length) {
        const current = rows[endIndex];
        if (!current) {
          endIndex += 1;
          continue;
        }
        if (current.kind === row.kind) nestedDepth += 1;
        else if (current.kind === endKind) {
          if (nestedDepth === 0) break;
          nestedDepth -= 1;
        }
        endIndex += 1;
      }

      const innerRows = rows.slice(index + 1, endIndex);
      const endRow = endIndex < rows.length ? rows[endIndex] ?? null : null;
      items.push({
        kind: "block",
        id: `trace-block-${row.index}-${row.kind}`,
        blockType: row.kind === "group_begin" ? "group" : "step",
        begin: row,
        end: endRow,
        children: buildDetailBlockTree(innerRows),
      });
      index = endRow ? endIndex + 1 : endIndex;
      continue;
    }

    items.push({ kind: "row", row });
    index += 1;
  }

  return items;
}

export function detailTreeNodeHasRunning(node: DetailTreeNode): boolean {
  if (node.kind === "row") return node.row.running;
  if (node.begin.running || node.end?.running) return true;
  return node.children.some(detailTreeNodeHasRunning);
}

export function collectRunningDetailBlockIds(
  nodes: DetailTreeNode[],
): string[] {
  const ids: string[] = [];
  const visit = (node: DetailTreeNode) => {
    if (node.kind !== "block") return;
    if (detailTreeNodeHasRunning(node)) ids.push(node.id);
    for (const child of node.children) visit(child);
  };
  for (const node of nodes) visit(node);
  return ids;
}

export function resolveDetailBlockHeaderRow(
  block: DetailTreeBlock,
  collapsed: boolean,
): ActionTraceTimelineRow {
  if (!collapsed) return block.begin;

  const elapsedMs = resolveDetailBlockElapsedMs(block);
  if (elapsedMs == null) return block.begin;

  return {
    ...block.begin,
    elapsedMs,
  };
}

function resolveDetailBlockElapsedMs(block: DetailTreeBlock): number | null {
  const values: number[] = [];
  const pushElapsed = (row: ActionTraceTimelineRow | null | undefined) => {
    if (row?.elapsedMs != null) values.push(row.elapsedMs);
  };

  pushElapsed(block.begin);
  pushElapsed(block.end);
  const visit = (node: DetailTreeNode) => {
    if (node.kind === "row") pushElapsed(node.row);
    else {
      pushElapsed(node.begin);
      pushElapsed(node.end);
      for (const child of node.children) visit(child);
    }
  };
  for (const child of block.children) visit(child);

  return values.length > 0 ? Math.max(...values) : null;
}

export function collectDetailBlockIds(nodes: DetailTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.kind !== "block") continue;
    ids.push(node.id);
    ids.push(...collectDetailBlockIds(node.children));
  }
  return ids;
}

export function toggleDetailBlockCollapsed(
  collapsedIds: ReadonlySet<string>,
  blockId: string,
): Set<string> {
  const next = new Set(collapsedIds);
  if (next.has(blockId)) next.delete(blockId);
  else next.add(blockId);
  return next;
}
