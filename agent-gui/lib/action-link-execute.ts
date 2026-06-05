"use client";

import { invokeActionCommand } from "@/lib/action-command-client";
import { pullActionProjectFromQuicker } from "@/lib/action-project-sync-client";
import type { ActionLinkOp } from "@/lib/action-link-markup";
import { defaultActionLinkLabel } from "@/lib/action-link-markup";
import { pushAppMessage } from "@/lib/app-messages";
import { workspaceExplorerActionsRef } from "@/lib/workspace-explorer";

const TOAST_ID = "action-link-chip";

export async function executeActionLinkOp(
  actionId: string,
  op: ActionLinkOp,
  options?: { cwd?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cwd = options?.cwd?.trim() ?? "";

  if (op === "workspace") {
    const explorer = workspaceExplorerActionsRef.current;
    explorer.setPanelOpen(true);
    if (cwd) {
      const pull = await pullActionProjectFromQuicker(cwd, actionId);
      if (!pull.ok) {
        pushAppMessage({
          id: TOAST_ID,
          kind: "warning",
          body: `${pull.error}；仍尝试打开本地项目`,
          autoDismissMs: 5000,
        });
      } else {
        await explorer.refreshTree();
      }
    } else {
      pushAppMessage({
        id: TOAST_ID,
        kind: "info",
        body: "未设置工作目录，仅打开已有本地动作项目",
        autoDismissMs: 4000,
      });
    }
    explorer.revealActionProjectById(actionId);
    pushAppMessage({
      id: TOAST_ID,
      kind: "success",
      body: defaultActionLinkLabel("workspace"),
      autoDismissMs: 3000,
    });
    return { ok: true };
  }

  if (op === "debug") {
    const result = await invokeActionCommand({
      op: "run",
      id: actionId,
      debug: true,
    });
    if (result.ok) {
      pushAppMessage({
        id: TOAST_ID,
        kind: "success",
        body: successMessage("debug"),
        autoDismissMs: 3500,
      });
      return { ok: true };
    }
    pushAppMessage({
      id: TOAST_ID,
      kind: "error",
      body: result.error ?? "操作失败",
      autoDismissMs: 6000,
    });
    return { ok: false, error: result.error ?? "操作失败" };
  }

  const commandOp = op;
  const result = await invokeActionCommand({ op: commandOp, id: actionId });
  if (result.ok) {
    pushAppMessage({
      id: TOAST_ID,
      kind: "success",
      body: successMessage(commandOp),
      autoDismissMs: 3500,
    });
    return { ok: true };
  }
  pushAppMessage({
    id: TOAST_ID,
    kind: "error",
    body: result.error ?? "操作失败",
    autoDismissMs: 6000,
  });
  return { ok: false, error: result.error ?? "操作失败" };
}

function successMessage(op: "run" | "debug" | "edit" | "float"): string {
  switch (op) {
    case "run":
      return "已运行动作";
    case "debug":
      return "已启动调试运行（Quicker 步骤调试器）";
    case "edit":
      return "已在 Quicker 中打开动作编辑器";
    case "float":
      return "已显示悬浮按钮";
  }
}
