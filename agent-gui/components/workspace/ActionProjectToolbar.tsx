"use client";

import { useCallback, useState } from "react";
import { startActionTrace } from "@/lib/action-trace-client";
import { invokeActionCommand } from "@/lib/action-command-client";
import { pushAppMessage } from "@/lib/app-messages";

type ActionProjectToolbarProps = {
  actionId: string;
  displayTitle?: string;
  className?: string;
  /** Inline param input beside run buttons (ActionLinkCard-style). */
  layout?: "stacked" | "inline";
};

const TOOLBAR_MESSAGE_ID = "action-project-toolbar";

export function ActionProjectToolbar({
  actionId,
  className,
  layout = "stacked",
}: ActionProjectToolbarProps) {
  const [param, setParam] = useState("");
  const [runBusy, setRunBusy] = useState(false);

  const runCommand = useCallback(
    async (
      label: string,
      fn: () => Promise<{ ok: boolean; error?: string; message?: string }>,
    ) => {
      if (runBusy) return;
      setRunBusy(true);
      const result = await fn();
      setRunBusy(false);
      if (result.ok) {
        pushAppMessage({
          id: TOOLBAR_MESSAGE_ID,
          kind: "success",
          body: result.message ?? label,
          autoDismissMs: 3500,
        });
      } else {
        pushAppMessage({
          id: TOOLBAR_MESSAGE_ID,
          kind: "error",
          body: result.error ?? "操作失败",
          autoDismissMs: 6000,
        });
      }
    },
    [runBusy],
  );

  const editAction = useCallback(async () => {
    await runCommand("已在 Quicker 中打开动作编辑器", () =>
      invokeActionCommand({ op: "edit", id: actionId }),
    );
  }, [actionId, runCommand]);

  const floatAction = useCallback(async () => {
    await runCommand("已显示悬浮按钮", () =>
      invokeActionCommand({ op: "float", id: actionId }),
    );
  }, [actionId, runCommand]);

  const runAction = useCallback(
    async (trace: boolean) => {
      if (trace) {
        if (runBusy) return;
        setRunBusy(true);
        const result = await startActionTrace({
          actionId,
          param: param.trim() || undefined,
        });
        setRunBusy(false);
        if (result.ok) {
          pushAppMessage({
            id: TOOLBAR_MESSAGE_ID,
            kind: "success",
            body: "已启动调试",
            autoDismissMs: 3500,
          });
        } else {
          pushAppMessage({
            id: TOOLBAR_MESSAGE_ID,
            kind: "error",
            body: result.error ?? "调试失败",
            autoDismissMs: 6000,
          });
        }
        return;
      }

      await runCommand("已运行动作", () =>
        invokeActionCommand({
          op: "run",
          id: actionId,
          param: param.trim() || undefined,
        }),
      );
    },
    [actionId, param, runBusy, runCommand],
  );

  const paramInput = layout === "inline" ? (
    <div className="action-link-card-param-wrap project-info-toolbar-param-inline">
      <input
        type="text"
        className="action-link-card-param-input"
        value={param}
        placeholder="参数"
        title="传给 Quicker 的运行/调试参数（--param）"
        aria-label="运行参数"
        disabled={runBusy}
        onChange={(e) => setParam(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void runAction(true);
          }
        }}
      />
    </div>
  ) : (
    <label className="project-info-toolbar-param">
      <span className="project-info-toolbar-param-label">运行参数</span>
      <input
        type="text"
        className="project-info-toolbar-param-input"
        value={param}
        placeholder="可选"
        disabled={runBusy}
        onChange={(e) => setParam(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void runAction(true);
          }
        }}
      />
    </label>
  );

  const runCluster = (
    <>
      <button
        type="button"
        className="project-info-toolbar-btn project-info-toolbar-btn--primary"
        disabled={runBusy}
        onClick={() => void runAction(false)}
      >
        运行
      </button>
      <button
        type="button"
        className="project-info-toolbar-btn project-info-toolbar-btn--debug"
        disabled={runBusy}
        onClick={() => void runAction(true)}
        title="调试：在右侧侧栏查看步骤输出"
      >
        调试
      </button>
      {layout === "inline" ? paramInput : null}
    </>
  );

  const otherButtons = (
    <>
      <button
        type="button"
        className="project-info-toolbar-btn"
        disabled={runBusy}
        onClick={() => void editAction()}
        title="在 Quicker 中打开动作编辑器"
      >
        编辑
      </button>
      <button
        type="button"
        className="project-info-toolbar-btn"
        disabled={runBusy}
        onClick={() => void floatAction()}
      >
        悬浮
      </button>
    </>
  );

  return (
    <footer
      className={[
        "project-info-toolbar",
        layout === "inline" ? "project-info-toolbar--inline" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="动作项目操作"
    >
      {layout === "inline" ? (
        <>
          {runCluster}
          {otherButtons}
        </>
      ) : (
        <>
          <div className="project-info-toolbar-actions">
            {runCluster}
            {otherButtons}
          </div>
          {paramInput}
        </>
      )}
    </footer>
  );
}
