import { parseActionProjectBinding, type ActionProjectBinding } from "./action-project-binding";
import type { InlineXActionProgram } from "./action-trace-inline-programs";
import { readTraceRunOwner, type TraceRunOwner } from "./action-trace-owner";

export type ManualTraceRequest = {
  cwd: string;
  actionId: string;
  param?: string;
  xaction?: InlineXActionProgram;
  projectDirectory?: string;
  expectedProjectBinding?: ActionProjectBinding | null;
};
export class ManualTraceError extends Error {
  readonly retryable = false;
  constructor(readonly code: string, message: string, readonly status = 409) { super(message); }
}
export function readManualTraceRequest(value: unknown): ManualTraceRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ManualTraceError("INVALID_TRACE_REQUEST", "A trace request object is required.", 400);
  const v = value as Record<string, unknown>;
  if (typeof v.cwd !== "string" || !v.cwd.trim() || typeof v.actionId !== "string"
    || (v.param !== undefined && typeof v.param !== "string")
    || (v.projectDirectory !== undefined && (typeof v.projectDirectory !== "string" || !v.projectDirectory.trim())))
    throw new ManualTraceError("INVALID_TRACE_REQUEST", "An explicit working directory and action target are required.", 400);
  let xaction: InlineXActionProgram | undefined;
  if (v.xaction !== undefined) {
    const x = v.xaction as Partial<InlineXActionProgram> | null;
    if (!x || typeof x.title !== "string" || !Array.isArray(x.steps) || !Array.isArray(x.variables))
      throw new ManualTraceError("INVALID_TRACE_REQUEST", "Inline trace requires title, steps and variables.", 400);
    if (v.actionId.trim() && !/^(?:ephemeral|inline):/i.test(v.actionId.trim()))
      throw new ManualTraceError("CONFLICTING_RUN_TARGET", "Inline trace cannot also identify a saved action.", 400);
    xaction = structuredClone({ title: x.title, steps: x.steps, variables: x.variables });
  } else if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v.actionId.trim())) {
    throw new ManualTraceError("INVALID_ACTION_ID", "A saved trace requires an action GUID.", 400);
  }
  const directory = typeof v.projectDirectory === "string" ? v.projectDirectory.trim() : undefined;
  if (Object.hasOwn(v, "expectedProjectBinding") && !directory)
    throw new ManualTraceError("INVALID_TRACE_REQUEST", "A document target requires its exact project directory.", 400);
  let expected: ActionProjectBinding | null | undefined;
  if (Object.hasOwn(v, "expectedProjectBinding")) {
    if (v.expectedProjectBinding === null) expected = null;
    else {
      const id = xaction ? (v.expectedProjectBinding as ActionProjectBinding | undefined)?.actionId : v.actionId.trim();
      expected = parseActionProjectBinding(v.expectedProjectBinding, id ?? "");
    }
  }
  return { cwd: v.cwd.trim(), actionId: v.actionId.trim(), param: (v.param as string | undefined)?.trim() || undefined,
    ...(xaction ? { xaction } : {}), ...(directory ? { projectDirectory: directory } : {}),
    ...(Object.hasOwn(v, "expectedProjectBinding") ? { expectedProjectBinding: expected } : {}) };
}
export function readManualTraceAcknowledgement(value: unknown): TraceRunOwner | undefined {
  if (!value || typeof value !== "object" || (value as { ok?: unknown }).ok !== true) return;
  return readTraceRunOwner((value as { owner?: unknown }).owner);
}
