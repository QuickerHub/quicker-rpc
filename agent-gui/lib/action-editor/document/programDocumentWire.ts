import type { ActionStep, ActionSubProgram } from "../types/common";
import type { ActionProgramSnapshot } from "../program/assembleActionProgramSnapshot";
import { parseProgramWireJson, parseWireSubPrograms, serializeProgramWireJson } from "../wire/programWire";
import { compactWireInputParam, expandWireInputParams, parseWireParamKey } from "../../input-param-wire";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown): RecordValue {
  return isRecord(value) ? value : {};
}

function records(value: unknown): RecordValue[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
    throw new Error("Program document collections must contain objects");
  }
  return value as RecordValue[];
}

function parseNative(content: string): RecordValue {
  const value: unknown = JSON.parse(content);
  if (!isRecord(value)) throw new Error("data.json root must be an object");
  return value;
}

/** Semantic JSON comparison does not treat property order or disk formatting as an edit. */
export function programDocumentFingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(programDocumentFingerprint).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${programDocumentFingerprint(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function same(a: unknown, b: unknown): boolean {
  return programDocumentFingerprint(a) === programDocumentFingerprint(b);
}

function readBody(raw: RecordValue): Pick<ActionProgramSnapshot, "steps" | "variables"> {
  const parsed = parseProgramWireJson(JSON.stringify(raw));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.present;
}

function readSubProgram(raw: RecordValue): ActionSubProgram {
  const metadata = parseWireSubPrograms([{ ...raw, steps: [], variables: [], subPrograms: [] }])[0]!;
  const body = readBody(raw);
  return {
    ...metadata,
    ...body,
    stepCount: typeof raw.stepCount === "number" ? raw.stepCount : body.steps.length,
    variableCount: typeof raw.variableCount === "number" ? raw.variableCount : body.variables.length,
    subPrograms: records(raw.subPrograms).map(readSubProgram),
  };
}

/** The typed body is an editing projection; native unknown fields remain in the document text. */
export function parseProgramDocumentSnapshot(content: string): ActionProgramSnapshot {
  const raw = parseNative(content);
  return { ...readBody(raw), subPrograms: records(raw.subPrograms).map(readSubProgram) };
}

function projectStep(step: ActionStep): RecordValue {
  const wire = JSON.parse(serializeProgramWireJson({ steps: [{ ...step, ifSteps: [], elseSteps: [] }], variables: [] })) as RecordValue;
  return {
    ...records(wire.steps)[0],
    // Unknown runners can still own nested bodies. Do not infer away their branches.
    ifSteps: (step.ifSteps ?? []).map(projectStep),
    elseSteps: (step.elseSteps ?? []).map(projectStep),
  };
}

function projectBody(body: Pick<ActionProgramSnapshot, "steps" | "variables">): RecordValue {
  const wire = JSON.parse(serializeProgramWireJson({ steps: [], variables: body.variables })) as RecordValue;
  return { steps: body.steps.map(projectStep), variables: wire.variables };
}

function projectSubProgram(row: ActionSubProgram): RecordValue {
  return {
    id: row.id ?? "", name: row.name ?? "", description: row.description ?? "", icon: row.icon ?? "",
    kind: row.kind, ...projectBody(row), subPrograms: (row.subPrograms ?? []).map(projectSubProgram),
  };
}

function project(snapshot: ActionProgramSnapshot): RecordValue {
  return { ...projectBody(snapshot), subPrograms: snapshot.subPrograms.map(projectSubProgram) };
}

const STEP_FIELDS = new Set(["stepRunnerKey", "inputParams", "outputParams", "ifSteps", "elseSteps", "note", "disabled", "collapsed", "delayMs", "stepId"]);
const VARIABLE_FIELDS = new Set(["id", "key", "varType", "desc", "isLocked", "saveState", "isInput", "isOutput", "paramName", "group", "customType", "inputParamInfo", "outputParamInfo", "tableDef", "default", "default.file", "defaultValue", "defaultValue.file", "defaultValueFile", "default_value", "DefaultValue"]);

function without(raw: RecordValue, fields: ReadonlySet<string>): RecordValue {
  return Object.fromEntries(Object.entries(raw).filter(([key]) => !fields.has(key)));
}

function canonicalInputs(raw: unknown, known: unknown): RecordValue {
  const extensions: RecordValue = {};
  for (const [key, value] of Object.entries(record(raw))) {
    if (!isRecord(value)) continue;
    const extra = without(value, new Set(["varKey", "VarKey", "value", "Value", "file", "File"]));
    if (Object.keys(extra).length) extensions[parseWireParamKey(key).baseKey] = extra;
  }
  return { bindings: record(known), extensions };
}

function canonicalKnownValue(raw: unknown, known: unknown): unknown {
  if (Array.isArray(known)) return known.map((item, index) => canonicalKnownValue(Array.isArray(raw) ? raw[index] : undefined, item));
  if (!isRecord(known)) return structuredClone(known);
  const out = structuredClone(record(raw));
  for (const [key, value] of Object.entries(known)) out[key] = canonicalKnownValue(out[key], value);
  return out;
}

function opaqueVariableDefaults(variable: RecordValue): RecordValue {
  const result: RecordValue = {};
  for (const key of ["defaultValue", "default", "DefaultValue", "default_value"]) {
    if (!isRecord(variable[key])) continue;
    // Only legacy defaultValue.file is interpreted by the existing codec. Objects at
    // the other scalar aliases are opaque in their entirety, including a `file` member.
    const value = key === "defaultValue" ? without(variable[key], new Set(["file"])) : structuredClone(variable[key]);
    if (Object.keys(value).length) result[key] = value;
  }
  return result;
}

/** Dirty compares editor semantics, while still comparing every opaque native field. */
export function fingerprintProgramDocumentContent(content: string): string {
  const raw = parseNative(content);
  const known = project(parseProgramDocumentSnapshot(content));
  const canonicalStep = (native: RecordValue, projected: RecordValue): RecordValue => {
    const out = { ...without(native, STEP_FIELDS), ...projected };
    out.inputParams = canonicalInputs(native.inputParams, projected.inputParams);
    for (const branch of ["ifSteps", "elseSteps"]) {
      const nativeChildren = records(native[branch]);
      out[branch] = records(projected[branch]).map((child, index) => canonicalStep(nativeChildren[index] ?? {}, child));
    }
    return out;
  };
  const canonicalBody = (native: RecordValue, projected: RecordValue): RecordValue => {
    const nativeSteps = records(native.steps);
    const nativeVariables = records(native.variables);
    return {
      ...native,
      steps: records(projected.steps).map((step, index) => canonicalStep(nativeSteps[index] ?? {}, step)),
      variables: records(projected.variables).map((variable, index) => {
        const original = nativeVariables[index] ?? {};
        const out = { ...without(original, VARIABLE_FIELDS), ...variable };
        for (const key of ["inputParamInfo", "outputParamInfo", "tableDef"]) {
          if (isRecord(variable[key])) out[key] = canonicalKnownValue(original[key], variable[key]);
        }
        // Keep the opaque namespace separate: `default` can be both an unsupported
        // native object and a known fallback binding projected from another alias.
        return { value: out, opaqueDefaults: opaqueVariableDefaults(original) };
      }),
    };
  };
  const canonicalSub = (native: RecordValue, projected: RecordValue): RecordValue => {
    const out = canonicalBody(native, projected);
    for (const key of ["id", "name", "description", "icon", "kind"]) out[key] = projected[key];
    // Counts are derived summaries rather than edits to the native program body.
    delete out.stepCount;
    delete out.variableCount;
    const children = records(native.subPrograms);
    out.subPrograms = records(projected.subPrograms).map((row, index) => canonicalSub(children[index] ?? {}, row));
    return out;
  };
  const out = canonicalBody(raw, known);
  const children = records(raw.subPrograms);
  out.subPrograms = records(known.subPrograms).map((row, index) => canonicalSub(children[index] ?? {}, row));
  return programDocumentFingerprint(out);
}

/** Apply only changes in the known projection, retaining native fields outside that projection. */
function mergeValue(raw: unknown, before: unknown, after: unknown): unknown {
  if (same(before, after)) return structuredClone(raw);
  if (isRecord(after)) return mergeRecord(record(raw), record(before), after);
  if (Array.isArray(after) && Array.isArray(before) && Array.isArray(raw)) {
    for (const field of ["fieldKey", "id"]) {
      const ids = (items: unknown[]): string[] | undefined => {
        const values = items.map((item) => isRecord(item) && typeof item[field] === "string" ? item[field] as string : "");
        return values.every(Boolean) && new Set(values).size === values.length ? values : undefined;
      };
      const previousIds = ids(before);
      const nextIds = ids(after);
      if (!previousIds || !nextIds) continue;
      const positions = new Map(previousIds.map((id, index) => [id, index]));
      const nextSet = new Set(nextIds);
      const used = new Set<number>();
      return after.map((item, index) => {
        let previousIndex = positions.get(nextIds[index]!);
        // A renamed field can retain its native extensions when the old identity was removed.
        if (previousIndex === undefined && index < before.length && !nextSet.has(previousIds[index]!) && !used.has(index)) previousIndex = index;
        if (previousIndex === undefined) return structuredClone(item);
        used.add(previousIndex);
        return mergeValue(raw[previousIndex], before[previousIndex], item);
      });
    }
    if (after.length === before.length) return after.map((item, index) => mergeValue(raw[index], before[index], item));
  }
  return structuredClone(after);
}

function mergeRecord(raw: RecordValue, before: RecordValue, after: RecordValue, skip: ReadonlySet<string> = new Set()): RecordValue {
  const out = structuredClone(raw);
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (skip.has(key) || same(before[key], after[key])) continue;
    if (!Object.hasOwn(after, key)) delete out[key];
    else out[key] = mergeValue(raw[key], before[key], after[key]);
  }
  return out;
}

function mergeInputs(rawValue: unknown, beforeValue: unknown, afterValue: unknown): RecordValue {
  const raw = record(rawValue);
  const before = expandWireInputParams(record(beforeValue));
  const after = expandWireInputParams(record(afterValue));
  const out = structuredClone(raw);
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (same(before[key], after[key])) continue;
    let extensions: RecordValue = {};
    for (const [wireKey, value] of Object.entries(raw)) {
      if (parseWireParamKey(wireKey).baseKey !== key) continue;
      if (isRecord(value)) {
        extensions = { ...extensions, ...value };
        for (const known of ["varKey", "VarKey", "value", "Value", "file", "File"]) delete extensions[known];
      }
      delete out[wireKey];
    }
    if (!Object.hasOwn(after, key)) continue;
    if (Object.keys(extensions).length) out[key] = { ...extensions, ...after[key] };
    else Object.assign(out, compactWireInputParam(key, after[key]!));
  }
  return out;
}

