"use client";

import { useCallback, useState } from "react";
import { startActionTrace } from "@/lib/action-trace-client";
import { invokeActionCommand } from "@/lib/action-command-client";
import { pushAppMessage } from "@/lib/app-messages";

type ActionProjectToolbarProps = {
  actionId: string;
  displayTitle?: string;
  className?: string;
};

const TOOLBAR_MESSAGE_ID = "action-project-toolbar";

export function ActionProjectToolbar({
  actionId,
  className,
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
            body: "已启动 trace 调试",
            autoDismissMs: 3500,
          });
        } else {
          pushAppMessage({
            id: TOOLBAR_MESSAGE_ID,
            kind: "error",
            body: result.error ?? "trace 失败",
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

  return (
    <footer
      className={["project-info-toolbar", className].filter(Boolean).join(" ")}
      aria-label="动作项目操作"
    >
      <div className="project-info-toolbar-actions">
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
          title="trace 调试：在右侧侧栏查看步骤输出（不打开 Quicker 调试器）"
        >
          调试
        </button>
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
      </div>

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
    </footer>
  );
}
