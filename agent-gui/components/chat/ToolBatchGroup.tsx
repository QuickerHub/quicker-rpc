"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChatAddToolApproveResponseFunction } from "ai";
import {
  buildToolBatchSummary,
  type ToolUiPartAnalysis,
} from "./tool-part-layout";
import { ToolPart } from "./ToolPart";

type ToolBatchGroupProps = {
  items: ToolUiPartAnalysis[];
  addToolApprovalResponse?: ChatAddToolApproveResponseFunction;
  approvalDisabled?: boolean;
};

export function ToolBatchGroup({
  items,
  addToolApprovalResponse,
  approvalDisabled,
}: ToolBatchGroupProps) {
  const summary = useMemo(() => buildToolBatchSummary(items), [items]);
  const [open, setOpen] = useState(() => summary.needsAttention);

  useEffect(() => {
    if (summary.allTerminal && !summary.needsAttention) {
      setOpen(false);
      return;
    }
    if (summary.needsAttention) {
      setOpen(true);
    }
  }, [summary.allTerminal, summary.needsAttention]);

  const batchRunning = items.some((i) => i.isRunning);
  const batchErr = items.some((i) => i.state === "output-error");
  const batchApproval = items.some((i) => i.state === "approval-requested");

  return (
    <details
      className="tool-batch"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="tool-batch-summary">
        <span className="tool-title">
          <span className="tool-name">{summary.title}</span>
          <span
            className={`tool-meta${batchRunning ? " tool-meta--running" : ""}${batchErr ? " tool-meta--err" : ""}${batchApproval ? " tool-meta--approval" : ""}`}
          >
            {summary.meta}
          </span>
          <span className="tool-chevron" aria-hidden />
        </span>
      </summary>
      {open && (
        <div className="tool-batch-body">
          {items.map((item) => (
            <ToolPart
              key={item.index}
              part={item.part}
              inBatch
              batchOpen={open}
              addToolApprovalResponse={addToolApprovalResponse}
              approvalDisabled={approvalDisabled}
            />
          ))}
        </div>
      )}
    </details>
  );
}
