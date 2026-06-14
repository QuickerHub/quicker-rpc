"use client";

import type {
  TriggerEventsResultView,
  TriggerListResultView,
} from "@/lib/trigger-tool-view";

export function TriggerEventsResultView({
  view,
}: {
  view: TriggerEventsResultView;
}) {
  return (
    <div className="tool-result-list trigger-events-result">
      <p className="tool-result-list__meta">
        <span className="tool-result-list__title">事件类型</span>
        {view.query ? (
          <>
            <span className="tool-muted">关键词</span>{" "}
            <code>{view.query}</code>
            <span className="tool-result-list__sep" aria-hidden>
              ·
            </span>
          </>
        ) : null}
        <span className="tool-muted">匹配</span> <span>{view.matchCount}</span>
        {view.totalCount != null ? (
          <>
            <span className="tool-result-list__sep" aria-hidden>
              ·
            </span>
            <span className="tool-muted">总计</span> <span>{view.totalCount}</span>
          </>
        ) : null}
      </p>
      {view.hint ? <p className="tool-hint tool-muted">{view.hint}</p> : null}
      {view.items.length === 0 ? (
        <p className="tool-muted tool-hint">没有匹配的事件类型</p>
      ) : (
        <div className="tool-result-list-table-wrap">
          <table className="tool-result-list-table">
            <thead>
              <tr>
                <th scope="col">eventType</th>
                <th scope="col">说明</th>
                <th scope="col">参数字段</th>
              </tr>
            </thead>
            <tbody>
              {view.items.map((row) => (
                <tr key={row.eventType}>
                  <td>
                    <code>{row.eventType}</code>
                  </td>
                  <td className="trigger-events-result__desc">
                    {row.description || "—"}
                  </td>
                  <td className="trigger-events-result__params">
                    {row.paramKeys.length > 0 ? (
                      <code>{row.paramKeys.join(", ")}</code>
                    ) : (
                      <span className="tool-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function TriggerListResultView({ view }: { view: TriggerListResultView }) {
  return (
    <div className="tool-result-list trigger-list-result">
      <p className="tool-result-list__meta">
        <span className="tool-result-list__title">触发规则</span>
        <span className="tool-muted">条数</span> <span>{view.matchCount}</span>
      </p>
      {view.hint ? <p className="tool-hint tool-muted">{view.hint}</p> : null}
      {view.items.length === 0 ? (
        <p className="tool-muted tool-hint">没有匹配的触发规则</p>
      ) : (
        <div className="tool-result-list-table-wrap">
          <table className="tool-result-list-table">
            <thead>
              <tr>
                <th scope="col">备注</th>
                <th scope="col">事件</th>
                <th scope="col">动作</th>
                <th scope="col">状态</th>
                <th scope="col">ID</th>
              </tr>
            </thead>
            <tbody>
              {view.items.map((row) => (
                <tr key={row.id ?? `${row.note}:${row.eventType}:${row.action}`}>
                  <td>{row.note || "—"}</td>
                  <td>
                    <code>{row.eventType || "—"}</code>
                  </td>
                  <td>{row.action || "—"}</td>
                  <td>
                    {row.enabled == null ? (
                      "—"
                    ) : row.enabled ? (
                      "启用"
                    ) : (
                      "禁用"
                    )}
                  </td>
                  <td className="trigger-list-result__id">
                    {row.id ? <code>{row.id}</code> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
