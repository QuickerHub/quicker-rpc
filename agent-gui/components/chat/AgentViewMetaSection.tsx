"use client";

import {
  formatAgentViewRefetch,
  readAgentViewCompressStats,
} from "@/lib/tool-result-agent-view-display";

type AgentViewMetaSectionProps = {
  output: unknown;
  dense?: boolean;
};

export function AgentViewMetaSection({ output, dense }: AgentViewMetaSectionProps) {
  const stats = readAgentViewCompressStats(output);
  if (!stats) return null;

  return (
    <div
      className={`tool-agent-view${dense ? " tool-agent-view--dense" : ""}`}
      data-testid="tool-agent-view-meta"
    >
      <div className="tool-agent-view__title">Agent view</div>
      <p className="tool-agent-view__summary">{stats.agentSummary}</p>
      <dl className="tool-agent-view__meta">
        <div>
          <dt>模型 payload</dt>
          <dd>
            ~{stats.modelTokens.toLocaleString()} tok · {stats.modelChars.toLocaleString()} chars
          </dd>
        </div>
        {stats.hasDisplayData ? (
          <div>
            <dt>UI</dt>
            <dd>displayData 全量保留</dd>
          </div>
        ) : null}
        {stats.truncated ? (
          <div>
            <dt>截断</dt>
            <dd>是</dd>
          </div>
        ) : null}
        {stats.anchors && Object.keys(stats.anchors).length > 0 ? (
          <div>
            <dt>锚点</dt>
            <dd>{Object.entries(stats.anchors).map(([k, v]) => `${k}=${v}`).join(" · ")}</dd>
          </div>
        ) : null}
        {stats.refetch ? (
          <div>
            <dt>续读</dt>
            <dd className="tool-agent-view__refetch">{formatAgentViewRefetch(stats.refetch)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
