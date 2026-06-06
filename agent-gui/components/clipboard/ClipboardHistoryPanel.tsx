"use client";

import { useMemo } from "react";
import { clipboardImageUrl } from "@/lib/clipboard-history/clipboard-history-client";
import type { ClipItemDto } from "@/lib/clipboard-history/clipboard-history-types";
import {
  useClipboardHistory,
  type ClipboardFilterKind,
} from "@/lib/clipboard-history/use-clipboard-history";

type ClipboardHistoryPanelProps = {
  active?: boolean;
};

const FILTER_TABS: { id: ClipboardFilterKind; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "pinned", label: "置顶" },
  { id: "text", label: "文本" },
  { id: "html", label: "HTML" },
  { id: "image", label: "图片" },
  { id: "files", label: "文件" },
];

function kindLabel(kind: string): string {
  switch (kind) {
    case "text":
      return "文本";
    case "html":
      return "HTML";
    case "image":
      return "图片";
    case "files":
      return "文件";
    default:
      return kind;
  }
}

function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "";
  }
}

function renderHighlighted(item: ClipItemDto): string {
  return item.highlightedText ?? item.preview;
}

export function ClipboardHistoryPanel({ active = true }: ClipboardHistoryPanelProps) {
  const panel = useClipboardHistory(active);
  const selected = useMemo(
    () => panel.items.find((item) => item.id === panel.selectedId) ?? null,
    [panel.items, panel.selectedId],
  );

  return (
    <div className="clipboard-history">
      <header className="clipboard-history__header">
        <div>
          <h1 className="clipboard-history__title">剪贴板历史</h1>
          <p className="clipboard-history__subtitle">
            自动记录系统剪贴板，支持搜索、置顶与一键复制。
          </p>
        </div>
        <div className="clipboard-history__header-actions">
          <span
            className={`clipboard-history__status ${
              panel.runtimeOnline ? "is-online" : "is-offline"
            }`}
          >
            {panel.runtimeOnline ? "服务运行中" : "服务未连接"}
          </span>
          {!panel.runtimeOnline ? (
            <button
              type="button"
              className="clipboard-history__btn"
              onClick={() => void panel.startRuntime()}
            >
              启动服务
            </button>
          ) : (
            <button
              type="button"
              className="clipboard-history__btn clipboard-history__btn--ghost"
              onClick={() => void panel.refreshRuntime()}
            >
              刷新
            </button>
          )}
        </div>
      </header>

      <div className="clipboard-history__toolbar">
        <input
          className="clipboard-history__search"
          type="search"
          placeholder="搜索标题、内容或来源进程…"
          value={panel.query}
          onChange={(event) => panel.setQuery(event.target.value)}
          disabled={!panel.runtimeOnline}
        />
        <div className="clipboard-history__tabs" role="tablist" aria-label="分类">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={panel.filterKind === tab.id}
              className={`clipboard-history__tab ${
                panel.filterKind === tab.id ? "is-active" : ""
              }`}
              onClick={() => panel.setFilterKind(tab.id)}
              disabled={!panel.runtimeOnline}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="clipboard-history__btn clipboard-history__btn--danger"
          onClick={() => void panel.handleClear()}
          disabled={!panel.runtimeOnline || panel.busyId !== null}
        >
          清空（保留置顶）
        </button>
      </div>

      {panel.error ? <p className="clipboard-history__error">{panel.error}</p> : null}
      {panel.hostStatus?.message && !panel.runtimeOnline ? (
        <p className="clipboard-history__hint">{panel.hostStatus.message}</p>
      ) : null}

      <div className="clipboard-history__body">
        <section className="clipboard-history__list" aria-label="历史列表">
          {panel.loading ? <p className="clipboard-history__empty">加载中…</p> : null}
          {!panel.loading && panel.items.length === 0 ? (
            <p className="clipboard-history__empty">
              {panel.runtimeOnline ? "暂无记录，复制一些内容后会自动出现在这里。" : "请先启动剪贴板服务。"}
            </p>
          ) : null}
          <ul className="clipboard-history__items">
            {panel.items.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`clipboard-history__item ${
                    panel.selectedId === item.id ? "is-selected" : ""
                  }`}
                  onClick={() => panel.setSelectedId(item.id)}
                  onDoubleClick={() => void panel.handleCopy(item.id)}
                >
                  <span className="clipboard-history__item-index">{index + 1}</span>
                  <span className="clipboard-history__item-main">
                    <span className="clipboard-history__item-title">
                      {item.isPinned ? "📌 " : ""}
                      {item.title}
                    </span>
                    <span className="clipboard-history__item-preview">
                      {renderHighlighted(item)}
                    </span>
                    <span className="clipboard-history__item-meta">
                      <span>{kindLabel(item.kind)}</span>
                      {item.sourceProcess ? <span>{item.sourceProcess}</span> : null}
                      <span>{formatTime(item.updatedAt)}</span>
                      {item.usageCount > 0 ? <span>使用 {item.usageCount}</span> : null}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {panel.total > panel.items.length ? (
            <p className="clipboard-history__footer">显示 {panel.items.length} / {panel.total} 条</p>
          ) : null}
        </section>

        <aside className="clipboard-history__detail" aria-label="详情">
          {!selected ? (
            <p className="clipboard-history__empty">选择一条记录查看详情</p>
          ) : (
            <>
              <h2 className="clipboard-history__detail-title">{selected.title}</h2>
              <dl className="clipboard-history__detail-meta">
                <div>
                  <dt>类型</dt>
                  <dd>{kindLabel(selected.kind)}</dd>
                </div>
                {selected.sourceProcess ? (
                  <div>
                    <dt>来源</dt>
                    <dd>{selected.sourceProcess}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>时间</dt>
                  <dd>{formatTime(selected.updatedAt)}</dd>
                </div>
              </dl>
              {selected.kind === "image" ? (
                <img
                  className="clipboard-history__image"
                  src={clipboardImageUrl(selected.id, panel.httpPort)}
                  alt={selected.title}
                />
              ) : (
                <pre className="clipboard-history__preview">{selected.preview}</pre>
              )}
              <div className="clipboard-history__detail-actions">
                <button
                  type="button"
                  className="clipboard-history__btn"
                  disabled={panel.busyId === selected.id}
                  onClick={() => void panel.handleCopy(selected.id)}
                >
                  复制到剪贴板
                </button>
                <button
                  type="button"
                  className="clipboard-history__btn clipboard-history__btn--ghost"
                  disabled={panel.busyId === selected.id}
                  onClick={() => void panel.handleTogglePin(selected)}
                >
                  {selected.isPinned ? "取消置顶" : "置顶"}
                </button>
                <button
                  type="button"
                  className="clipboard-history__btn clipboard-history__btn--danger"
                  disabled={panel.busyId === selected.id}
                  onClick={() => void panel.handleDelete(selected.id)}
                >
                  删除
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
