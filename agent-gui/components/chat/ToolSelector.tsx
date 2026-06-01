"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  defaultEnabledToolIds,
  QKRPC_TOOL_REGISTRY,
  storeEnabledTools,
  TOOL_GROUP_LABELS,
  type ToolGroupId,
} from "@/lib/tool-registry";

type ToolSelectorProps = {
  enabledTools: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

const GROUP_ORDER: ToolGroupId[] = ["read", "write", "destructive"];

export function ToolSelector({
  enabledTools,
  onChange,
  disabled,
}: ToolSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const enabledSet = new Set(enabledTools);
  const writeOff = !GROUP_ORDER.slice(1).some((g) =>
    QKRPC_TOOL_REGISTRY.some((t) => t.group === g && enabledSet.has(t.id)),
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (id: string) => {
    const next = new Set(enabledTools);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const ids = QKRPC_TOOL_REGISTRY.map((t) => t.id).filter((x) => next.has(x));
    if (ids.length === 0) return;
    onChange(ids);
    storeEnabledTools(ids);
  };

  const setGroup = (group: ToolGroupId, on: boolean) => {
    const next = new Set(enabledTools);
    for (const t of QKRPC_TOOL_REGISTRY) {
      if (t.group !== group) continue;
      if (on) next.add(t.id);
      else next.delete(t.id);
    }
    const ids = QKRPC_TOOL_REGISTRY.map((t) => t.id).filter((x) => next.has(x));
    if (ids.length === 0) return;
    onChange(ids);
    storeEnabledTools(ids);
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
            <span>可用工具</span>
            <button type="button" className="tool-selector-link" onClick={resetAll}>
              全部启用
            </button>
          </div>

          {GROUP_ORDER.map((group) => {
            const items = QKRPC_TOOL_REGISTRY.filter((t) => t.group === group);
            const allOn = items.every((t) => enabledSet.has(t.id));
            return (
              <section key={group} className="tool-selector-group">
                <div className="tool-selector-group-head">
                  <span className={`tool-selector-group-label tool-selector-group-label--${group}`}>
                    {TOOL_GROUP_LABELS[group]}
                  </span>
                  <button
                    type="button"
                    className="tool-selector-link"
                    onClick={() => setGroup(group, !allOn)}
                  >
                    {allOn ? "全关" : "全开"}
                  </button>
                </div>
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
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
