"use client";

import { useCallback, useState } from "react";
import { invokeActionCommand } from "@/lib/action-command-client";

type ActionProjectToolbarProps = {
  actionId: string;
  displayTitle?: string;
};

export function ActionProjectToolbar({
  actionId,
}: ActionProjectToolbarProps) {
  const [param, setParam] = useState("");
  const [runBusy, setRunBusy] = useState(false);
  const [runStatusText, setRunStatusText] = useState<string | null>(null);
  const [runStatusErr, setRunStatusErr] = useState(false);

  const runCommand = useCallback(
    async (
      label: string,
      fn: () => Promise<{ ok: boolean; error?: string; message?: string }>,
    ) => {
      if (runBusy) return;
      setRunBusy(true);
      setRunStatusText(null);
      setRunStatusErr(false);
      const result = await fn();
      setRunBusy(false);
      if (result.ok) {
        setRunStatusText(result.message ?? label);
        setRunStatusErr(false);
      } else {
        setRunStatusText(result.error ?? "操作失败");
        setRunStatusErr(true);
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
    async (debug: boolean) => {
      await runCommand(
        debug ? "已启动调试运行" : "已运行动作",
        () =>
          invokeActionCommand({
            op: "run",
            id: actionId,
            param: param.trim() || undefined,
            debug,
          }),
      );
    },
    [actionId, param, runCommand],
  );

  return (
    <footer className="project-info-toolbar" aria-label="动作项目操作">
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

      <div className="project-info-toolbar-debug">
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
        <button
          type="button"
          className="project-info-toolbar-btn project-info-toolbar-btn--debug"
          disabled={runBusy}
          onClick={() => void runAction(true)}
          title="带参数调试运行并打开 Quicker 步骤调试器"
        >
          调试
        </button>
      </div>

      {runStatusText ? (
        <p
          className={`project-info-toolbar-status${
            runStatusErr ? " project-info-toolbar-status--err" : ""
          }`}
          role="status"
        >
          {runStatusText}
        </p>
      ) : null}
    </footer>
  );
}
