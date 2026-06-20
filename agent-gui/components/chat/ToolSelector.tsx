"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useMountedAriaControlsId } from "@/lib/use-mounted-aria-controls-id";
import {
  defaultEnabledToolIds,
  pickerVisibleTools,
  QKRPC_TOOL_REGISTRY,
  storeEnabledTools,
  TOOL_CATEGORY_LABELS,
  TOOL_CATEGORY_ORDER_BY_GROUP,
  TOOL_GROUP_LABELS,
  toolsInCategory,
  type ToolCategoryId,
  type ToolGroupId,
} from "@/lib/tool-registry";

type ToolSelectorProps = {
  enabledTools: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

const GROUP_ORDER: ToolGroupId[] = ["read", "write", "destructive"];

function countEnabledInSet(ids: string[], enabledSet: Set<string>): number {
  return ids.filter((id) => enabledSet.has(id)).length;
}

export const ToolSelector = memo(function ToolSelector({
  enabledTools,
  onChange,
  disabled,
}: ToolSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useMountedAriaControlsId();
  const enabledSet = new Set(enabledTools);
  const visibleTools = pickerVisibleTools();
  const writeOff = !GROUP_ORDER.slice(1).some((g) =>
    visibleTools.some((t) => t.group === g && enabledSet.has(t.id)),
  );
  const totalTools = visibleTools.length;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const applyIds = (next: Set<string>) => {
    const ids = QKRPC_TOOL_REGISTRY.map((t) => t.id).filter((x) => next.has(x));
    if (ids.length === 0) return;
    onChange(ids);
    storeEnabledTools(ids);
  };

  const toggle = (id: string) => {
    const next = new Set(enabledTools);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    applyIds(next);
  };

  const setTools = (toolIds: string[], on: boolean) => {
    const next = new Set(enabledTools);
    for (const id of toolIds) {
      if (on) next.add(id);
      else next.delete(id);
    }
    applyIds(next);
  };

  const setGroup = (group: ToolGroupId, on: boolean) => {
    setTools(
      visibleTools.filter((t) => t.group === group).map((t) => t.id),
      on,
    );
  };

  const setCategory = (group: ToolGroupId, category: ToolCategoryId, on: boolean) => {
    setTools(
      toolsInCategory(group, category).map((t) => t.id),
      on,
    );
  };

  const resetAll = () => {
    const ids = defaultEnabledToolIds();
    onChange(ids);
    storeEnabledTools(ids);
  };

  return (
    <div className="tool-selector" ref={rootRef}>
      <button
        type="button"
        className={`tool-selector-trigger${writeOff ? "" : " tool-selector-trigger--active"}`}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        title="选择 Agent 可调用的 qkrpc 工具"
      >
        工具
        <span className="tool-selector-count">{enabledTools.length}</span>
      </button>

      {open && (
        <div
          id={panelId}
          className="composer-popup tool-selector-panel"
          role="dialog"
          aria-label="工具选择"
        >
          <div className="tool-selector-header">
            <div className="tool-selector-header-main">
              <span>可用工具</span>
              <span className="tool-selector-header-meta">
                {enabledTools.length}/{totalTools} 已启用
              </span>
            </div>
            <button type="button" className="tool-selector-link" onClick={resetAll}>
              全部启用
            </button>
          </div>

          {GROUP_ORDER.map((group) => {
            const groupTools = visibleTools.filter((t) => t.group === group);
            const groupIds = groupTools.map((t) => t.id);
            const groupEnabled = countEnabledInSet(groupIds, enabledSet);
            const allOn = groupEnabled === groupIds.length;
            const categories = TOOL_CATEGORY_ORDER_BY_GROUP[group].filter(
              (category) => toolsInCategory(group, category).length > 0,
            );

            return (
              <section
                key={group}
                className={`tool-selector-group tool-selector-group--${group}`}
              >
                <div className="tool-selector-group-head">
                  <div className="tool-selector-group-title">
                    <span
                      className={`tool-selector-group-label tool-selector-group-label--${group}`}
                    >
                      {TOOL_GROUP_LABELS[group]}
                    </span>
                    <span className="tool-selector-group-count">
                      {groupEnabled}/{groupIds.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="tool-selector-link"
                    onClick={() => setGroup(group, !allOn)}
                  >
                    {allOn ? "全关" : "全开"}
                  </button>
                </div>

                {categories.map((category) => {
                  const items = toolsInCategory(group, category);
                  const itemIds = items.map((t) => t.id);
                  const categoryEnabled = countEnabledInSet(itemIds, enabledSet);
                  const categoryAllOn = categoryEnabled === itemIds.length;
                  const showCategoryHead = categories.length > 1;

                  return (
                    <div key={category} className="tool-selector-category">
                      {showCategoryHead && (
                        <div className="tool-selector-category-head">
                          <span className="tool-selector-category-label">
                            {TOOL_CATEGORY_LABELS[category]}
                          </span>
                          <button
                            type="button"
                            className="tool-selector-link tool-selector-link--subtle"
                            onClick={() => setCategory(group, category, !categoryAllOn)}
                          >
                            {categoryAllOn ? "全关" : "全开"}
                          </button>
                        </div>
                      )}
                      <ul className="tool-selector-list">
                        {items.map((t) => (
                          <li key={t.id}>
                            <label className="tool-selector-item">
                              <input
                                type="checkbox"
                                className="tool-selector-checkbox"
                                checked={enabledSet.has(t.id)}
                                onChange={() => toggle(t.id)}
                              />
                              <span className="tool-selector-item-body">
                                <span className="tool-selector-item-label">{t.label}</span>
                                {t.description && (
                                  <span className="tool-selector-item-desc">
                                    {t.description}
                                  </span>
                                )}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
});
