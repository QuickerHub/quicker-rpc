"use client";

import {
  formatStepRunnerSearchControlField,
  type StepRunnerSearchResult,
} from "@/lib/step-runner-tool";

export function StepRunnerSearchResultView({
  result,
}: {
  result: StepRunnerSearchResult;
}) {
  const { query, matchCount, items, controlFieldItemCount } = result;
  const cfCount =
    controlFieldItemCount ?? items.filter((r) => r.controlField).length;
  const showControlColumn =
    cfCount > 0 || items.some((r) => r.controlField !== undefined);

  return (
    <div className="step-runner-search-result">
      <p className="step-runner-search-result__meta">
        <span className="step-runner-search-result__title">结果</span>
        <span className="step-runner-search-result__sep" aria-hidden>
          ·
        </span>
        {query ? (
          <>
            <span className="tool-muted">关键词</span>{" "}
            <code>{query}</code>
            <span className="step-runner-search-result__sep" aria-hidden>
              ·
            </span>
          </>
        ) : null}
        <span className="tool-muted">匹配</span>{" "}
        <span>{matchCount}</span>
        {cfCount > 0 ? (
          <>
            <span className="step-runner-search-result__sep" aria-hidden>
              ·
            </span>
            <span className="tool-muted">含 controlField</span>{" "}
            <span>{cfCount}</span>
          </>
        ) : null}
      </p>
      {items.length === 0 ? (
        <p className="tool-muted tool-hint">没有匹配的步骤模块</p>
      ) : (
        <div className="step-runner-search-table-wrap">
          <table className="step-runner-search-table">
            <thead>
              <tr>
                <th scope="col">模块</th>
                <th scope="col">名称</th>
                {showControlColumn ? (
                  <th scope="col">controlField</th>
                ) : null}
                <th scope="col">说明</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={
                    row.controlField
                      ? `${row.key}\0${row.controlField.value}`
                      : row.key
                  }
                >
                  <td>
                    <code className="step-runner-search-key" title={row.key}>
                      {row.key}
                    </code>
                  </td>
                  <td className="step-runner-search-name">{row.name}</td>
                  {showControlColumn ? (
                    <td className="step-runner-search-control">
                      {row.controlField ? (
                        <code
                          className="step-runner-search-control__code"
                          title={formatStepRunnerSearchControlField(
                            row.controlField,
                          )}
                        >
                          {row.controlField.key}=
                          <span className="step-runner-search-control__value">
                            {row.controlField.value}
                          </span>
                          {row.controlField.name ? (
                            <span className="step-runner-search-control__name">
                              {" "}
                              · {row.controlField.name}
                            </span>
                          ) : null}
                        </code>
                      ) : (
                        <span className="tool-muted">—</span>
                      )}
                    </td>
                  ) : null}
                  <td
                    className="step-runner-search-desc"
                    title={row.description}
                  >
                    {row.description ?? "—"}
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
