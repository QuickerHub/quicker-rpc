"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { LoopTraceDetailTree } from "@/components/action-trace/LoopTraceDetailTree";
import type { ActionTraceEvent } from "@/lib/action-trace-format";
import {
  buildDetailBlockTree,
  collectDetailBlockIds,
  collectRunningDetailBlockIds,
  toggleDetailBlockCollapsed,
} from "@/lib/action-trace-detail-block-tree";
import type {
  LoopIterationModel,
  LoopTraceModuleModel,
} from "@/lib/action-trace-loop-module-model";
import { buildLoopIterationDetailItems } from "@/lib/action-trace-timeline-collapse";
import type { ActionTraceTimelineRow } from "@/lib/action-trace-timeline-model";

type LoopTraceModuleProps = {
  model: LoopTraceModuleModel;
  rows: ActionTraceTimelineRow[];
  events: ActionTraceEvent[];
  isLive: boolean;
  runningRowIndex: number | null;
  /** Nested inside RepeatStepTraceSection; hides duplicate repeat-step header. */
  embedded?: boolean;
};

const LOOP_WRAPPER_ROW_KINDS = new Set(["repeat_begin", "repeat_end"]);

function formatModuleSummary(model: LoopTraceModuleModel): string {
  const count = model.config.count ?? model.iterations.length;
  const parts = [`${count} 次`];
  if (model.config.repeatDelayMs != null && model.config.repeatDelayMs > 0) {
    parts.push(`间隔 ${model.config.repeatDelayMs}ms`);
  }
  return parts.join(" · ");
}

function iterationStatusLabel(status: LoopIterationModel["status"]): string {
  switch (status) {
    case "running":
      return "进行中";
    case "done":
      return "完成";
    case "error":
      return "错误";
    default:
      return "等待";
  }
}

function buildIterationDetailRows(
  rows: ActionTraceTimelineRow[],
  events: ActionTraceEvent[],
  iteration: LoopIterationModel,
  isLive: boolean,
  runningRowIndex: number | null,
): ActionTraceTimelineRow[] {
  const items = buildLoopIterationDetailItems(
    rows,
    events,
    iteration.block,
    isLive,
    runningRowIndex,
  );

  const detailRows = items
    .filter(
      (item): item is { kind: "row"; row: ActionTraceTimelineRow } =>
        item.kind === "row",
    )
    .map((item) => item.row)
    .filter((row) => !LOOP_WRAPPER_ROW_KINDS.has(row.kind));

  if (!detailRows.length) return [];

  let minDepth = Infinity;
  for (const row of detailRows) {
    minDepth = Math.min(minDepth, row.depth);
  }
  if (!Number.isFinite(minDepth)) minDepth = 0;

  return detailRows.map((row) => ({
    ...row,
    depth: Math.max(0, row.depth - minDepth),
  }));
}

