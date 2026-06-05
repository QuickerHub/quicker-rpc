import type { AgentUIMessage } from "@/lib/chat-types";

/** Shared run status for tool-test conversation cards. */
export type ToolTestConversationStatus = "running" | "done" | "error";

export type ToolTestConversationRunBase = {
  id: string;
  at: number;
  status: ToolTestConversationStatus;
  chatMessages: AgentUIMessage[];
};

export function toolTestConversationStatusLabel(
  status: ToolTestConversationStatus,
  labels?: { running?: string; done?: string; error?: string },
): string {
  if (status === "running") return labels?.running ?? "进行中";
  if (status === "done") return labels?.done ?? "完成";
  return labels?.error ?? "失败";
}

export function isToolTestConversationRunBusy(
  runs: ReadonlyArray<{ status: ToolTestConversationStatus }>,
): boolean {
  return runs.some((run) => run.status === "running");
}
