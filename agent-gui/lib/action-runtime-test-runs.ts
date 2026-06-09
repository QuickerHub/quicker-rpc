import type { ActionRuntimeInvokeOp, ActionRuntimeInvokeResult } from "@/lib/action-runtime-client";

export type ActionRuntimeRunStatus = "running" | "done" | "error";

export type ActionRuntimeRunEntry = {
  id: string;
  at: number;
  label: string;
  op: ActionRuntimeInvokeOp;
  status: ActionRuntimeRunStatus;
  /** Request payload sent to /api/dev/action-runtime. */
  requestArgs?: Record<string, unknown>;
  result?: ActionRuntimeInvokeResult;
  error?: string;
};

export type ActionRuntimeCompiledFile = {
  stepRunnerKey?: string;
  paramKey?: string;
  sourceFile?: string;
  language?: string;
  content?: string;
};

export function createActionRuntimeRunId(): string {
  return `ar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
