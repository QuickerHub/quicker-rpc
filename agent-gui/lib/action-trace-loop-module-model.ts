import type { ActionTraceEvent } from "@/lib/action-trace-format";
import {
  collectLoopStepNames,
  type TraceBlock,
} from "@/lib/action-trace-timeline-collapse";
import type { ActionTraceTimelineRow } from "@/lib/action-trace-timeline-model";

export type LoopIterationStatus = "pending" | "running" | "done" | "error";

export type LoopIterationModel = {
  id: string;
  index: number;
  label: string;
  stepSummary: string;
  elapsedMs?: number;
  status: LoopIterationStatus;
  eventStart: number;
  eventEnd: number;
  block: TraceBlock;
};

export type LoopTraceModuleModel = {
  id: string;
  stepName: string;
  stepId?: string;
  depth: number;
  config: {
    count?: number;
    startIndex?: number;
    repeatDelayMs?: number;
  };
  iterations: LoopIterationModel[];
  activeIterationIndex: number | null;
  status: "idle" | "running" | "done" | "error";
  totalElapsedMs?: number;
};

const REPEAT_STEP_KEY = "sys:repeat";

export function parseLoopIterationIndex(
  note: string | null | undefined,
): number | null {
  const match = note?.match(/第\s*(\d+)\s*次循环/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function findRepeatStepLoopGroup(
  stepBlock: TraceBlock,
): TraceBlock | null {
  for (const child of stepBlock.children) {
    if (child.type !== "group") continue;
    const repeatChildren = child.children.filter(
      (block) => block.type === "repeat",
    );
    if (repeatChildren.length >= 1) {
      return child;
    }
  }
  return null;
}

export function isRepeatStepLoopModule(
  stepBlock: TraceBlock,
  events: ActionTraceEvent[],
): boolean {
  const begin = events[stepBlock.start];
  if (begin?.stepRunnerKey !== REPEAT_STEP_KEY) return false;
  return findRepeatStepLoopGroup(stepBlock) != null;
}

export function buildLoopTraceModuleModel(
  stepBlock: TraceBlock,
  loopGroup: TraceBlock,
  events: ActionTraceEvent[],
  isLive: boolean,
  runningRowIndex: number | null,
): LoopTraceModuleModel {
  const begin = events[stepBlock.start];
  const iterations = loopGroup.children
    .filter((block) => block.type === "repeat")
    .map((block, ordinal) =>
      buildLoopIterationModel(
        block,
        events,
        runningRowIndex,
        ordinal,
      ),
    );

  const activeIterationIndex = resolveActiveIterationIndex(
    iterations,
    isLive,
    runningRowIndex,
  );
  const moduleStatus = resolveModuleStatus(iterations, isLive, stepBlock, events);
  const endEvent = events[stepBlock.end];

  return {
    id: `loop-module-${stepBlock.id}`,
    stepName:
      begin?.stepRunnerName?.trim()
      || begin?.stepRunnerKey?.trim()
      || "重复",
    stepId: begin?.stepId?.trim() || undefined,
    depth: (begin?.depth ?? 0) + 1,
    config: readRepeatStepConfig(events, stepBlock, loopGroup.start),
    iterations,
    activeIterationIndex,
    status: moduleStatus,
    totalElapsedMs:
      (endEvent?.elapsedMs ?? 0) > 0 ? endEvent.elapsedMs : undefined,
  };
}

function buildLoopIterationModel(
  block: TraceBlock,
  events: ActionTraceEvent[],
  runningRowIndex: number | null,
  ordinal: number,
): LoopIterationModel {
  const begin = events[block.start];
  const end = events[block.end];
  const note = begin?.note?.trim();
  const index = parseLoopIterationIndex(note) ?? ordinal;
  const label = note || `第 ${index} 次循环`;
  const stepSummary = collectLoopStepNames(block, events).join(" → ")
    || `${countBodySteps(block)} 步`;
  const hasError = events
    .slice(block.start, block.end + 1)
    .some((event) => event.kind === "error");
  const isRunning = runningRowIndex != null
    && runningRowIndex >= block.start
    && runningRowIndex <= block.end;
  const isDone = block.end > block.start;

  let status: LoopIterationStatus = "pending";
  if (hasError) status = "error";
  else if (isRunning) status = "running";
  else if (isDone) status = "done";

  return {
    id: block.id,
    index,
    label,
    stepSummary,
    elapsedMs: (end?.elapsedMs ?? 0) > 0 ? end?.elapsedMs : undefined,
    status,
    eventStart: block.start,
    eventEnd: block.end,
    block,
  };
}

function countBodySteps(block: TraceBlock): number {
  let count = 0;
  const visit = (node: TraceBlock) => {
    if (node.type === "step") {
      count += 1;
      return;
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  for (const child of block.children) {
    visit(child);
  }
  return count;
}

function resolveActiveIterationIndex(
  iterations: LoopIterationModel[],
  isLive: boolean,
  runningRowIndex: number | null,
): number | null {
  if (!iterations.length) return null;

  if (runningRowIndex != null) {
    const running = iterations.find(
      (iteration) =>
        runningRowIndex >= iteration.eventStart
        && runningRowIndex <= iteration.eventEnd,
    );
    if (running) return running.index;
  }

  if (isLive) {
    const lastDone = [...iterations].reverse().find(
      (iteration) => iteration.status === "done" || iteration.status === "error",
    );
    if (lastDone) return lastDone.index;
    return iterations[0]?.index ?? null;
  }

  return iterations[iterations.length - 1]?.index ?? null;
}

function resolveModuleStatus(
  iterations: LoopIterationModel[],
  isLive: boolean,
  stepBlock: TraceBlock,
  events: ActionTraceEvent[],
): LoopTraceModuleModel["status"] {
  if (iterations.some((iteration) => iteration.status === "error")) {
    return "error";
  }
  if (iterations.some((iteration) => iteration.status === "running")) {
    return "running";
  }
  if (isLive && stepBlock.end <= stepBlock.start) {
    return "running";
  }
  if (isLive && iterations.some((iteration) => iteration.status === "pending")) {
    return "running";
  }
  const stepEnded = stepBlock.end > stepBlock.start
    && events[stepBlock.end]?.kind === "step_end";
  if (stepEnded) return "done";
  if (isLive) return "running";
  return iterations.length > 0 ? "done" : "idle";
}

export function collectRepeatSetupRows(
  rows: ActionTraceTimelineRow[],
  stepBlock: TraceBlock,
  loopGroupStart: number,
): ActionTraceTimelineRow[] {
  const setup: ActionTraceTimelineRow[] = [];
  for (let index = stepBlock.start + 1; index < loopGroupStart; index += 1) {
    const row = rows[index];
    if (row) setup.push(row);
  }
  return normalizeRepeatStepRowDepth(setup, stepBlock, rows);
}

export function collectRepeatEndRow(
  rows: ActionTraceTimelineRow[],
  stepBlock: TraceBlock,
): ActionTraceTimelineRow | undefined {
  if (stepBlock.end <= stepBlock.start) return undefined;
  const row = rows[stepBlock.end];
  if (!row || row.kind !== "step_end") return undefined;
  const begin = rows[stepBlock.start];
  const baseDepth = begin?.depth ?? row.depth;
  return {
    ...row,
    depth: Math.max(0, row.depth - baseDepth),
  };
}

export function normalizeRepeatStepRowDepth(
  rows: ActionTraceTimelineRow[],
  stepBlock: TraceBlock,
  allRows: ActionTraceTimelineRow[],
): ActionTraceTimelineRow[] {
  if (!rows.length) return [];
  const begin = allRows[stepBlock.start];
  const baseDepth = begin?.depth ?? rows[0]?.depth ?? 0;
  return rows.map((row) => ({
    ...row,
    depth: Math.max(0, row.depth - baseDepth),
  }));
}

function readRepeatStepConfig(
  events: ActionTraceEvent[],
  stepBlock: TraceBlock,
  loopGroupStart: number,
): LoopTraceModuleModel["config"] {
  const config: LoopTraceModuleModel["config"] = {};
  for (let index = stepBlock.start + 1; index < loopGroupStart; index += 1) {
    const event = events[index];
    if (event?.kind !== "input") continue;
    const key = event.paramKey?.trim();
    const value = event.paramValue?.trim();
    if (!key || !value) continue;
    if (key === "count") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) config.count = parsed;
    } else if (key === "startIndex") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) config.startIndex = parsed;
    } else if (key === "repeatDelayMs") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) config.repeatDelayMs = parsed;
    }
  }
  return config;
}

/** Event indices owned by repeat-step loop bodies; hide from the main timeline. */
export function collectLoopModuleHiddenIndices(
  events: ActionTraceEvent[],
  blocks: TraceBlock[],
): Set<number> {
  const hidden = new Set<number>();

  const visit = (nodes: TraceBlock[]) => {
    for (const block of nodes) {
      if (block.type === "step" && isRepeatStepLoopModule(block, events)) {
        const loopGroup = findRepeatStepLoopGroup(block);
        if (loopGroup) {
          for (let index = loopGroup.start; index <= loopGroup.end; index += 1) {
            hidden.add(index);
          }
        }
      }
      visit(block.children);
    }
  };

  visit(blocks);
  return hidden;
}
