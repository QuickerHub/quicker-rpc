"use client";

import type { WebSearchResultView } from "@/lib/web-search-tool-view";

export function WebSearchResultView({ view }: { view: WebSearchResultView }) {
  return (
    <div className="tool-result-list web-search-result">
      <p className="tool-result-list__meta">
        <span className="tool-result-list__title">结果</span>
        {view.query ? (
          <>
            <span className="tool-muted">关键词</span>{" "}
            <code>{view.query}</code>
            <span className="tool-result-list__sep" aria-hidden>
              ·
            </span>
          </>
        ) : null}
        <span className="tool-muted">条数</span> <span>{view.results.length}</span>
        {view.provider ? (
          <>
            <span className="tool-result-list__sep" aria-hidden>
              ·
            </span>
            <span className="tool-muted">来源</span> <span>{view.provider}</span>
          </>
        ) : null}
      </p>
      {view.results.length === 0 ? (
        <p className="tool-muted tool-hint">没有搜索结果</p>
      ) : (
        <div className="web-search-result__items">
          {view.results.map((item) => (
            <article key={item.url || item.title} className="web-search-result__item">
              <h4 className="web-search-result__title">
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer">
                    {item.title}
                  </a>
                ) : (
                  item.title
                )}
              </h4>
              {item.url ? (
                <p className="web-search-result__url">
                  <code>{item.url}</code>
                </p>
              ) : null}
              {item.snippet ? (
                <p className="web-search-result__snippet">{item.snippet}</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
