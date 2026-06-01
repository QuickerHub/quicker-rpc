"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PinnedAction } from "@/lib/action-context";
import { useRecentActions } from "@/lib/use-recent-actions";

type ActionTagSelectorProps = {
  qkrpcOk: boolean;
  refreshKey?: number;
  tagCount?: number;
  /** Action ids already embedded in the draft (for picker highlight). */
  embeddedTagIds?: ReadonlySet<string>;
  onSelect: (action: PinnedAction) => void;
  onAgentList?: () => void;
  disabled?: boolean;
};

export function ActionTagSelector({
  qkrpcOk,
  refreshKey = 0,
  tagCount = 0,
  embeddedTagIds,
  onSelect,
  onAgentList,
  disabled,
}: ActionTagSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const { state: recent, reload } = useRecentActions(qkrpcOk, refreshKey);
  const hasTag = tagCount > 0;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (action: PinnedAction) => {
    onSelect(action);
    setOpen(false);
  };

  return (
    <div className="tool-selector action-picker" ref={rootRef}>
      <button
        type="button"
        className={`tool-selector-trigger${hasTag ? " tool-selector-trigger--active" : ""}${!qkrpcOk ? " tool-selector-trigger--offline" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        title={
          qkrpcOk
            ? "为本条消息附加 Quicker 动作标签"
            : "Quicker 未连接；仍可打开以查看状态或刷新"
        }
      >
        动作
        {hasTag && <span className="tool-selector-count">{tagCount}</span>}
      </button>

      {open && (
        <div
          id={panelId}
          className="composer-popup tool-selector-panel action-picker-panel"
          role="dialog"
          aria-label="选择动作"
        >
          <div className="tool-selector-header">
            <span>最近编辑</span>
            <button
              type="button"
              className="tool-selector-link"
              disabled={recent.status === "loading"}
              onClick={() => void reload()}
            >
              刷新
            </button>
          </div>

          {!qkrpcOk && (
            <p className="action-picker-status action-picker-status--error">
              未连接 Quicker（请用左侧齿轮菜单检测连接）
            </p>
          )}

          {recent.status === "loading" && (
            <p className="action-picker-status">加载中…</p>
          )}

          {recent.status === "error" && (
            <p className="action-picker-status action-picker-status--error">
              {recent.message}
            </p>
          )}

          {recent.status === "ok" && recent.items.length === 0 && (
            <p className="action-picker-status">暂无最近编辑的动作</p>
          )}

          {recent.status === "ok" && recent.items.length > 0 && (
            <ul className="action-picker-list">
              {recent.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`action-picker-item${embeddedTagIds?.has(item.id) ? " action-picker-item--selected" : ""}`}
                    onClick={() => pick(item)}
                  >
                    <span className="action-picker-item-title">{item.title}</span>
                    {item.lastEditTimeLocal && (
                      <span className="action-picker-item-meta">
                        {item.lastEditTimeLocal}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {onAgentList && (
            <div className="action-picker-footer">
              <button
                type="button"
                className="tool-selector-link"
                onClick={() => {
                  setOpen(false);
                  onAgentList();
                }}
              >
                列出 agent 虚拟页动作…
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
