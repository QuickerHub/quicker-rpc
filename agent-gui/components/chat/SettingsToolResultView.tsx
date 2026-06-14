"use client";

import type {
  SettingsGetResultView,
  SettingsListResultView,
} from "@/lib/settings-tool-view";

export function SettingsListResultView({
  view,
}: {
  view: SettingsListResultView;
}) {
  return (
    <div className="tool-result-list settings-list-result">
      <p className="tool-result-list__meta">
        <span className="tool-result-list__title">设置项</span>
        {view.query ? (
          <>
            <span className="tool-muted">关键词</span>{" "}
            <code>{view.query}</code>
            <span className="tool-result-list__sep" aria-hidden>
              ·
            </span>
          </>
        ) : null}
        {view.scope ? (
          <>
            <span className="tool-muted">范围</span>{" "}
            <code>{view.scope}</code>
            <span className="tool-result-list__sep" aria-hidden>
              ·
            </span>
          </>
        ) : null}
        <span className="tool-muted">匹配</span> <span>{view.items.length}</span>
      </p>
      {view.message ? <p className="tool-hint tool-muted">{view.message}</p> : null}
      {view.pages.length > 0 ? (
        <section className="settings-list-result__pages">
          <h4 className="settings-list-result__section-title">设置页</h4>
          <div className="tool-result-list-table-wrap">
            <table className="tool-result-list-table">
              <thead>
                <tr>
                  <th scope="col">标题</th>
                  <th scope="col">pageId</th>
                </tr>
              </thead>
              <tbody>
                {view.pages.map((page) => (
                  <tr key={page.pageId}>
                    <td>{page.title || "—"}</td>
                    <td>
                      <code>{page.pageId}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {view.items.length === 0 ? (
        <p className="tool-muted tool-hint">没有匹配的设置项</p>
      ) : (
        <div className="tool-result-list-table-wrap">
          <table className="tool-result-list-table">
            <thead>
              <tr>
                <th scope="col">键</th>
                <th scope="col">标题</th>
                <th scope="col">类型</th>
                <th scope="col">说明</th>
              </tr>
            </thead>
            <tbody>
              {view.items.map((item) => (
                <tr key={`${item.scope ?? ""}:${item.key}`}>
                  <td>
                    <code>{item.key}</code>
                  </td>
                  <td>{item.title || "—"}</td>
                  <td>{item.type || "—"}</td>
                  <td className="settings-list-result__desc" title={item.description}>
                    {item.snippet || item.description || "—"}
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

export function SettingsGetResultView({ view }: { view: SettingsGetResultView }) {
  return (
    <div className="tool-result-list settings-get-result">
      <dl className="tool-kv">
        <div className="tool-kv-row">
          <dt>键</dt>
          <dd>
            <code>{view.key}</code>
          </dd>
        </div>
        {view.scope ? (
          <div className="tool-kv-row">
            <dt>范围</dt>
            <dd>
              <code>{view.scope}</code>
            </dd>
          </div>
        ) : null}
        {view.type ? (
          <div className="tool-kv-row">
            <dt>类型</dt>
            <dd>{view.type}</dd>
          </div>
        ) : null}
        {view.title ? (
          <div className="tool-kv-row">
            <dt>标题</dt>
            <dd>{view.title}</dd>
          </div>
        ) : null}
        {view.description ? (
          <div className="tool-kv-row tool-kv-row--block">
            <dt>说明</dt>
            <dd>{view.description}</dd>
          </div>
        ) : null}
        {view.value !== undefined ? (
          <div className="tool-kv-row tool-kv-row--block">
            <dt>值</dt>
            <dd>
              <pre className="settings-get-result__value">{view.value}</pre>
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
