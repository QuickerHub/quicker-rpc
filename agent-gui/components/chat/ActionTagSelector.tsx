"use client";

import { useEffect, useRef, useState } from "react";
import { useMountedAriaControlsId } from "@/lib/use-mounted-aria-controls-id";
import type { PingState } from "@/lib/use-qkrpc-ping";
import type { PinnedAction } from "@/lib/action-context";
import type { RecentActionItem } from "@/lib/recent-actions";
import { useAgentActions } from "@/lib/use-agent-actions";
import { useRecentActions } from "@/lib/use-recent-actions";

type PickerView = "recent" | "agent";

type ActionTagSelectorProps = {
  ping: PingState;
  refreshKey?: number;
  tagCount?: number;
  /** Action ids already embedded in the draft (for picker highlight). */
  embeddedTagIds?: ReadonlySet<string>;
  onSelect: (action: PinnedAction) => void;
  disabled?: boolean;
};

function pingStatusMessage(ping: PingState): string | null {
  if (ping.status === "loading") return "检测 Quicker 连接…";
  if (ping.status === "error") return ping.message;
  return null;
}

function ActionPickerList({
  items,
  embeddedTagIds,
  onPick,
}: {
  items: RecentActionItem[];
  embeddedTagIds?: ReadonlySet<string>;
  onPick: (action: PinnedAction) => void;
}) {
  return (
    <ul className="action-picker-list">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className={`action-picker-item${embeddedTagIds?.has(item.id) ? " action-picker-item--selected" : ""}`}
            onClick={() => onPick(item)}
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
  );
}

export function ActionTagSelector({
  ping,
  refreshKey = 0,
  tagCount = 0,
  embeddedTagIds,
  onSelect,
  disabled,
}: ActionTagSelectorProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PickerView>("recent");
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useMountedAriaControlsId();
  const { state: recent, reload: reloadRecent } = useRecentActions(refreshKey);
  const { state: agent, reload: reloadAgent } = useAgentActions(
    open && view === "agent",
    refreshKey,
  );
  const listState = view === "recent" ? recent : agent;
  const reloadList = view === "recent" ? reloadRecent : reloadAgent;
  const listItems = listState.status === "ok" ? listState.items : [];
  const showListLoading =
    listState.status === "loading" && listItems.length === 0;
  const hasTag = tagCount > 0;
  const pingMessage = pingStatusMessage(ping);
  const effectiveOk =
    ping.status === "ok" || recent.status === "ok" || agent.status === "ok";
  const showPingMessage = Boolean(pingMessage) && !effectiveOk;
  const showListError =
    listState.status === "error"
    && listState.message !== pingMessage
    && !effectiveOk;
  const emptyMessage =
    view === "recent" ? "暂无最近编辑的动作" : "暂无助手创建的动作";

  useEffect(() => {
    if (!open) return;
    if (view === "recent") void reloadRecent();
  }, [open, view, reloadRecent]);

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
        className={`tool-selector-trigger${hasTag ? " tool-selector-trigger--active" : ""}${!effectiveOk ? " tool-selector-trigger--offline" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        title={
          effectiveOk
            ? "为本条消息附加 Quicker 动作标签"
            : "Quicker 未连接；打开后将自动重试连接"
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
          <div className="action-picker-body">
            {showPingMessage && pingMessage && (
              <p
                className={`action-picker-status${ping.status === "error" ? " action-picker-status--error" : ""}`}
              >
                {pingMessage}
                {ping.status === "error" ? "（左侧齿轮 → 重新检测）" : ""}
              </p>
            )}

            {showListLoading && (
              <p className="action-picker-status">
                {view === "recent" ? "加载最近动作…" : "加载助手动作…"}
              </p>
            )}

            {showListError && (
              <p className="action-picker-status action-picker-status--error">
                {listState.message}
              </p>
            )}

            {listState.status === "ok" && listItems.length === 0 && (
              <p className="action-picker-status">{emptyMessage}</p>
            )}

            {listItems.length > 0 && (
              <ActionPickerList
                items={listItems}
                embeddedTagIds={embeddedTagIds}
                onPick={pick}
              />
            )}
          </div>

          <div className="action-picker-footer">
            <div className="action-picker-tabs" role="tablist" aria-label="动作来源">
              <button
                type="button"
                role="tab"
                className={`action-picker-tab${view === "recent" ? " action-picker-tab--active" : ""}`}
                aria-selected={view === "recent"}
                onClick={() => setView("recent")}
              >
                最近编辑
              </button>
              <button
                type="button"
                role="tab"
                className={`action-picker-tab${view === "agent" ? " action-picker-tab--active" : ""}`}
                aria-selected={view === "agent"}
                onClick={() => setView("agent")}
              >
                助手动作
              </button>
            </div>
            <button
              type="button"
              className="tool-selector-link"
              disabled={showListLoading}
              onClick={() => void reloadList()}
            >
              刷新
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
