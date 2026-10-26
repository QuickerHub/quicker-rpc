import type { QkrpcHostBinding } from "../../qkrpc-host-binding-contract";

export const STEP_RUNNER_UI_KNOWLEDGE_FORMAT = "qkrpc.ui-step-runner.v1";

/** Read observations only. These fields never grant editing or host permissions. */
export type StepRunnerUiKnowledge = {
  knowledge?: Record<string, unknown>;
  knowledgeState: { status: "available" | "unknown"; reason?: string };
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** UI-only extension: generated protobuf definitions remain unchanged. */
export function readStepRunnerUiKnowledge(item: unknown): StepRunnerUiKnowledge {
  const data = record(item), knowledge = record(data?.knowledge), state = record(data?.knowledgeState);
  return { ...(knowledge ? { knowledge } : {}), knowledgeState: {
    status: knowledge && state?.status === "available" ? "available" : "unknown",
    ...(typeof state?.reason === "string" ? { reason: state.reason } : {}),
  } };
}

class KnowledgeTargetMismatch extends Error {
  readonly code = "KNOWLEDGE_TARGET_MISMATCH";
  constructor(field: string) { super(`Step runner knowledge does not match the current request (${field}).`); }
}

/** Validate observations against this exact request, without inventing missing provenance. */
export function inspectStepRunnerUiKnowledge(schema: Record<string, unknown>, expected: {
  key: string; controlField?: string; hostBinding?: QkrpcHostBinding;
}): StepRunnerUiKnowledge {
  const key = schema.stepRunnerKey ?? schema.StepRunnerKey ?? schema.key ?? schema.Key;
  if (typeof key !== "string" || key !== expected.key.trim()) throw new KnowledgeTargetMismatch("key");
  const knowledge = record(schema.knowledge);
  const source = record(knowledge?.source), format = record(knowledge?.schema);
  const control = knowledge?.requestedControlFieldValue;
  if (knowledge && Object.hasOwn(knowledge, "requestedControlFieldValue") && (control === null || typeof control === "string")
    && control !== (expected.controlField ?? null)) throw new KnowledgeTargetMismatch("controlField");
  if (source && expected.hostBinding) {
    for (const field of ["hostKind", "hostInstanceId", "hostSessionId", "endpoint"] as const) {
      if (typeof source[field] === "string" && source[field] !== expected.hostBinding[field]) throw new KnowledgeTargetMismatch(field);
    }
  }
  const unknown = (reason: string): StepRunnerUiKnowledge => ({ ...(knowledge ? { knowledge } : {}), knowledgeState: { status: "unknown", reason } });
  if (!knowledge) return unknown("This schema has no knowledge metadata; its native source is unknown.");
  if (key !== expected.key.trim() || knowledge.schemaVersion !== 1 || source?.provider !== "qkrpc.step-runner"
    || !["runtime-definition", "bundled-adapter"].includes(String(source.kind)) || format?.format !== STEP_RUNNER_UI_KNOWLEDGE_FORMAT
    || typeof format.revision !== "string" || !/^sha256:[0-9a-f]{64}$/.test(format.revision)
    || !Object.hasOwn(knowledge, "requestedControlFieldValue") || control !== (expected.controlField ?? null)) {
    return unknown("The gateway did not provide recognized UI schema provenance for this request.");
  }
  if (!expected.hostBinding || ["hostKind", "hostInstanceId", "hostSessionId", "endpoint"].some(field => typeof source[field] !== "string" || !source[field])
    || ["quickerVersion", "adapterAssembly", "adapterVersion"].some(field => typeof source[field] !== "string" || !source[field])
    || typeof knowledge.retrievedAt !== "string" || !Number.isFinite(Date.parse(knowledge.retrievedAt))) {
    return unknown("The schema's complete source identity and read time were not verified for this request.");
  }
  return { knowledge, knowledgeState: { status: "available" } };
}
