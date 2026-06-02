"use client";

import { useCallback, useState } from "react";
import {
  formatActionIdShort,
  type ActionPatchFollowUpContext,
} from "@/lib/action-patch-followup";

type ActionPatchFollowUpProps = {
  context: ActionPatchFollowUpContext;
  disabled?: boolean;
};

type RunState = "idle" | "loading" | "ok" | "err";

async function invokeActionCommand(body: {
  op: "run" | "edit";
  id: string;
  param?: string;
  debug?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/actions/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}

export function ActionPatchFollowUp({
  context,
  disabled = false,
}: ActionPatchFollowUpProps) {
  const [param, setParam] = useState("");
  const [runState, setRunState] = useState<RunState>("idle");
  const [statusText, setStatusText] = useState<string | null>(null);

  const busy = runState === "loading" || disabled;

  const run = useCallback(
    async (opts: { debug: boolean }) => {
      if (busy) return;
      setRunState("loading");
      setStatusText(null);
      const result = await invokeActionCommand({
        op: "run",
        id: context.actionId,
        param: param.trim() || undefined,
        debug: opts.debug,
      });
      if (result.ok) {
        setRunState("ok");
        setStatusText(
          opts.debug ? "已启动调试运行（Quicker 步骤调试器）" : "已运行动作",
        );
      } else {
        setRunState("err");
        setStatusText(result.error ?? "运行失败");
      }
    },
    [busy, context.actionId, param],
  );

  const edit = useCallback(async () => {
    if (busy) return;
    setRunState("loading");
    setStatusText(null);
    const result = await invokeActionCommand({
      op: "edit",
      id: context.actionId,
    });
    if (result.ok) {
      setRunState("ok");
      setStatusText("已在 Quicker 中打开动作编辑器");
    } else {
      setRunState("err");
      setStatusText(result.error ?? "打开编辑器失败");
    }
  }, [busy, context.actionId]);

  return (
    <div
      className="action-patch-followup"
      role="region"
      aria-label="动作修补后的快捷操作"
    >
      <div className="action-patch-followup-head">
        <span className="action-patch-followup-label">动作已保存</span>
        {context.actionTitle ? (
          <span className="action-patch-followup-title" title={context.actionTitle}>
            {context.actionTitle}
          </span>
        ) : (
          <code className="action-patch-followup-id" title={context.actionId}>
            {formatActionIdShort(context.actionId)}
          </code>
        )}
        {context.editVersion != null && (
          <span className="action-patch-followup-version">
            v{context.editVersion}
          </span>
        )}
      </div>

      <div className="action-patch-followup-actions">
        <button
          type="button"
          className="action-patch-followup-btn action-patch-followup-btn--primary"
          disabled={busy}
          onClick={() => void run({ debug: false })}
        >
          运行动作
        </button>
        <button
          type="button"
          className="action-patch-followup-btn"
          disabled={busy}
          onClick={() => void edit()}
        >
          编辑动作
        </button>
      </div>

      <div className="action-patch-followup-debug">
        <label className="action-patch-followup-param">
          <span className="action-patch-followup-param-label">运行参数</span>
          <input
            type="text"
            className="action-patch-followup-param-input"
            value={param}
            placeholder="可选，传给动作的输入参数"
            disabled={busy}
            onChange={(e) => setParam(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void run({ debug: true });
              }
            }}
          />
        </label>
        <button
          type="button"
          className="action-patch-followup-btn action-patch-followup-btn--debug"
          disabled={busy}
          onClick={() => void run({ debug: true })}
          title="带参数调试运行并打开 Quicker 步骤调试器"
        >
          调试运行
        </button>
      </div>

      {statusText && (
        <p
          className={`action-patch-followup-status${
            runState === "err" ? " action-patch-followup-status--err" : ""
          }`}
          role="status"
        >
          {statusText}
        </p>
      )}
    </div>
  );
}
