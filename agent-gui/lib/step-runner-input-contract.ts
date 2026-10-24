export const STEP_RUNNER_INPUT_CONTRACT_CAPABILITY = "stepRunner.inputContract.read";

export type StepInputLiteralPolicy = "allowed" | "existing-literal-only" | "existing-nonempty-literal-only" | "never" | "unknown";
export type StepRunnerInputContractInput = Readonly<{
  key: string;
  policyKnown: boolean;
  varType: number | null;
  variableMode: number | null;
  allowInput: boolean | null;
  isControlField: boolean | null;
  visibilityResolved: boolean;
  visible: boolean;
  literalPolicy: StepInputLiteralPolicy;
  literalValueRestriction: "none" | "options" | "unknown";
  blockedReason: string | null;
  options: readonly string[];
}>;
export type StepRunnerInputContract = Readonly<{
  version: 1;
  source: "runtime-definition";
  hostKind: "v1" | "v2";
  stepRunnerKey: string;
  controlFieldKey: string | null;
  appliedControlFieldValue: string | null;
  visibilityResolved: boolean;
  reservedBindings: readonly string[];
  inputs: readonly StepRunnerInputContractInput[];
}>;

export class StepRunnerInputContractError extends Error {
  readonly code = "STEP_INPUT_CONTRACT_INVALID";
}
function reject(reason: string): never { throw new StepRunnerInputContractError(reason); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) reject("A runtime input contract object is required.");
  return value as Record<string, unknown>;
}
function field(row: Record<string, unknown>, key: string): unknown {
  if (!Object.hasOwn(row, key)) reject(`Missing explicit runtime fact: ${key}.`);
  return row[key];
}
function string(value: unknown, label: string, max = 100_000): string {
  if (typeof value !== "string" || value.length > max) reject(`Invalid runtime ${label}.`);
  return value;
}
function key(value: unknown, label: string): string {
  const text = string(value, label, 1024);
  if (!text.trim() || text !== text.trim() || text.includes("\0")) reject(`Invalid runtime ${label}.`);
  return text;
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") reject(`Missing or invalid runtime ${label}.`);
  return value;
}
function nullableNumber(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < -2_147_483_648 || value > 2_147_483_647) reject(`Invalid runtime ${label}.`);
  return value;
}
function nullableBoolean(value: unknown, label: string): boolean | null { return value === null ? null : boolean(value, label); }
function nullableString(value: unknown, label: string): string | null { return value === null ? null : string(value, label); }

/** Decode native facts without replacing absent false/zero/null values with defaults.
 * This validates the wire contract; the private read ledger and document transaction
 * separately prove the target, existing binding and permission to change each input. */
export function readStepRunnerInputContract(value: unknown, expected: {
  hostKind: "v1" | "v2";
  stepRunnerKey: string;
}): StepRunnerInputContract {
  const row = object(value);
  if (field(row, "version") !== 1 || field(row, "source") !== "runtime-definition") reject("Unsupported runtime input contract version or source.");
  if (field(row, "hostKind") !== expected.hostKind) reject("The input contract belongs to a different host kind.");
  const runnerKey = key(field(row, "stepRunnerKey"), "runner key");
  if (runnerKey !== expected.stepRunnerKey) reject("The input contract belongs to a different runner.");
  const control = field(row, "controlFieldKey");
  const controlFieldKey = control === null ? null : key(control, "control key");
  const appliedControlFieldValue = nullableString(field(row, "appliedControlFieldValue"), "control value");
  if (controlFieldKey === null && appliedControlFieldValue !== null) reject("A runner without a control field cannot have an applied control value.");
  const visibilityResolved = boolean(field(row, "visibilityResolved"), "visibility resolution");
  const reserved = field(row, "reservedBindings");
  const required = [".file", ".var", "file", "varKey"];
  if (!Array.isArray(reserved) || reserved.length !== required.length || reserved.some((item) => typeof item !== "string")
    || [...reserved].sort().some((item, index) => item !== required[index])) reject("Unsupported runtime binding representation.");
  const inputs = field(row, "inputs");
  if (!Array.isArray(inputs) || inputs.length > 1024) reject("Invalid or excessive runtime input definitions.");
  const seen = new Set<string>();
  const parsed = inputs.map((input): StepRunnerInputContractInput => {
    const data = object(input);
    const name = key(field(data, "key"), "input key");
    if (seen.has(name.toLowerCase())) reject("Ambiguous runtime input keys.");
    seen.add(name.toLowerCase());
    const policyKnown = boolean(field(data, "policyKnown"), "input policy");
    const varType = nullableNumber(field(data, "varType"), "input type");
    const variableMode = nullableNumber(field(data, "variableMode"), "variable mode");
    const allowInput = nullableBoolean(field(data, "allowInput"), "free input policy");
    const isControlField = nullableBoolean(field(data, "isControlField"), "control field flag");
    const inputVisibilityResolved = boolean(field(data, "visibilityResolved"), "input visibility resolution");
    const visible = boolean(field(data, "visible"), "input visibility");
    const literalPolicy = field(data, "literalPolicy");
    if (typeof literalPolicy !== "string" || !["allowed", "existing-literal-only", "existing-nonempty-literal-only", "never", "unknown"].includes(literalPolicy)) reject("Unknown literal editing policy.");
    const literalValueRestriction = field(data, "literalValueRestriction");
    if (typeof literalValueRestriction !== "string" || !["none", "options", "unknown"].includes(literalValueRestriction)) reject("Unknown literal value restriction.");
    if (policyKnown && [varType, variableMode, allowInput, isControlField].some((fact) => fact === null)) reject("A known input policy requires explicit native facts.");
    if (!policyKnown && literalPolicy !== "unknown" && literalPolicy !== "never") reject("Unknown native facts cannot authorize literal editing.");
    if (policyKnown && literalValueRestriction === "unknown" && literalPolicy !== "never" && literalPolicy !== "unknown") reject("A writable input policy requires explicit value restrictions.");
    const options = field(data, "options");
    if (!Array.isArray(options) || options.length > 2048) reject("Invalid runtime selection options.");
    const values = options.map((option) => string(option, "selection option"));
    if (new Set(values).size !== values.length) reject("Ambiguous runtime selection options.");
    return Object.freeze({ key: name, policyKnown, varType, variableMode, allowInput, isControlField,
      visibilityResolved: inputVisibilityResolved, visible, literalPolicy: literalPolicy as StepInputLiteralPolicy,
      literalValueRestriction: literalValueRestriction as StepRunnerInputContractInput["literalValueRestriction"],
      blockedReason: nullableString(field(data, "blockedReason"), "blocked reason"), options: Object.freeze(values) });
  });
  return Object.freeze({ version: 1, source: "runtime-definition", hostKind: expected.hostKind,
    stepRunnerKey: runnerKey, controlFieldKey, appliedControlFieldValue, visibilityResolved,
    reservedBindings: Object.freeze([...required]), inputs: Object.freeze(parsed) });
}
