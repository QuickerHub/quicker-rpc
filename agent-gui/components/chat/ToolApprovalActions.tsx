"use client";

import type { ChatAddToolApproveResponseFunction } from "ai";
import { formatToolDisplayName } from "./tool-output";
import { getToolMeta } from "@/lib/tool-registry";

type ToolApprovalActionsProps = {
  toolName: string;
  input: unknown;
  approvalId: string;
  addToolApprovalResponse: ChatAddToolApproveResponseFunction;
  disabled?: boolean;
};

function summarizeApprovalInput(toolName: string, input: unknown): string {
  if (typeof input !== "object" || input === null) {
    return "即将执行此操作";
  }
  const o = input as Record<string, unknown>;
  if (toolName === "qkrpc_action_delete" && typeof o.id === "string") {
    return `永久删除动作 ${o.id}`;
  }
  if (toolName === "qkrpc_subprogram_delete" && typeof o.id === "string") {
    return `永久删除子程序 ${o.id}`;
  }
  if (typeof o.id === "string") {
    const extra =
      typeof o.title === "string"
        ? ` · ${o.title}`
        : typeof o.query === "string"
          ? ` · ${o.query}`
          : "";
    return `目标 ${o.id.slice(0, 8)}…${extra}`;
  }
  if (typeof o.title === "string") return o.title;
  return "即将执行此操作";
}

export function ToolApprovalActions({
  toolName,
  input,
  approvalId,
  addToolApprovalResponse,
  disabled,
}: ToolApprovalActionsProps) {
  const meta = getToolMeta(toolName);
  const isDestructive = meta?.group === "destructive";
  const displayName = meta?.label ?? formatToolDisplayName(toolName);
  const summary = summarizeApprovalInput(toolName, input);

  return (
    <div
      className={`tool-approval${isDestructive ? " tool-approval--destructive" : ""}`}
      role="group"
      aria-label={`确认 ${displayName}`}
    >
      <p className="tool-approval-title">
        {isDestructive ? "危险操作" : "需要确认"}：{displayName}
      </p>
      <p className="tool-approval-summary">{summary}</p>
      <div className="tool-approval-actions">
        <button
          type="button"
          className={`tool-approval-btn tool-approval-btn--approve${isDestructive ? " tool-approval-btn--danger" : ""}`}
          disabled={disabled}
          onClick={() =>
            addToolApprovalResponse({
              id: approvalId,
              approved: true,
              reason: "用户点击确认",
            })
          }
        >
          {isDestructive ? "确认删除" : "确认执行"}
        </button>
        <button
          type="button"
          className="tool-approval-btn tool-approval-btn--deny"
          disabled={disabled}
          onClick={() =>
            addToolApprovalResponse({
              id: approvalId,
              approved: false,
              reason: "用户取消",
            })
          }
        >
          取消
        </button>
      </div>
    </div>
  );
}
