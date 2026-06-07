"use client";

import { useState } from "react";
import { ActionTraceTimelineRowView } from "@/components/action-trace/ActionTraceTimelineRow";
import { LoopTraceModule } from "@/components/action-trace/LoopTraceModule";
import type { ActionTraceEvent } from "@/lib/action-trace-format";
import type { RepeatStepTraceSectionModel } from "@/lib/action-trace-timeline-collapse";
import type { ActionTraceTimelineRow } from "@/lib/action-trace-timeline-model";

type RepeatStepTraceSectionProps = {
  model: RepeatStepTraceSectionModel;
  rows: ActionTraceTimelineRow[];
  events: ActionTraceEvent[];
  isLive: boolean;
  runningRowIndex: number | null;
};

export function RepeatStepTraceSection({
  model,
  rows,
  events,
  isLive,
  runningRowIndex,
}: RepeatStepTraceSectionProps) {
  const [open, setOpen] = useState(
    () => isLive || model.loopModule.status === "running",
  );

  return (
    <li
      className={[
        "action-trace-timeline__repeat-step",
        open ? "action-trace-timeline__repeat-step--open" : "",
        model.loopModule.status === "running"
          ? "action-trace-timeline__repeat-step--running"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ["--trace-depth" as string]: model.depth }}
    >
      <div className="repeat-step-trace">
        <button
          type="button"
          className="repeat-step-trace__head"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ActionTraceTimelineRowView row={model.beginRow} as="div" />
          <span className="repeat-step-trace__chevron" aria-hidden />
        </button>

        {open ? (
          <div className="repeat-step-trace__body">
            <ol className="repeat-step-trace__setup action-trace-timeline__list">
              {model.setupRows.map((row) => (
                <ActionTraceTimelineRowView
                  key={`repeat-setup-${row.index}-${row.event.sequence ?? 0}`}
                  row={row}
                />
              ))}
            </ol>

            <LoopTraceModule
              model={model.loopModule}
              rows={rows}
              events={events}
              isLive={isLive}
              runningRowIndex={runningRowIndex}
              embedded
            />

            {model.endRow ? (
              <ol className="repeat-step-trace__footer action-trace-timeline__list">
                <ActionTraceTimelineRowView row={model.endRow} />
              </ol>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
