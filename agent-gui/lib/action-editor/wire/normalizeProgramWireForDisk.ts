import { compactWireInputParam, expandWireInputParams, parseWireParamKey } from "@/lib/input-param-wire";
import { compactVariableDefaultWireRecord } from "@/lib/variable-default-value-wire";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeInputParams(raw: Record<string, unknown>): Record<string, unknown> {
  // Future object binding fields cannot be represented by the compact scalar codec.
  const opaque = new Set(Object.entries(raw).filter(([, value]) => isRecord(value)
    && Object.keys(value).some((key) => !["value", "Value", "varKey", "VarKey", "file", "File"].includes(key)))
    .map(([key]) => parseWireParamKey(key).baseKey));
  const result = Object.fromEntries(Object.entries(raw).filter(([key]) => opaque.has(parseWireParamKey(key).baseKey)));
  for (const [key, value] of Object.entries(expandWireInputParams(raw))) {
    if (!opaque.has(key)) Object.assign(result, compactWireInputParam(key, value));
  }
  return result;
}

function normalizeProgram(raw: Record<string, unknown>): Record<string, unknown> {
  const result = { ...raw };
  if (Array.isArray(raw.steps)) result.steps = raw.steps.map((step) => {
    if (!isRecord(step)) return step;
    const next = { ...step };
    if (isRecord(step.inputParams)) next.inputParams = normalizeInputParams(step.inputParams);
    // Keep branch arrays for unknown/future runners. Their data is still part of the document.
    for (const branch of ["ifSteps", "elseSteps"]) {
      if (Array.isArray(step[branch])) next[branch] = normalizeProgram({ steps: step[branch] }).steps;
    }
    return next;
  });
  if (Array.isArray(raw.variables)) result.variables = raw.variables.map((variable) => {
    if (!isRecord(variable)) return variable;
    const opaqueDefault = ["defaultValue", "DefaultValue", "default_value", "default"].some((key) => {
      const value = variable[key];
      return isRecord(value) && Object.keys(value).some((field) => field !== "file");
    });
    return opaqueDefault ? { ...variable } : compactVariableDefaultWireRecord(variable);
  });
  if (Array.isArray(raw.subPrograms)) result.subPrograms = raw.subPrograms.map((row) =>
    isRecord(row) ? normalizeProgram(row) : row);
  return result;
}

/** Normalize known legacy bindings without projecting the full document through generated UI types. */
export function normalizeProgramWireForDisk(content: string): string {
  try {
    const raw: unknown = JSON.parse(content);
    return isRecord(raw) ? `${JSON.stringify(normalizeProgram(raw), null, 2)}\n` : content;
  } catch {
    return content;
  }
}