export function LoopTraceModule({
  model,
  rows,
  events,
  isLive,
  runningRowIndex,
  embedded = false,
}: LoopTraceModuleProps) {
  const [open, setOpen] = useState(
    () => embedded || isLive || model.status === "running",
  );
  const [selectedIndex, setSelectedIndex] = useState(
    () => model.activeIterationIndex ?? model.iterations[0]?.index ?? 0,
  );
  const [followLive, setFollowLive] = useState(isLive);
  const [jumpValue, setJumpValue] = useState("");

  const selectedIteration = useMemo(
    () =>
      model.iterations.find((iteration) => iteration.index === selectedIndex)
      ?? model.iterations[0]
      ?? null,
    [model.iterations, selectedIndex],
  );

  const detailRows = useMemo(() => {
    if (!selectedIteration) return [];
    return buildIterationDetailRows(
      rows,
      events,
      selectedIteration,
      isLive,
      runningRowIndex,
    );
  }, [selectedIteration, rows, events, isLive, runningRowIndex]);

  const detailTree = useMemo(
    () => buildDetailBlockTree(detailRows),
    [detailRows],
  );

  const [collapsedBlockIds, setCollapsedBlockIds] = useState<Set<string>>(
    () => new Set(collectDetailBlockIds(detailTree)),
  );

  const selectedPosition = useMemo(() => {
    const position = model.iterations.findIndex(
      (iteration) => iteration.index === selectedIndex,
    );
    return position >= 0 ? position : 0;
  }, [model.iterations, selectedIndex]);

  useEffect(() => {
    if (!followLive || !isLive) return;
    if (model.activeIterationIndex == null) return;
    setSelectedIndex(model.activeIterationIndex);
  }, [followLive, isLive, model.activeIterationIndex]);

  useEffect(() => {
    setCollapsedBlockIds(new Set(collectDetailBlockIds(detailTree)));
  }, [selectedIndex, detailTree]);

  useEffect(() => {
    if (!isLive) return;
    const runningBlockIds = collectRunningDetailBlockIds(detailTree);
    if (!runningBlockIds.length) return;
    setCollapsedBlockIds((current) => {
      const next = new Set(current);
      for (const blockId of runningBlockIds) {
        next.delete(blockId);
      }
      return next;
    });
  }, [detailTree, isLive]);

  const toggleBlock = useCallback((blockId: string) => {
    setCollapsedBlockIds((current) =>
      toggleDetailBlockCollapsed(current, blockId),
    );
  }, []);

  const selectByPosition = useCallback(
    (position: number) => {
      const iteration = model.iterations[position];
      if (!iteration) return;
      setFollowLive(false);
      setSelectedIndex(iteration.index);
    },
    [model.iterations],
  );

  const goPrev = useCallback(() => {
    selectByPosition(Math.max(0, selectedPosition - 1));
  }, [selectByPosition, selectedPosition]);

  const goNext = useCallback(() => {
    selectByPosition(
      Math.min(model.iterations.length - 1, selectedPosition + 1),
    );
  }, [model.iterations.length, selectByPosition, selectedPosition]);

  const submitJump = useCallback(() => {
    const parsed = Number(jumpValue.trim());
    if (!Number.isFinite(parsed)) return;
    const iteration = model.iterations.find((item) => item.index === parsed)
      ?? model.iterations[parsed];
    if (!iteration) return;
    setFollowLive(false);
    setSelectedIndex(iteration.index);
    setJumpValue("");
  }, [jumpValue, model.iterations]);

  const showScrubber = model.iterations.length > 1;
  const toolbarMeta = selectedIteration
    ? [
        iterationStatusLabel(selectedIteration.status),
        selectedIteration.elapsedMs != null
          ? `${selectedIteration.elapsedMs}ms`
          : null,
        selectedIteration.stepSummary,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const body = (
    <div className="loop-trace-module__body">
      <div className="loop-trace-module__toolbar">
        <div className="loop-trace-module__nav">
          <button
            type="button"
            className="loop-trace-module__nav-btn"
            disabled={selectedPosition <= 0}
            onClick={goPrev}
            aria-label="上一次循环"
          >
            ◀
          </button>
          <span className="loop-trace-module__nav-pos">
            #{selectedIteration?.index ?? selectedIndex}
            <span className="tool-muted">
              {" "}
              {selectedPosition + 1}/{model.iterations.length}
            </span>
          </span>
          <button
            type="button"
            className="loop-trace-module__nav-btn"
            disabled={selectedPosition >= model.iterations.length - 1}
            onClick={goNext}
            aria-label="下一次循环"
          >
            ▶
          </button>
          <input
            type="text"
            className="loop-trace-module__jump-input"
            value={jumpValue}
            placeholder="#"
            aria-label="跳转到循环序号"
            onChange={(event) => setJumpValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitJump();
              }
            }}
          />
          {isLive ? (
            <label className="loop-trace-module__follow">
              <input
                type="checkbox"
                checked={followLive}
                onChange={(event) => setFollowLive(event.target.checked)}
              />
              跟随
            </label>
          ) : null}
        </div>

        {showScrubber ? (
          <input
            type="range"
            className="loop-trace-module__scrub"
            min={0}
            max={model.iterations.length - 1}
            step={1}
            value={selectedPosition}
            aria-label="循环序号滑块"
            onChange={(event) => {
              selectByPosition(Number(event.target.value));
            }}
          />
        ) : null}

        {toolbarMeta ? (
          <p className="loop-trace-module__toolbar-meta tool-muted">
            {toolbarMeta}
          </p>
        ) : null}
      </div>

      <ol className="loop-trace-module__detail action-trace-timeline__list">
        <LoopTraceDetailTree
          nodes={detailTree}
          collapsedBlockIds={collapsedBlockIds}
          onToggleBlock={toggleBlock}
        />
      </ol>
    </div>
  );

  if (embedded) {
    return (
      <div
        className={[
          "loop-trace-module",
          "loop-trace-module--embedded",
          open ? "loop-trace-module--open" : "loop-trace-module--closed",
          model.status === "running" ? "loop-trace-module--running" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <button
          type="button"
          className="loop-trace-module__embedded-head"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="loop-trace-module__embedded-title">
            循环体
            <span className="tool-muted"> · {formatModuleSummary(model)}</span>
          </span>
          <span className="loop-trace-module__chevron" aria-hidden />
        </button>
        {open ? body : null}
      </div>
    );
  }

  return (
    <li
      className="action-trace-timeline__loop-module"
      style={{ ["--trace-depth" as string]: model.depth }}
    >
      <div
        className={[
          "loop-trace-module",
          open ? "loop-trace-module--open" : "loop-trace-module--closed",
          model.status === "running" ? "loop-trace-module--running" : "",
          model.status === "error" ? "loop-trace-module--error" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <button
          type="button"
          className="loop-trace-module__head"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="loop-trace-module__badge" aria-hidden>
            ↻
          </span>
          <span className="loop-trace-module__title">
            <span className="loop-trace-module__name">{model.stepName}</span>
            <span className="loop-trace-module__meta tool-muted">
              {formatModuleSummary(model)}
            </span>
          </span>
          <span className="loop-trace-module__chevron" aria-hidden />
        </button>
        {open ? body : null}
      </div>
    </li>
  );
}
