"use client";

import type { StructuredToolResult } from "@/lib/tool-result";
import type {
  DocsIndexResultView,
  DocsSearchResultView,
  DocsSnippetResultView,
  DocsToolInlineResult,
} from "@/lib/docs-tool-view";
import { parseDocsToolInlineResult } from "@/lib/docs-tool-view";
import type { DocsGetDoc } from "@/lib/docs-tool";
import { MarkdownMessage } from "./MarkdownMessage";

function DocsResultMeta({
  parts,
}: {
  parts: Array<{ label: string; value: string }>;
}) {
  if (parts.length === 0) return null;
  return (
    <p className="tool-result-list__meta">
      <span className="tool-result-list__title">结果</span>
      {parts.map(({ label, value }, index) => (
        <span key={label}>
          {index === 0 ? null : (
            <span className="tool-result-list__sep" aria-hidden>
              ·
            </span>
          )}
          <span className="tool-muted">{label}</span>{" "}
          {label === "关键词" || label === "范围" || label === "主题" ? (
            <code>{value}</code>
          ) : (
            <span>{value}</span>
          )}
        </span>
      ))}
    </p>
  );
}

export function DocsSearchResultView({ view }: { view: DocsSearchResultView }) {
  const metaParts = [
    view.keyword ? { label: "关键词", value: view.keyword } : null,
    view.scope ? { label: "范围", value: view.scope } : null,
    { label: "匹配", value: String(view.matchCount) },
  ].filter((part): part is { label: string; value: string } => part !== null);

  return (
    <div className="tool-result-list docs-search-result">
      <DocsResultMeta parts={metaParts} />
      {view.items.length === 0 ? (
        <p className="tool-muted tool-hint">没有匹配的指南条目</p>
      ) : (
        <div className="docs-search-result__items">
          {view.items.map((item) => (
            <article
              key={`${item.topic}:${item.reference ?? ""}:${item.section ?? ""}:${item.title}`}
              className="docs-search-result__item"
            >
              <header className="docs-search-result__head">
                <div className="docs-search-result__title-row">
                  <strong className="docs-search-result__title">{item.title}</strong>
                  {item.score != null ? (
                    <span className="docs-search-result__score">
                      {item.score.toFixed(2)}
                    </span>
                  ) : null}
                </div>
                <div className="docs-search-result__topic">
                  <code>{item.topic}</code>
                  {item.reference ? (
                    <>
                      <span className="tool-muted"> / </span>
                      <code>{item.reference}</code>
                    </>
                  ) : null}
                  {item.section ? (
                    <span className="tool-muted"> · {item.section}</span>
                  ) : null}
                </div>
                {item.description ? (
                  <p className="docs-search-result__desc">{item.description}</p>
                ) : null}
              </header>
              <div className="tool-doc-markdown docs-search-result__snippet-md">
                <MarkdownMessage content={item.snippet} variant="assistant" />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function DocsIndexResultView({ view }: { view: DocsIndexResultView }) {
  return (
    <div className="tool-result-list docs-index-result">
      <DocsResultMeta parts={[{ label: "主题", value: String(view.topicCount) }]} />
      {view.layerGroups.map((group) => (
        <section key={group.layer} className="docs-index-result__group">
          <h4 className="docs-index-result__group-title">
            {group.label}
            <span className="tool-muted"> · {group.topics.length}</span>
          </h4>
          <div className="tool-result-list-table-wrap">
            <table className="tool-result-list-table">
              <thead>
                <tr>
                  <th scope="col">标题</th>
                  <th scope="col">topic</th>
                  <th scope="col">说明</th>
                </tr>
              </thead>
              <tbody>
                {group.topics.map((topic) => (
                  <tr key={topic.topic}>
                    <td className="docs-index-result__title">{topic.title}</td>
                    <td>
                      <code>{topic.topic}</code>
                    </td>
                    <td className="docs-index-result__desc" title={topic.description}>
                      {topic.description || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

export function DocsSnippetResultView({ view }: { view: DocsSnippetResultView }) {
  return (
    <div className="tool-result-list docs-snippet-result">
      <DocsResultMeta
        parts={[
          { label: "主题", value: view.topic },
          ...(view.reference ? [{ label: "引用", value: view.reference }] : []),
        ]}
      />
      <h4 className="docs-snippet-result__title">{view.title}</h4>
      {view.section ? (
        <p className="tool-muted docs-snippet-result__section">{view.section}</p>
      ) : null}
      <div className="tool-doc-markdown">
        <MarkdownMessage content={view.snippet} variant="assistant" />
      </div>
    </div>
  );
}

export function DocsGetMarkdownResultView({ doc }: { doc: DocsGetDoc }) {
  return (
    <div className="tool-result-list docs-get-result">
      {doc.description ? (
        <p className="docs-get-result__desc">{doc.description}</p>
      ) : null}
      <div className="tool-doc-markdown">
        <MarkdownMessage content={doc.markdown} variant="assistant" />
      </div>
    </div>
  );
}

export function DocsToolResultBody({ result }: { result: DocsToolInlineResult }) {
  switch (result.kind) {
    case "search":
      return <DocsSearchResultView view={result.view} />;
    case "index":
      return <DocsIndexResultView view={result.view} />;
    case "snippet":
      return <DocsSnippetResultView view={result.view} />;
    case "get":
      return <DocsGetMarkdownResultView doc={result.doc} />;
  }
}

/** Render parsed docs tool output in the tool result popup (visual tab). */
export function DocsToolOutputView({ output }: { output: StructuredToolResult }) {
  const result = parseDocsToolInlineResult(output);
  if (!result) return null;
  return <DocsToolResultBody result={result} />;
}
