"use client";

import type { ProgramDiagnosticsView } from "@/lib/program-diagnostics-view";
import {
  formatProgramDiagnosticsStatusLabel,
  type ProgramDiagnosticsIssue,
} from "@/lib/program-diagnostics-view";

function SeverityBadge({ severity }: { severity: ProgramDiagnosticsIssue["severity"] }) {
  return (
    <span
      className={`program-diagnostics-issue__severity program-diagnostics-issue__severity--${severity}`}
    >
      {severity === "warning" ? "警告" : "错误"}
    </span>
  );
}

function IssueRow({ issue }: { issue: ProgramDiagnosticsIssue }) {
  const read = issue.location?.read;
  const readLine =
    read?.tool === "workspace_action_file_read" && read.path
      ? read.startLine != null && read.endLine != null
        ? `${read.path} L${read.startLine}-${read.endLine}`
        : read.startLine != null
          ? `${read.path} L${read.startLine}`
          : read.path
      : read?.tool === "workspace_action_read_data"
        ? "read_data mode=content"
        : read?.tool
          ? read.tool
          : null;

  return (
    <li className="program-diagnostics-issue">
      <div className="program-diagnostics-issue__head">
        <SeverityBadge severity={issue.severity} />
        <code className="program-diagnostics-issue__code">{issue.code}</code>
        {issue.kind ? (
          <span className="program-diagnostics-issue__kind">{issue.kind}</span>
        ) : null}
      </div>
      <p className="program-diagnostics-issue__message">{issue.message}</p>
      {issue.locationSummary ? (
        <p className="program-diagnostics-issue__location" title={issue.locationSummary}>
          {issue.locationSummary}
        </p>
      ) : null}
      {readLine ? (
        <p className="program-diagnostics-issue__read">
          <span className="tool-muted">read</span>{" "}
          <code>{readLine}</code>
        </p>
      ) : null}
    </li>
  );
}

export function ProgramDiagnosticsResultView({
  view,
}: {
  view: ProgramDiagnosticsView;
}) {
  const statusLabel = formatProgramDiagnosticsStatusLabel(view.status);
  const errors = view.summary?.errorCount ?? 0;
  const warnings = view.summary?.warningCount ?? 0;
  const checked = view.summary?.checked;
  const skipped = view.summary?.skipped;
  const totalIssues = view.issueCount ?? view.issues.length;
  const statusClass = `program-diagnostics-result__status--${view.status.toLowerCase()}`;

  return (
    <div className="program-diagnostics-result">
      <p className="program-diagnostics-result__meta">
        <span className="program-diagnostics-result__title">诊断</span>
        <span className="program-diagnostics-result__sep" aria-hidden>
          ·
        </span>
        <span className={`program-diagnostics-result__status ${statusClass}`}>
          {statusLabel}
        </span>
        {view.program ? (
          <>
            <span className="program-diagnostics-result__sep" aria-hidden>
              ·
            </span>
            <span>{view.program}</span>
          </>
        ) : null}
        {errors > 0 || warnings > 0 ? (
          <>
            <span className="program-diagnostics-result__sep" aria-hidden>
              ·
            </span>
            {errors > 0 ? (
              <span className="program-diagnostics-result__count program-diagnostics-result__count--err">
                {errors} 错误
              </span>
            ) : null}
            {warnings > 0 ? (
              <span className="program-diagnostics-result__count program-diagnostics-result__count--warn">
                {warnings} 警告
              </span>
            ) : null}
          </>
        ) : view.status === "ready" ? (
          <>
            <span className="program-diagnostics-result__sep" aria-hidden>
              ·
            </span>
            <span className="program-diagnostics-result__ok">通过</span>
          </>
        ) : null}
        {checked != null ? (
          <>
            <span className="program-diagnostics-result__sep" aria-hidden>
              ·
            </span>
            <span className="tool-muted">
              已检 {checked}
              {skipped != null && skipped > 0 ? ` · 跳过 ${skipped}` : ""}
            </span>
          </>
        ) : null}
      </p>

      {view.hint ? <p className="tool-hint">{view.hint}</p> : null}
      {view.lintError ? (
        <p className="file-editor-footnote file-editor-footnote--err">{view.lintError}</p>
      ) : null}

      {view.issues.length > 0 ? (
        <>
          {totalIssues > view.issues.length ? (
            <p className="tool-muted tool-hint">
              显示前 {view.issues.length} 条，共 {totalIssues} 条
            </p>
          ) : null}
          <ul className="program-diagnostics-issue-list">
            {view.issues.map((issue, index) => (
              <IssueRow
                key={`${issue.code}-${index}-${issue.message.slice(0, 24)}`}
                issue={issue}
              />
            ))}
          </ul>
        </>
      ) : view.status === "ready" ? (
        <p className="tool-muted tool-hint">未发现表达式/C# 语法问题</p>
      ) : view.status === "none" ? (
        <p className="tool-muted tool-hint">尚无诊断快照；先 patch 再调用本工具</p>
      ) : null}
    </div>
  );
}
