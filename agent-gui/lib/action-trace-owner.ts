import { readHostBinding, type QkrpcHostBinding } from "./qkrpc-host-binding-contract";
export type TraceInvocation = Readonly<{
  invocationId: string;
  toolCallId: string;
  agent: string;
}>;
export type TraceRunOwner = Readonly<{
  version: 1;
  runId: string;
  executionId: string;
  threadId: string;
  cwd: string;
  actionId: string;
  param?: string;
  hostBinding: QkrpcHostBinding;
  toolCallId?: string;
  invocationPath: readonly TraceInvocation[];
}>;
export type TraceRunProgress = {
  kind: "start";
  owner: TraceRunOwner;
} | {
  kind: "terminal" | "result";
  owner: TraceRunOwner;
  data: Record<string, unknown>;
};
/** Supplied by server composition; pure consumers never generate identities. */
export type TraceExecutionPort = Readonly<{
  executionId: string;
  createRunId: () => string;
  emit: (event: TraceRunProgress) => void;
}>;
function string(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
export function readTraceRunOwner(value: unknown): TraceRunOwner | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return;
  const v = value as Record<string, unknown>;
  let hostBinding: QkrpcHostBinding | undefined;
  try {
    hostBinding = readHostBinding(structuredClone(v.hostBinding));
  }
  catch {
    return;
  }
  if (v.version !== 1 || !hostBinding || ![v.runId, v.executionId, v.threadId, v.cwd, v.actionId].every(string)
    || (v.param !== undefined && typeof v.param !== "string") || (v.toolCallId !== undefined && !string(v.toolCallId))
    || !Array.isArray(v.invocationPath))
    return;
  const path: TraceInvocation[] = [];
  for (const item of v.invocationPath) {
    if (!item || typeof item !== "object" || ![item.invocationId, item.toolCallId, item.agent].every(string))
      return;
    path.push(Object.freeze({ invocationId: item.invocationId, toolCallId: item.toolCallId, agent: item.agent }));
  }
  return freeze({ version: 1, runId: v.runId as string, executionId: v.executionId as string,
    threadId: v.threadId as string, cwd: v.cwd as string, actionId: v.actionId as string,
    ...(v.param !== undefined ? { param: v.param as string } : {}),
    ...(v.toolCallId !== undefined ? { toolCallId: v.toolCallId as string } : {}),
    hostBinding, invocationPath: Object.freeze(path) });
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value))
      freeze(child);
    Object.freeze(value);
  }
  return value;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function sameTraceRunOwner(a: TraceRunOwner, b: TraceRunOwner): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
export function traceRunTabId(owner: TraceRunOwner): string {
  return `__trace__:owned:${encodeURIComponent(owner.threadId)}:${encodeURIComponent(owner.executionId)}:${encodeURIComponent(owner.runId)}`;
}
export function traceUiToolCallId(owner: TraceRunOwner): string | undefined {
  return owner.invocationPath[0]?.toolCallId ?? owner.toolCallId;
}
