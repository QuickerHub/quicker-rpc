"use client";

import { useCallback, useRef, useState } from "react";

type ToolTestSessionAnalysisSectionProps = {
  disabled?: boolean;
};

export function ToolTestSessionAnalysisSection({
  disabled,
}: ToolTestSessionAnalysisSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [exportText, setExportText] = useState("");
  const [report, setReport] = useState("");
  const [summary, setSummary] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setReport("");
    setSummary("");
    try {
      const text = await file.text();
      setExportText(text);
    } catch {
      setError("无法读取文件");
    }
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!exportText.trim()) {
      setError("请先选择 quicker-agent-*.json 导出文件");
      return;
    }
    setRunning(true);
    setError(null);
    setReport("");
    setSummary("");
    try {
      const res = await fetch("/api/dev/session-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exportText }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        report?: string;
        error?: string;
        matchedTaskId?: string | null;
        traceRubricPassed?: boolean;
        toolCallCount?: number;
        findingCount?: number;
      };
      if (!res.ok || !data.ok || !data.report) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setReport(data.report);
      const parts = [
        data.matchedTaskId ? `benchmark: ${data.matchedTaskId}` : "benchmark: —",
        `E-axis: ${data.traceRubricPassed ? "PASS" : "FAIL"}`,
        `tools: ${data.toolCallCount ?? "?"}`,
        `findings: ${data.findingCount ?? "?"}`,
      ];
      setSummary(parts.join(" · "));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [exportText]);

  const disabledAll = disabled || running;

  return (
    <section className="ctx-compression-panel__harness" aria-label="会话分析">
      <p className="autofix-panel__section-label">Session 分析</p>
      <p className="ctx-compression-panel__mode-hint">
        加载 QuickerAgent 导出的 <code>quicker-agent-*.json</code>，自动跑 trace 规则并给出 prompt / tool 优化建议。
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        onChange={(event) => void onFileChange(event)}
      />

      <div className="autofix-panel__footer">
        <button
          type="button"
          className="autofix-panel__run-btn"
          disabled={disabledAll}
          onClick={onPickFile}
        >
          选择导出 JSON
        </button>
        <button
          type="button"
          className={`autofix-panel__run-btn${running ? " autofix-panel__run-btn--running" : ""}`}
          disabled={disabledAll || !exportText.trim()}
          onClick={() => void runAnalysis()}
        >
          {running ? "分析中…" : "▶ 分析"}
        </button>
      </div>

      {fileName ? (
        <p className="autofix-panel__run-hint">
          已加载：<code>{fileName}</code>
          {summary ? ` — ${summary}` : ""}
        </p>
      ) : null}

      {error ? <p className="ctx-compression-panel__prompt-preview">{error}</p> : null}

      {report ? (
        <pre className="tool-json ctx-compression-panel__agent-view-output">{report}</pre>
      ) : null}
    </section>
  );
}
