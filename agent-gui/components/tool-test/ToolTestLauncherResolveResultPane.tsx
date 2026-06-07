"use client";

import { useEffect, useRef } from "react";
import type { LauncherResolveCandidate } from "@/lib/launcher/launcher-resolve-presets";
import {
  formatLauncherResolveRunTime,
  type LauncherResolveRunEntry,
} from "@/lib/tool-test-launcher-resolve-runs";
import { ToolTestRunsPaneShell } from "@/components/tool-test/ToolTestRunsPaneShell";

type ToolTestLauncherResolveResultPaneProps = {
  runs: LauncherResolveRunEntry[];
  onClearRuns: () => void;
};

function CandidateRow({ candidate }: { candidate: LauncherResolveCandidate }) {
  return (
    <li className="tool-test-launcher-resolve-candidate">
      <span className="tool-test-launcher-resolve-candidate__score">
        {candidate.score}
      </span>
      <div className="tool-test-launcher-resolve-candidate__body">
        <strong>
          [{candidate.kind}] {candidate.title}
        </strong>
        {candidate.subtitle ? (
          <span className="tool-test-launcher-resolve-candidate__sub">
            {candidate.subtitle}
          </span>
        ) : null}
        <p className="tool-test-launcher-resolve-candidate__tool">
          → <code>{candidate.suggestedTool ?? "—"}</code>
          {candidate.presetBoost ? (
            <span className="tool-test-launcher-resolve-candidate__boost">
              preset +{candidate.presetBoost}
            </span>
          ) : null}
        </p>
      </div>
    </li>
  );
}

function RunCard({ run }: { run: LauncherResolveRunEntry }) {
  const top = run.candidates?.[0];
  return (
    <article className="tool-test-settings-intent-run tool-test-launcher-resolve-run">
      <header className="tool-test-settings-intent-run__header">
        <span className="tool-test-settings-intent-run__label">
          {run.triggerLabel ?? "Resolve"}
        </span>
        <code className="tool-test-settings-intent-result__utterance">
          {run.query}
        </code>
        <span
          className={`tool-test-settings-intent-run__badge${top ? " tool-test-settings-intent-run__badge--ok" : ""}`}
        >
          {top ? top.kind : run.status === "running" ? "…" : "—"}
        </span>
        <time dateTime={new Date(run.at).toISOString()}>
          {formatLauncherResolveRunTime(run.at)}
        </time>
      </header>
      {run.error ? (
        <p className="tool-test-settings-intent-result__error">{run.error}</p>
      ) : null}
      {run.status === "running" ? (
        <p className="tool-test-settings-intent-run__pending">运行中…</p>
      ) : null}
      {run.candidates && run.candidates.length > 0 ? (
        <ol className="tool-test-launcher-resolve-run__list">
          {run.candidates.slice(0, 6).map((c, i) => (
            <CandidateRow key={`${c.kind}-${c.title}-${i}`} candidate={c} />
          ))}
        </ol>
      ) : null}
    </article>
  );
}

export function ToolTestLauncherResolveResultPane({
  runs,
  onClearRuns,
}: ToolTestLauncherResolveResultPaneProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: runs.length > 1 ? "smooth" : "auto",
    });
  }, [runs.length, runs[runs.length - 1]?.status]);

  return (
    <ToolTestRunsPaneShell
      heading="Launcher Resolve"
      subText={runs.length === 0 ? "侧栏运行 resolve" : `${runs.length} 次`}
      emptyText="点击侧栏 query 或「批量快测」"
      runs={runs}
      onClearRuns={onClearRuns}
      streamAnchorRef={endRef}
    >
      {runs.map((run) => (
        <RunCard key={run.id} run={run} />
      ))}
    </ToolTestRunsPaneShell>
  );
}
