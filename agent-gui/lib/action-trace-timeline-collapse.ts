import type { ActionTraceEvent } from "@/lib/action-trace-format";
import {
  buildLoopTraceModuleModel,
  collectLoopModuleHiddenIndices,
  collectRepeatEndRow,
  collectRepeatSetupRows,
  findRepeatStepLoopGroup,
  isRepeatStepLoopModule,
  type LoopTraceModuleModel,
} from "@/lib/action-trace-loop-module-model";
import type { ActionTraceTimelineRow } from "@/lib/action-trace-timeline-model";
import { formatTraceTimelineLabel } from "@/lib/action-trace-timeline-model";

const BEGIN_KIND_TO_BLOCK: Record<string, TraceBlockType> = {
  file_begin: "file",
  repeat_begin: "repeat",
  group_begin: "group",
  step_begin: "step",
};

const END_KIND_TO_BLOCK: Record<string, TraceBlockType> = {
  file_end: "file",
  repeat_end: "repeat",
  group_end: "group",
  step_end: "step",
};

export type TraceBlockType = "file" | "repeat" | "group" | "step" | "root";

export type TraceBlock = {
  id: string;
  type: TraceBlockType;
  start: number;
  end: number;
  depth: number;
  children: TraceBlock[];
};

export type TimelineDisplayRow = {
  kind: "row";
  row: ActionTraceTimelineRow;
};

export type TimelineLoopModule = {
  kind: "loop-module";
  model: LoopTraceModuleModel;
};

export type RepeatStepTraceSectionModel = {
  id: string;
  depth: number;
  beginRow: ActionTraceTimelineRow;
  setupRows: ActionTraceTimelineRow[];
  loopModule: LoopTraceModuleModel;
  endRow?: ActionTraceTimelineRow;
};

export type TimelineRepeatStepSection = {
  kind: "repeat-step-section";
  model: RepeatStepTraceSectionModel;
};

export type TimelineDisplayItem =
  | TimelineDisplayRow
  | TimelineLoopModule
  | TimelineRepeatStepSection;

type BuildContext = {
  rows: ActionTraceTimelineRow[];
  events: ActionTraceEvent[];
  isLive: boolean;
  runningRowIndex: number | null;
  loopHiddenIndices: ReadonlySet<number>;
  detailView: boolean;
};

export function parseTraceBlocks(events: ActionTraceEvent[]): TraceBlock[] {
  const root: TraceBlock = {
    id: "root",
    type: "root",
    start: 0,
    end: Math.max(0, events.length - 1),
    depth: -1,
    children: [],
  };
  const stack: TraceBlock[] = [root];

  for (let index = 0; index < events.length; index += 1) {
    const kind = events[index]?.kind ?? "";
    const blockType = BEGIN_KIND_TO_BLOCK[kind];
    if (blockType) {
      const block: TraceBlock = {
        id: `${kind}-${index}`,
        type: blockType,
        start: index,
        end: index,
        depth: events[index]?.depth ?? 0,
        children: [],
      };
      stack[stack.length - 1]?.children.push(block);
      stack.push(block);
      continue;
    }

    const endType = END_KIND_TO_BLOCK[kind];
    if (!endType) continue;

    for (let depth = stack.length - 1; depth >= 1; depth -= 1) {
      const block = stack[depth];
      if (!block || block.type !== endType) continue;
      block.end = index;
      stack.length = depth;
      break;
    }
  }

  return root.children;
}

export function blockSummaryLabel(
  block: TraceBlock,
  events: ActionTraceEvent[],
): string {
  const begin = events[block.start];
  if (!begin) return block.type;
  return formatTraceTimelineLabel(begin);
}

export function buildTimelineDisplayItems(
  rows: ActionTraceTimelineRow[],
  events: ActionTraceEvent[],
  isLive: boolean,
  runningRowIndex: number | null,
): TimelineDisplayItem[] {
  const blocks = parseTraceBlocks(events);
  if (!rows.length) return [];

  const ctx: BuildContext = {
    rows,
    events,
    isLive,
    runningRowIndex,
    loopHiddenIndices: collectLoopModuleHiddenIndices(events, blocks),
    detailView: false,
  };
  return renderRange(0, rows.length - 1, blocks, ctx);
}

function isHiddenIndex(ctx: BuildContext, index: number): boolean {
  return !ctx.detailView && ctx.loopHiddenIndices.has(index);
}

function renderRange(
  start: number,
  end: number,
  blocks: TraceBlock[],
  ctx: BuildContext,
): TimelineDisplayItem[] {
  const items: TimelineDisplayItem[] = [];
  const childByStart = new Map(
    blocks.map((block) => [block.start, block] as const),
  );

  for (let index = start; index <= end; ) {
    if (isHiddenIndex(ctx, index)) {
      index += 1;
      continue;
    }

    const block = childByStart.get(index);
    if (block) {
      if (isHiddenIndex(ctx, block.start)) {
        index = block.end + 1;
        continue;
      }
      items.push(...renderBlock(block, ctx));
      index = block.end + 1;
      continue;
    }

    const row = ctx.rows[index];
    if (row) items.push({ kind: "row", row });
    index += 1;
  }

  return items;
}

