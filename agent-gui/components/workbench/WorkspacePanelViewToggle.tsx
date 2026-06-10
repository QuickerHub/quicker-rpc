"use client";

import type { WorkspacePanelView } from "@/lib/explorer-prefs";

type WorkspacePanelViewToggleProps = {
  value: WorkspacePanelView;
  changedCount: number;
  onChange: (view: WorkspacePanelView) => void;
};

export function WorkspacePanelViewToggle({
  value,
  changedCount,
  onChange,
}: WorkspacePanelViewToggleProps) {
  return (
    <div className="workbench-view-toggle" role="tablist" aria-label="工作区视图">
      <button
        type="button"
        role="tab"
        className={`workbench-view-toggle__btn${value === "changed" ? " workbench-view-toggle__btn--active" : ""}`}
        aria-selected={value === "changed"}
        onClick={() => onChange("changed")}
      >
        已改动
        {changedCount > 0 ? (
          <span className="workbench-view-toggle__badge">{changedCount}</span>
        ) : null}
      </button>
      <button
        type="button"
        role="tab"
        className={`workbench-view-toggle__btn${value === "all" ? " workbench-view-toggle__btn--active" : ""}`}
        aria-selected={value === "all"}
        onClick={() => onChange("all")}
      >
        全部
      </button>
    </div>
  );
}
