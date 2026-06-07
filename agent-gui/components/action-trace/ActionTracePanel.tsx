"use client";

import { useRef } from "react";
import { ActionTraceTimeline } from "@/components/action-trace/ActionTraceTimeline";
import {
  closeActionTraceTab,
  setActionTraceViewMode,
  useActionTraceTab,
  type ActionTraceTabState,
} from "@/lib/action-trace-overlay";
import { useFollowScrollTail } from "@/lib/use-follow-scroll-tail";

function formatTraceMeta(trace: ActionTraceTabState): string {
  if (trace.status === "running") {
    const events =
      trace.events.length > 0 ? `${trace.events.length} 步 · ` : "";
    const lines = trace.lineCount > 0 ? `${trace.lineCount} 行 · ` : "";
    return `${events || lines}调试中…`;
  }
  if (trace.status === "error") return "调试失败";
  const parts: string[] = [
    trace.errorMessage?.trim() ? "动作未成功完成" : "调试完成",
  ];
  const count = trace.eventCount ?? trace.events.length;
  if (count > 0) parts.push(`${count} 步`);
  if (trace.durationMs != null) parts.push(`${trace.durationMs}ms`);
  return parts.join(" · ");
}

type ActionTracePanelProps = {
  tabId: string | null;
  className?: string;
  pingOk?: boolean;
};

/** In-page trace panel (tool-test main pane or workspace side panel tab). */
export function ActionTracePanel({
  tabId,
  className,
  pingOk,
}: ActionTracePanelProps) {
  const trace = useActionTraceTab(tabId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isLive = trace?.status === "running";
  const streamFailed = trace?.status === "error";
  const actionFailed =
    trace?.status === "success" && Boolean(trace.errorMessage?.trim());
  const showTimeline = trace?.viewMode !== "terminal";
  const title =
    trace?.actionTitle?.trim()
    || trace?.actionId
    || "动作调试";

  const displayOutput =
    trace?.output
    || (isLive ? "调试连接中…\n" : "");

  useFollowScrollTail(
    scrollRef,
    Boolean(trace) && trace?.viewMode === "terminal" && isLive,
    trace?.lineCount ?? 0,
    trace?.status ?? "idle",
    trace?.output.length ?? 0,
  );

  const showEmpty = !trace;

  return (
    <section
      className={["action-trace-panel", className].filter(Boolean).join(" ")}
      aria-label="调试"
    >
      <header className="action-trace-panel__head">
        <div className="action-trace-panel__head-text">
          <h2 className="action-trace-panel__title">调试</h2>
          {trace ? (
            <p className="action-trace-panel__subtitle" title={trace.actionId}>
              {title}
            </p>
          ) : (
            <p className="action-trace-panel__subtitle tool-muted">
              运行动作调试后在此查看流式步骤
            </p>
          )}
        </div>
        <div className="action-trace-panel__actions">
          {pingOk != null ? (
            <span
              className={
                pingOk
                  ? "action-trace-panel__ping action-trace-panel__ping--ok"
                  : "action-trace-panel__ping action-trace-panel__ping--err"
              }
            >
              RPC {pingOk ? "正常" : "未连接"}
            </span>
          ) : null}
          {trace && tabId ? (
            <>
              <div
                className="action-trace-panel__view-tabs"
                role="tablist"
                aria-label="Trace 视图"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={showTimeline}
                  className={
                    showTimeline
                      ? "action-trace-panel__view-tab action-trace-panel__view-tab--active"
                      : "action-trace-panel__view-tab"
                  }
                  onClick={() => setActionTraceViewMode(tabId, "timeline")}
                >
                  时间线
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={!showTimeline}
                  className={
                    !showTimeline
                      ? "action-trace-panel__view-tab action-trace-panel__view-tab--active"
                      : "action-trace-panel__view-tab"
                  }
                  onClick={() => setActionTraceViewMode(tabId, "terminal")}
                >
                  终端
                </button>
              </div>
              <span
                className={[
                  "action-trace-panel__meta",
                  "tool-muted",
                  streamFailed ? "action-trace-panel__meta--err" : "",
                  actionFailed ? "action-trace-panel__meta--warn" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {formatTraceMeta(trace)}
              </span>
              <button
                type="button"
                className="action-trace-panel__clear"
                onClick={() => closeActionTraceTab(tabId)}
                aria-label="关闭 trace 标签"
              >
                关闭
              </button>
            </>
          ) : null}
        </div>
      </header>

      <div className="action-trace-panel__body">
        {showEmpty ? (
          <p className="action-trace-panel__empty tool-muted">
            调试动作时会在此打开独立标签；可同时保留多个动作的 trace 记录。
          </p>
        ) : showTimeline ? (
          <ActionTraceTimeline
            events={trace.events}
            isLive={Boolean(isLive)}
            status={trace.status}
          />
        ) : (
          <div className="action-trace-terminal action-trace-terminal--fill">
            <div className="action-trace-terminal__cmd" title={trace.commandLine}>
              <span className="action-trace-terminal__prompt" aria-hidden>
                $
              </span>
              <code>{trace.commandLine || "qkrpc action run --trace"}</code>
            </div>
            <div
              ref={scrollRef}
              className={[
                "action-trace-terminal__out",
                isLive ? "action-trace-terminal__out--live" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <pre className="action-trace-terminal__text">{displayOutput}</pre>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
