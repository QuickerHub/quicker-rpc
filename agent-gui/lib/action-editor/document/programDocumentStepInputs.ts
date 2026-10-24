import { compactWireInputParam, expandWireInputParams, parseWireParamKey } from "../../input-param-wire";
import { collectRawSubPrograms, isSubProgramRecord, readStepInputsForRunner, type SubProgramRecord } from "./programDocumentSubProgramModel";
import type { ProgramDocumentEditResult, ProgramDocumentIdentity, ProgramDocumentSession } from "./programDocumentSession";

export const MAX_STEP_INPUT_CHANGES = 32;
export const MAX_STEP_INPUT_VALUE_LENGTH = 100_000;
export const MAX_STEP_INPUT_PAYLOAD_BYTES = 1_048_576;

export type ProgramDocumentStepInputsRequest = {
  expectedRevision: number;
  expectedIdentity: ProgramDocumentIdentity;
  stepId: string;
  expectedRunnerKey: string;
  changes: readonly Readonly<{ key: string; value: string }>[];
  /** Supplied by the private, target-bound schema proof; this helper never infers a schema. */
  allowedInputKeys: ReadonlySet<string>;
};

const aliases = { value: ["value", "Value"], varkey: ["varKey", "VarKey"], file: ["file", "File"] } as const;
function member(record: SubProgramRecord, name: keyof typeof aliases): string | undefined {
  const keys = Object.keys(record).filter((key) => key.toLowerCase() === name);
  if (keys.length > 1 || keys.some((key) => !(aliases[name] as readonly string[]).includes(key))) {
    throw new Error(`Input parameter has ambiguous ${name} aliases`);
  }
  return keys[0];
}

function rows(record: SubProgramRecord, key: string): SubProgramRecord[] {
  const value = record[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((row) => !isSubProgramRecord(row))) throw new Error(`Invalid ${key} collection`);
  return value as SubProgramRecord[];
}

function findUniqueStep(body: SubProgramRecord, stepId: string): SubProgramRecord {
  const matches: { step: SubProgramRecord; owned: boolean }[] = [];
  const visit = (steps: SubProgramRecord[], owned: boolean): void => {
    for (const step of steps) {
      if (step.stepId === stepId) matches.push({ step, owned });
      visit(rows(step, "ifSteps"), owned);
      visit(rows(step, "elseSteps"), owned);
    }
  };
  visit(rows(body, "steps"), true);
  // Foreign caches count for ambiguity, but never become owned editing surfaces.
  for (const entry of collectRawSubPrograms(body)) visit(rows(entry.row, "steps"), entry.owned);
  if (matches.length !== 1 || !matches[0]!.owned) throw new Error("The selected step is missing, ambiguous or not owned by this document");
  const step = matches[0]!.step;
  if (Object.keys(step).filter((key) => key.toLowerCase() === "stepid").length !== 1) throw new Error("The selected step has ambiguous identity aliases");
  return step;
}

type PreparedInput = { key: string; value: string; previousValue: string; legacy?: { record: SubProgramRecord; field: string } };
function prepareInput(inputs: SubProgramRecord, key: string, value: string): PreparedInput {
  const contributors = Object.keys(inputs).filter((candidate) => parseWireParamKey(candidate).baseKey.trim().toLowerCase() === key.toLowerCase());
  if (contributors.length !== 1 || contributors[0] !== key || !Object.hasOwn(inputs, key)) {
    throw new Error(`Input parameter ${key} is missing or has binding/case aliases`);
  }
  const raw = inputs[key];
  let legacy: PreparedInput["legacy"];
  if (isSubProgramRecord(raw)) {
    const field = member(raw, "value");
    if (!field || typeof raw[field] !== "string") throw new Error(`Input parameter ${key} is not an existing string literal`);
    for (const name of ["varkey", "file"] as const) {
      const binding = member(raw, name);
      if (binding && raw[binding] !== null && (typeof raw[binding] !== "string" || (raw[binding] as string).trim())) {
        throw new Error(`Input parameter ${key} has an active or opaque binding`);
      }
    }
    legacy = { record: raw, field };
  } else if (typeof raw !== "string") {
    throw new Error(`Input parameter ${key} is not an existing string literal`);
  }
  // Use the production codec to distinguish escaped literals from real wire bindings.
  const expanded = expandWireInputParams(Object.fromEntries([[key, raw]]));
  const decoded = Object.hasOwn(expanded, key) ? expanded[key] : undefined;
  if (!decoded || typeof decoded.value !== "string" || decoded.varKey || decoded.file) {
    throw new Error(`Input parameter ${key} is not a plain literal`);
  }
  return { key, value, previousValue: decoded.value, ...(legacy ? { legacy } : {}) };
}

/** One raw Session transaction; neither a schema authority nor a file-writing port. */
export function applyProgramDocumentStepInputs(session: ProgramDocumentSession, request: ProgramDocumentStepInputsRequest): ProgramDocumentEditResult {
  const invalid = (error: string): ProgramDocumentEditResult => ({ ok: false, code: "invalid_document", error, state: session.getState() });
  if (!request || !Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0
    || !isSubProgramRecord(request.expectedIdentity) || typeof request.expectedIdentity.documentKey !== "string" || !request.expectedIdentity.documentKey.trim()
    || typeof request.stepId !== "string" || !request.stepId.trim() || request.stepId !== request.stepId.trim()
    || typeof request.expectedRunnerKey !== "string" || !request.expectedRunnerKey.trim() || request.expectedRunnerKey !== request.expectedRunnerKey.trim()
    || !Array.isArray(request.changes) || request.changes.length > MAX_STEP_INPUT_CHANGES
    || !request.allowedInputKeys || typeof request.allowedInputKeys.has !== "function") return invalid("A complete bounded step-input transaction is required");
  const keys = new Set<string>();
  let payloadBytes = 2;
  for (const change of request.changes) {
    if (!change || typeof change.key !== "string" || !change.key.trim() || change.key !== change.key.trim() || change.key.length > 256
      || parseWireParamKey(change.key).kind !== "value" || typeof change.value !== "string" || change.value.length > MAX_STEP_INPUT_VALUE_LENGTH
      || keys.has(change.key.toLowerCase()) || !request.allowedInputKeys.has(change.key)) return invalid("Only distinct, schema-approved plain input keys and bounded string values may be changed");
    keys.add(change.key.toLowerCase());
    payloadBytes += new TextEncoder().encode(JSON.stringify({ key: change.key, value: change.value })).byteLength + 1;
    if (payloadBytes > MAX_STEP_INPUT_PAYLOAD_BYTES) return invalid("The step-input transaction exceeds its payload limit");
  }
  return session.transact({ expectedRevision: request.expectedRevision, expectedIdentity: request.expectedIdentity, source: "agent", update(body) {
    const step = findUniqueStep(body, request.stepId);
    const inputs = readStepInputsForRunner(step, request.expectedRunnerKey);
    if (!inputs) throw new Error("The selected step runner or native input map does not match the schema proof");
    // Complete every check before touching even the disposable transaction draft.
    const prepared = request.changes.map(({ key, value }) => prepareInput(inputs, key, value));
    for (const change of prepared) {
      if (change.value === change.previousValue) continue;
      if (change.legacy) change.legacy.record[change.legacy.field] = change.value;
      else Object.assign(inputs, compactWireInputParam(change.key, { value: change.value }));
    }
  } });
}