function renderBlock(
  block: TraceBlock,
  ctx: BuildContext,
): TimelineDisplayItem[] {
  if (!ctx.detailView && isHiddenIndex(ctx, block.start)) {
    return [];
  }

  if (block.type === "repeat") {
    return renderRepeatBlock(block, ctx);
  }

  if (block.type === "step") {
    return renderStepBlock(block, ctx);
  }

  const items: TimelineDisplayItem[] = [];
  const beginRow = ctx.rows[block.start];
  if (beginRow && !isHiddenIndex(ctx, block.start)) {
    items.push({ kind: "row", row: beginRow });
  }

  if (block.end > block.start + 1) {
    items.push(
      ...renderRange(
        block.start + 1,
        block.end - 1,
        block.children,
        ctx,
      ),
    );
  }

  if (block.end > block.start) {
    const endRow = ctx.rows[block.end];
    if (endRow && !isHiddenIndex(ctx, block.end)) {
      items.push({ kind: "row", row: endRow });
    }
  }
  return items;
}

function renderRepeatBlock(
  block: TraceBlock,
  ctx: BuildContext,
): TimelineDisplayItem[] {
  if (!ctx.detailView && isHiddenIndex(ctx, block.start)) {
    return [];
  }

  const items: TimelineDisplayItem[] = [];
  const beginRow = ctx.rows[block.start];
  if (beginRow) items.push({ kind: "row", row: beginRow });

  if (block.end > block.start + 1) {
    items.push(
      ...renderRange(
        block.start + 1,
        block.end - 1,
        block.children,
        ctx,
      ),
    );
  }

  if (block.end > block.start) {
    const endRow = ctx.rows[block.end];
    if (endRow) items.push({ kind: "row", row: endRow });
  }
  return items;
}

function renderStepBlock(
  block: TraceBlock,
  ctx: BuildContext,
): TimelineDisplayItem[] {
  const items: TimelineDisplayItem[] = [];

  const loopGroup = isRepeatStepLoopModule(block, ctx.events)
    ? findRepeatStepLoopGroup(block)
    : null;
  const loopModule = loopGroup
    ? buildLoopTraceModuleModel(
        block,
        loopGroup,
        ctx.events,
        ctx.isLive,
        ctx.runningRowIndex,
      )
    : null;

  if (loopModule && loopGroup) {
    const beginRow = ctx.rows[block.start];
    if (!beginRow) return items;
    const baseDepth = beginRow.depth;
    items.push({
      kind: "repeat-step-section",
      model: {
        id: `repeat-step-${block.id}`,
        depth: baseDepth,
        beginRow: {
          ...beginRow,
          depth: 0,
        },
        setupRows: collectRepeatSetupRows(
          ctx.rows,
          block,
          loopGroup.start,
        ),
        loopModule,
        endRow: collectRepeatEndRow(ctx.rows, block),
      },
    });
    return items;
  }

  const beginRow = ctx.rows[block.start];
  if (beginRow) items.push({ kind: "row", row: beginRow });

  if (block.children.length > 0 && block.end > block.start + 1) {
    items.push(
      ...renderRange(
        block.start + 1,
        block.end - 1,
        block.children,
        ctx,
      ),
    );
  } else if (block.end > block.start + 1) {
    items.push(...renderRange(block.start + 1, block.end - 1, [], ctx));
  }

  if (block.end > block.start) {
    const endRow = ctx.rows[block.end];
    if (endRow) items.push({ kind: "row", row: endRow });
  }
  return items;
}

/** Full timeline rows for one loop iteration (inside LoopTraceModule). */
export function buildLoopIterationDetailItems(
  rows: ActionTraceTimelineRow[],
  events: ActionTraceEvent[],
  iterationBlock: TraceBlock,
  isLive: boolean,
  runningRowIndex: number | null,
): TimelineDisplayItem[] {
  const blocks = parseTraceBlocks(events);
  const ctx: BuildContext = {
    rows,
    events,
    isLive,
    runningRowIndex,
    loopHiddenIndices: new Set(),
    detailView: true,
  };
  return renderRepeatBlock(iterationBlock, ctx);
}

export function collectLoopStepNames(
  block: TraceBlock,
  events: ActionTraceEvent[],
): string[] {
  const names: string[] = [];
  const visit = (node: TraceBlock) => {
    if (node.type === "step") {
      const name = events[node.start]?.stepRunnerName?.trim()
        || events[node.start]?.stepRunnerKey?.trim();
      if (name) names.push(name);
      return;
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  for (const child of block.children) {
    visit(child);
  }
  return names;
}
