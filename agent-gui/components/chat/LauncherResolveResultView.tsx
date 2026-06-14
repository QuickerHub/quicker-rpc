"use client";

import type { LauncherResolveAgentOutput } from "@/lib/launcher-resolve-view";

export function LauncherResolveResultView({
  view,
}: {
  view: LauncherResolveAgentOutput;
}) {
  return (
    <div className="tool-result-list launcher-resolve-result">
      <p className="tool-result-list__meta">
        <span className="tool-result-list__title">解析</span>
        {view.query ? (
          <>
            <span className="tool-muted">查询</span>{" "}
            <code>{view.query}</code>
          </>
        ) : null}
      </p>
      {view.message ? <p className="tool-hint">{view.message}</p> : null}
      {view.missedTerms?.length ? (
        <p className="tool-hint tool-muted">
          未匹配词：<code>{view.missedTerms.join(", ")}</code>
        </p>
      ) : null}
      {view.next ? (
        <section className="launcher-resolve-result__next">
          <h4 className="launcher-resolve-result__section-title">下一步</h4>
          <dl className="tool-kv">
            <div className="tool-kv-row">
              <dt>工具</dt>
              <dd>
                <code>{view.next.tool}</code>
              </dd>
            </div>
            {view.next.match ? (
              <div className="tool-kv-row">
                <dt>匹配</dt>
                <dd>
                  <code>{view.next.match.term}</code>
                  <span className="tool-muted"> → </span>
                  <span>{view.next.match.on}</span>
                </dd>
              </div>
            ) : null}
            <div className="tool-kv-row tool-kv-row--block">
              <dt>参数</dt>
              <dd>
                <pre className="tool-json">{JSON.stringify(view.next.input, null, 2)}</pre>
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
      {view.ranked?.length ? (
        <section className="launcher-resolve-result__ranked">
          <h4 className="launcher-resolve-result__section-title">候选</h4>
          <div className="tool-result-list-table-wrap">
            <table className="tool-result-list-table">
              <thead>
                <tr>
                  <th scope="col">标签</th>
                  <th scope="col">类型</th>
                  <th scope="col">分数</th>
                  <th scope="col">匹配</th>
                </tr>
              </thead>
              <tbody>
                {view.ranked.map((row) => (
                  <tr key={`${row.kind}:${row.label}:${row.score}`}>
                    <td>{row.label}</td>
                    <td>
                      <code>{row.kind}</code>
                    </td>
                    <td>{row.score}</td>
                    <td>
                      {row.match ? (
                        <>
                          <code>{row.match.term}</code>
                          <span className="tool-muted"> → </span>
                          <span>{row.match.on}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {view.alternatives?.length ? (
        <section className="launcher-resolve-result__alternatives">
          <h4 className="launcher-resolve-result__section-title">备选</h4>
          <div className="tool-result-list-table-wrap">
            <table className="tool-result-list-table">
              <thead>
                <tr>
                  <th scope="col">标签</th>
                  <th scope="col">工具</th>
                  <th scope="col">匹配</th>
                </tr>
              </thead>
              <tbody>
                {view.alternatives.map((row) => (
                  <tr key={`${row.tool}:${row.label}`}>
                    <td>{row.label}</td>
                    <td>
                      <code>{row.tool}</code>
                    </td>
                    <td>
                      {row.match ? (
                        <>
                          <code>{row.match.term}</code>
                          <span className="tool-muted"> → </span>
                          <span>{row.match.on}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