type IndexedRow = { raw: RecordValue; known: RecordValue };

function requireId(row: RecordValue, field: string, label: string): string {
  const id = typeof row[field] === "string" ? (row[field] as string).trim() : "";
  if (!id) throw new Error(`${label} requires a stable ${field}`);
  return id;
}

function indexBodyRows(raw: RecordValue[], known: RecordValue[], field: string, nested = false): Map<string, IndexedRow> {
  const result = new Map<string, IndexedRow>();
  const visit = (nativeRows: RecordValue[], projectedRows: RecordValue[]): void => {
    projectedRows.forEach((row, index) => {
      const id = requireId(row, field, "Program row");
      if (result.has(id)) throw new Error(`Duplicate ${field}: ${id}`);
      const native = nativeRows[index] ?? {};
      result.set(id, { raw: native, known: row });
      if (nested) {
        visit(records(native.ifSteps), records(row.ifSteps));
        visit(records(native.elseSteps), records(row.elseSteps));
      }
    });
  };
  visit(raw, known);
  return result;
}

function mergeBody(raw: RecordValue, before: RecordValue, after: RecordValue): RecordValue {
  if (same(before.steps, after.steps) && same(before.variables, after.variables)) return structuredClone(raw);
  const stepIndex = indexBodyRows(records(raw.steps), records(before.steps), "stepId", true);
  const variableIndex = indexBodyRows(records(raw.variables), records(before.variables), "id");
  const usedSteps = new Set<string>();
  const mergeSteps = (rows: RecordValue[]): RecordValue[] => rows.map((row) => {
    const id = requireId(row, "stepId", "Step");
    if (usedSteps.has(id)) throw new Error(`Duplicate stepId: ${id}`);
    usedSteps.add(id);
    const previous = stepIndex.get(id);
    const native = previous?.raw ?? {};
    const known = previous?.known ?? {};
    const out = mergeRecord(native, known, row, new Set(["ifSteps", "elseSteps", "inputParams"]));
    if (!same(known.inputParams, row.inputParams)) out.inputParams = mergeInputs(native.inputParams, known.inputParams, row.inputParams);
    for (const branch of ["ifSteps", "elseSteps"]) {
      const children = mergeSteps(records(row[branch]));
      if (!same(known[branch], row[branch])) {
        if (children.length) out[branch] = children;
        else delete out[branch];
      } else if (Array.isArray(native[branch])) out[branch] = children;
    }
    out.stepId = id;
    return out;
  });
  const usedVariables = new Set<string>();
  const variables = records(after.variables).map((row) => {
    const id = requireId(row, "id", "Variable");
    if (usedVariables.has(id)) throw new Error(`Duplicate id: ${id}`);
    usedVariables.add(id);
    const previous = variableIndex.get(id);
    const native = previous?.raw ?? {};
    const known = previous?.known ?? {};
    const defaults = ["default", "default.file", "defaultValue", "defaultValue.file", "defaultValueFile", "default_value", "DefaultValue"];
    const out = mergeRecord(native, known, row, new Set(defaults));
    if (!same(known.default, row.default) || !same(known["default.file"], row["default.file"])) {
      for (const key of defaults) delete out[key];
      const opaque = opaqueVariableDefaults(native);
      Object.assign(out, opaque);
      for (const key of ["default", "default.file"]) {
        if (!Object.hasOwn(row, key)) continue;
        if (Object.hasOwn(opaque, key)) throw new Error(`Cannot replace opaque variable ${key} object with an inline default; preserve or resolve its native fields first`);
        out[key] = structuredClone(row[key]);
      }
    }
    out.id = id;
    return out;
  });
  return { ...structuredClone(raw), steps: mergeSteps(records(after.steps)), variables };
}

