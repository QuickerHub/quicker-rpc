export type PendingToolApproval = {
  id: string;
  toolName: string;
  label: string;
  input: unknown;
  destructive: boolean;
};

import { formatShellApprovalCommand } from "@/lib/shell-policy";
import { isShellToolName } from "@/lib/host-tool-constants";

export type ApprovalDockCopy = {
  destructive: boolean;
  title: string;
  summary: string;
  approveLabel: string;
  denyLabel: string;
  /** Full shell command bodies for shell_exec confirmations. */
  shellCommands?: string[];
  /** When local .quicker/actions projects exist for pending action deletes. */
  workspaceDelete?: {
    count: number;
    checkboxLabel: string;
    detail?: string;
  };
};

export function extractApprovalTargetId(input: unknown): string | null {
  if (typeof input !== "object" || input === null) return null;
  const id = (input as Record<string, unknown>).id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export function summarizeApprovalTarget(toolName: string, input: unknown): string {
  if (typeof input !== "object" || input === null) return "即将执行此操作";

  const o = input as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (id) {
    if (toolName === "qkrpc_action_delete") return `动作 ${formatShortId(id)}`;
    if (toolName === "qkrpc_subprogram_delete") return `子程序 ${formatShortId(id)}`;
    return formatShortId(id);
  }
  if (typeof o.title === "string") return o.title;
  if (typeof o.command === "string" && o.command.trim()) {
    const oneLine = o.command.trim().replace(/\s+/g, " ");
    return oneLine.length > 80 ? `${oneLine.slice(0, 77)}…` : oneLine;
  }
  if (typeof o.scriptPath === "string" && o.scriptPath.trim()) {
    return o.scriptPath.trim();
  }
  if (typeof o.query === "string") return o.query;
  return "即将执行此操作";
}

function formatShortId(id: string): string {
  return id.length <= 12 ? id : `${id.slice(0, 8)}…`;
}

function buildDeleteDockCopy(
  entity: "action" | "subprogram",
  items: PendingToolApproval[],
  workspaceHitCount = 0,
): ApprovalDockCopy {
  const entityLabel = entity === "action" ? "动作" : "子程序";
  const count = items.length;
  const ids = items
    .map((item) => extractApprovalTargetId(item.input))
    .filter((id): id is string => id !== null);

  let summary: string;
  if (count === 1) {
    summary = ids[0]
      ? `永久删除 1 个${entityLabel}（${formatShortId(ids[0])}）`
      : `永久删除 1 个${entityLabel}`;
  } else {
    const preview = ids.slice(0, 3).map(formatShortId);
    const previewSuffix =
      preview.length > 0
        ? `（${preview.join("、")}${count > preview.length ? ` 等 ${count} 项` : ""}）`
        : "";
    summary = `永久删除 ${count} 个${entityLabel}${previewSuffix}`;
  }

  return {
    destructive: true,
    title: `危险操作：删除${entityLabel}`,
    summary,
    approveLabel: count > 1 ? `确认删除 ${count} 项` : "确认删除",
    denyLabel: count > 1 ? "全部取消" : "取消",
    workspaceDelete: buildWorkspaceDeleteCopy(
      entity,
      workspaceHitCount,
      count,
    ),
  };
}

function buildWorkspaceDeleteCopy(
  entity: "action" | "subprogram",
  workspaceHitCount: number,
  pendingDeleteCount: number,
): ApprovalDockCopy["workspaceDelete"] {
  if (workspaceHitCount <= 0) return undefined;

  const folder =
    entity === "action" ? ".quicker/actions" : ".quicker/subprograms";
  const entityNoun = entity === "action" ? "动作" : "子程序";
  const libraryLabel =
    entity === "action" ? "Quicker 动作库" : "Quicker 公共子程序库";

  const checkboxLabel =
    workspaceHitCount === 1
      ? `同时删除工作区中的${entityNoun}项目（${folder}）`
      : `同时删除工作区中的 ${workspaceHitCount} 个${entityNoun}项目（${folder}）`;

  let detail: string | undefined;
  if (workspaceHitCount < pendingDeleteCount) {
    detail = `已检测到 ${workspaceHitCount} / ${pendingDeleteCount} 个待删${entityNoun}在工作区有本地项目；未勾选时仅删除 ${libraryLabel}。`;
  } else if (pendingDeleteCount > 1) {
    detail = `勾选后将一并移除对应 ${folder} 目录；未勾选时仅删除 ${libraryLabel}。`;
  } else {
    detail = `勾选后将一并移除 ${folder} 目录；未勾选时仅删除 ${libraryLabel}。`;
  }

  return {
    count: workspaceHitCount,
    checkboxLabel,
    detail,
  };
}

export function buildApprovalDockCopy(
  approvals: PendingToolApproval[],
  options?: {
    workspaceActionProjectCount?: number;
    workspaceSubProgramProjectCount?: number;
  },
): ApprovalDockCopy {
  const workspaceActionProjectCount = options?.workspaceActionProjectCount ?? 0;
  const workspaceSubProgramProjectCount =
    options?.workspaceSubProgramProjectCount ?? 0;
  const count = approvals.length;
  const destructive = approvals.some((approval) => approval.destructive);
  const actionDeletes = approvals.filter(
    (approval) => approval.toolName === "qkrpc_action_delete",
  );
  const subprogramDeletes = approvals.filter(
    (approval) => approval.toolName === "qkrpc_subprogram_delete",
  );

  if (actionDeletes.length === count) {
    return buildDeleteDockCopy(
      "action",
      actionDeletes,
      workspaceActionProjectCount,
    );
  }
  if (subprogramDeletes.length === count) {
    return buildDeleteDockCopy(
      "subprogram",
      subprogramDeletes,
      workspaceSubProgramProjectCount,
    );
  }

  const shellApprovals = approvals.filter(
    (approval) => isShellToolName(approval.toolName),
  );
  if (shellApprovals.length === count) {
    const shellCommands = shellApprovals
      .map((approval) => formatShellApprovalCommand(approval.input))
      .filter((command): command is string => Boolean(command?.trim()));
    const shellCount = shellCommands.length || count;
    return {
      destructive: true,
      title:
        shellCount === 1
          ? "危险操作：终端命令"
          : `危险操作：${shellCount} 条终端命令待确认`,
      summary:
        shellCount === 1
          ? "以下命令会写入或删除本地内容，请核对完整命令后确认。"
          : "以下命令会写入或删除本地内容，请逐条核对后确认。",
      shellCommands,
      approveLabel: shellCount > 1 ? `确认执行 ${shellCount} 条` : "确认执行",
      denyLabel: shellCount > 1 ? "全部取消" : "取消",
    };
  }

  const labels = [...new Set(approvals.map((approval) => approval.label))];
  const title =
    labels.length === 1
      ? `${destructive ? "危险操作" : "需要确认"}：${labels[0]}`
      : `${destructive ? "危险操作" : "需要确认"}：${count} 个操作待确认`;

  const targets = approvals
    .slice(0, 3)
    .map((approval) => summarizeApprovalTarget(approval.toolName, approval.input));
  const summary =
    targets.length === 0
      ? "请确认是否继续。"
      : `${targets.join("、")}${count > targets.length ? ` 等 ${count} 项` : ""}`;

  return {
    destructive,
    title,
    summary,
    approveLabel:
      count > 1 ? "全部确认" : destructive ? "确认删除" : "确认执行",
    denyLabel: "全部取消",
  };
}
