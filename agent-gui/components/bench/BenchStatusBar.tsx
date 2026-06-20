"use client";

import { formatBenchMockSummary } from "@/lib/use-bench-chat-controller";
import { revealPathInFileManagerClient } from "@/lib/reveal-path-in-file-manager.client";
import { useBenchChat } from "./BenchChatProvider";

function truncatePath(path: string, max = 56): string {
  if (path.length <= max) return path;
  return `…${path.slice(-(max - 1))}`;
}

function runStatusLabel(
  status: string,
  mockSummary: string | null,
  chatBusy: boolean,
): string {
  if (chatBusy) return "对话运行中…";
  if (mockSummary) return mockSummary;
  if (status === "preparing") return "准备临时工作区…";
  if (status === "running") return "Agent 对话中…";
  if (status === "verifying") return "Mock 断言中…";
  if (status === "done") return "完成";
  if (status === "error") return "失败";
  return "选择左侧任务开始评测";
}

export function BenchStatusBar() {
  const {
    selectedRun,
    benchWorkspace,
    chatBusy,
    viewingHistory,
    messages,
    exporting,
    exportActiveConversation,
    cleanupSession,
    cleanupBusy,
    liveMessages,
    activeExportResult,
    cleanupHint,
  } = useBenchChat();

  const mockSummary = selectedRun ? formatBenchMockSummary(selectedRun) : null;
  const statusText = selectedRun
    ? runStatusLabel(selectedRun.status, mockSummary, chatBusy)
    : "隔离空工作区 · 选择左侧任务开始评测";

  const statusClass =
    selectedRun?.status === "error"
      ? "bench-status-bar__status--error"
      : selectedRun?.status === "done"
        ? "bench-status-bar__status--pass"
        : chatBusy || selectedRun?.status === "running" || selectedRun?.status === "verifying"
          ? "bench-status-bar__status--busy"
          : "";

  const canExport = messages.length > 0 && !exporting;
  const canCleanup =
    liveMessages.length > 0 && !chatBusy && !cleanupBusy && !viewingHistory;
  const alertText = selectedRun?.error ?? cleanupHint ?? null;

  return (
    <div className="bench-status-bar" role="status">
      <div className="bench-status-bar__main">
        <div className="bench-status-bar__leading">
          <span className="bench-status-bar__badge">benchMode</span>
          {viewingHistory ? (
            <span className="bench-status-bar__hint">历史记录（只读）</span>
          ) : null}
          <span className={`bench-status-bar__status ${statusClass}`.trim()}>
            {statusText}
            {selectedRun?.actionId
              ? ` · ${selectedRun.actionId.slice(0, 8)}…`
              : ""}
          </span>
          {benchWorkspace ? (
            <code className="bench-status-bar__cwd" title={benchWorkspace}>
              {truncatePath(benchWorkspace)}
            </code>
          ) : null}
        </div>
        <div className="bench-status-bar__actions">
          <button
            type="button"
            className="bench-status-bar__action-btn"
            disabled={!canExport}
            onClick={() => void exportActiveConversation()}
            title="导出对话 JSON"
          >
            {exporting ? "导出中…" : "导出"}
          </button>
          <button
            type="button"
            className="bench-status-bar__action-btn"
            disabled={!canCleanup}
            onClick={() => void cleanupSession()}
            title="清理临时工作区与对话"
          >
            {cleanupBusy ? "清理中…" : "清理"}
          </button>
          {activeExportResult?.path ? (
            <button
              type="button"
              className="bench-status-bar__action-btn bench-status-bar__action-btn--link"
              onClick={() =>
                void revealPathInFileManagerClient(
                  "chat-exports",
                  activeExportResult.path!,
                )}
              title={activeExportResult.path}
            >
              导出文件
            </button>
          ) : null}
        </div>
      </div>
      {alertText ? (
        <p
          className={`bench-status-bar__alert${
            selectedRun?.error ? " bench-status-bar__alert--error" : ""
          }`}
          role={selectedRun?.error ? "alert" : "status"}
        >
          {alertText}
        </p>
      ) : null}
    </div>
  );
}