/** Merge the live editing projection into native wire without reconstructing the V1 document. */
export function serializeProgramDocumentSnapshot(content: string, snapshot: ActionProgramSnapshot): string {
  const raw = parseNative(content);
  const before = project(parseProgramDocumentSnapshot(content));
  const after = project(snapshot);
  if (same(before, after)) return content;
  const subIndex = new Map<string, IndexedRow>();
  const indexSubs = (nativeRows: RecordValue[], knownRows: RecordValue[], prefix = ""): void => {
    knownRows.forEach((row, index) => {
      const native = nativeRows[index] ?? {};
      const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : `@${prefix}${index}`;
      if (subIndex.has(id)) throw new Error(`Duplicate subprogram id: ${id}`);
      subIndex.set(id, { raw: native, known: row });
      indexSubs(records(native.subPrograms), records(row.subPrograms), `${prefix}${index}/`);
    });
  };
  indexSubs(records(raw.subPrograms), records(before.subPrograms));
  const seen = new Set<string>();
  const mergeSubs = (rows: RecordValue[], prefix = ""): RecordValue[] => rows.map((row, index) => {
    const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : `@${prefix}${index}`;
    if (seen.has(id)) throw new Error(`Duplicate subprogram id: ${id}`);
    seen.add(id);
    const previous = subIndex.get(id);
    const native = previous?.raw ?? {};
    const known = previous?.known ?? {};
    let out = mergeRecord(native, known, row, new Set(["steps", "variables", "subPrograms"]));
    out = mergeBody(out, known, row);
    if (!same(known.steps, row.steps) || !same(known.variables, row.variables)) {
      out.stepCount = records(row.steps).length;
      out.variableCount = records(row.variables).length;
    }
    const children = mergeSubs(records(row.subPrograms), `${prefix}${index}/`);
    if (!same(known.subPrograms, row.subPrograms)) out.subPrograms = children;
    return out;
  });
  const out = mergeBody(raw, before, after);
  if (!same(before.subPrograms, after.subPrograms)) out.subPrograms = mergeSubs(records(after.subPrograms));
  return `${JSON.stringify(out, null, 2)}\n`;
}
