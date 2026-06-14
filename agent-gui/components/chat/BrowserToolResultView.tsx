"use client";

import type { ReactNode } from "react";
import {
  formatBrowserRuntimeModeBadge,
  type BrowserToolResultView as BrowserView,
} from "@/lib/browser-tool-result";

function KeyValueRows({
  entries,
}: {
  entries: Array<{ key: string; value: ReactNode; block?: boolean }>;
}) {
  return (
    <dl className="tool-kv">
      {entries.map(({ key, value, block }) => (
        <div
          key={key}
          className={`tool-kv-row${block ? " tool-kv-row--block" : ""}`}
        >
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function BrowserToolResultView({ view }: { view: BrowserView }) {
  if (view.error) {
    return <p className="tool-plain-result tool-error">{view.error}</p>;
  }

  const modeBadge = formatBrowserRuntimeModeBadge(view);
  const entries: Array<{ key: string; value: ReactNode; block?: boolean }> = [];

  if (modeBadge) {
    entries.push({
      key: "运行时",
      value: <span className="browser-runtime-badge">{modeBadge}</span>,
    });
  }

  if (view.url) {
    entries.push({
      key: "URL",
      value: (
        <a href={view.url} target="_blank" rel="noreferrer">
          {view.url}
        </a>
      ),
    });
  }
  if (view.title) {
    entries.push({ key: "标题", value: view.title });
  }
  if (view.status != null) {
    entries.push({ key: "HTTP", value: String(view.status) });
  }
  if (view.nodeCount != null) {
    entries.push({ key: "可交互元素", value: String(view.nodeCount) });
  }
  if (view.ref) {
    entries.push({ key: "元素", value: <code>{view.ref}</code> });
  }
  if (view.key) {
    entries.push({ key: "按键", value: <code>{view.key}</code> });
  }
  if (view.panelPreview) {
    entries.push({ key: "预览", value: "已更新侧栏浏览器画面" });
  }
  if (view.browserReady != null) {
    entries.push({
      key: "运行时",
      value: view.browserReady ? "就绪" : "未就绪",
    });
  }
  if (view.sessionCount != null) {
    entries.push({ key: "会话数", value: String(view.sessionCount) });
  }

  return (
    <div className="tool-result tool-result--browser">
      {entries.length > 0 ? <KeyValueRows entries={entries} /> : null}

      {view.snapshot ? (
        <div className="tool-section tool-section--dense">
          <div className="tool-section-label">
            <span>页面快照</span>
          </div>
          <pre className="tool-json tool-json--snapshot">{view.snapshot}</pre>
        </div>
      ) : null}

      {view.text ? (
        <div className="tool-section tool-section--dense">
          <div className="tool-section-label">
            <span>页面文本{view.truncated ? "（已截断）" : ""}</span>
          </div>
          <pre className="tool-json tool-json--page-text">{view.text}</pre>
        </div>
      ) : null}

      {view.tabs && view.tabs.length > 0 ? (
        <div className="tool-section tool-section--dense">
          <div className="tool-section-label">
            <span>标签页</span>
          </div>
          <ul className="tool-browser-tabs">
            {view.tabs.map((tab) => (
              <li key={`${tab.index}-${tab.url}`}>
                <code>{tab.active ? "●" : "○"}</code>{" "}
                {tab.title || tab.url || `tab ${tab.index}`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
