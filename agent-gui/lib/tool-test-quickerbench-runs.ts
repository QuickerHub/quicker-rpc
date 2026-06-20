import type { AgentUIMessage } from "@/lib/chat-types";
import type { ActionRuntimeInvokeResult } from "@/lib/action-runtime-client";
import type { ChatThreadExportResult } from "@/components/chat/ChatThreadExportDialog";

export type QuickerBenchRunStatus = "idle" | "preparing" | "running" | "verifying" | "done" | "error";

export type QuickerBenchRunEntry = {
  id: string;
  at: number;
  taskId: string;
  taskLabel: string;
  tier: string;
  status: QuickerBenchRunStatus;
  workspacePath?: string;
  mockProfile?: string;
  actionId?: string;
  mockVerify?: ActionRuntimeInvokeResult;
  exportResult?: ChatThreadExportResult;
  error?: string;
  chatMessages?: AgentUIMessage[];
};

export function createQuickerBenchRunId(): string {
  return `qb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
