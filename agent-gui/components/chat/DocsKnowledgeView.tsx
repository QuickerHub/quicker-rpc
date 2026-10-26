"use client";

import type { DocsGetDoc } from "@/lib/docs-tool";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function text(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "未知";
}

/** Show the observed codec and guide origin without turning them into native authority. */
export function DocsKnowledgeView({ doc }: { doc: Pick<DocsGetDoc, "topic" | "guideSource" | "gatewayKnowledge"> }) {
  if (doc.guideSource !== "gateway") {
    return doc.topic === "program-source" ? (
      <p className="docs-knowledge-local">本地指南 · 尚未查询当前 gateway 的 codec</p>
    ) : null;
  }
  const knowledge = doc.gatewayKnowledge;
  const codec = knowledge?.codec;
  const formats = record(codec?.formats);
  const implementation = record(codec?.source);
  const provenance = knowledge?.provenance;
  const guide = record(provenance?.source);
  const inputs = Array.isArray(formats?.inputs) && formats.inputs.every((value) => typeof value === "string")
    ? formats.inputs as string[] : null;
  const status = knowledge?.status === "available" ? "已读取"
    : knowledge?.status === "unavailable" ? "无法读取" : "信息未完整提供";
  return (
    <section className="docs-knowledge" aria-label="Gateway codec 与文档来源">
      <header className="docs-knowledge__header"><strong>Gateway 来源</strong><span>{status}</span></header>
      <dl className="docs-knowledge__fields">
        <div><dt>Gateway</dt><dd>{knowledge?.gateway.displayName || "未知"}</dd></div>
        <div><dt>输入格式</dt><dd>{inputs?.length ? inputs.map((format) => <code key={format}>{format}</code>) : "未知"}</dd></div>
        <div><dt>输出格式</dt><dd><code>{text(formats?.output)}</code></dd></div>
        <div><dt>Codec 实现</dt><dd>{text(implementation?.assemblyName)} · {text(implementation?.assemblyVersion)}</dd></div>
        <div><dt>指南来源</dt><dd>{guide?.kind === "bundled-fallback" ? "内置指南（bundled-fallback）" : text(guide?.kind)} · {text(guide?.bundleVersion)}</dd></div>
        <div><dt>读取时间</dt><dd>{knowledge?.retrievedAt || "未知"}</dd></div>
        <div><dt>原生能力</dt><dd>未核验；codec 信息不授予宿主读写权限</dd></div>
      </dl>
      {knowledge?.reason ? <p className="docs-knowledge__notice" role={knowledge.status === "unavailable" ? "alert" : undefined}>{knowledge.reason}</p> : null}
      <details className="docs-knowledge__raw">
        <summary>查看 codec 与来源记录</summary>
        <pre>{JSON.stringify(knowledge ?? { status: "unknown" }, null, 2)}</pre>
      </details>
    </section>
  );
}
