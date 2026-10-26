import { ActionVariable, ActionVariableInputParamInfo, ActionVariableOutputParamInfo, ActionTableDef, ActionTableField } from "../types/common";
import type { XProgramPresent } from "./xProgramHistory";
import { parseVariableReferenceJson } from "./programVariableReferences";
import { isLosslessJsonNumber, stringifyLosslessJson } from "../shared/losslessJson";
import { wireVarTypeToEditor, editorVarTypeToWire } from "../wire/varTypeCodec";
import { isValidActionVariableKey } from "../steps/paramEditors/stepParamCreateVariable";

export type ProgramVariableClipboardFailure = { ok: false; code: string; error: string };
export type ProgramVariableClipboardExportResult = { ok: true; text: string } | ProgramVariableClipboardFailure;
export type ProgramVariableClipboardPasteResult = { ok: true; changed: boolean; insertedIds: readonly string[] } | ProgramVariableClipboardFailure;
export type PreparedProgramVariablePaste = { ok: true; changed: boolean; insertedIds: readonly string[]; present: XProgramPresent } | ProgramVariableClipboardFailure;
export type VariableClipboardRow = Record<string, unknown>;

const isRecord = (value: unknown): value is VariableClipboardRow => value !== null && typeof value === "object" && !Array.isArray(value) && !isLosslessJsonNumber(value);
const pascal = (name: string) => name[0]!.toUpperCase() + name.slice(1);
const define = (object: VariableClipboardRow, name: string, value: unknown) => Object.defineProperty(object, name, { value, enumerable: true, writable: true, configurable: true });
const failure = (error: unknown): ProgramVariableClipboardFailure => ({ ok: false, code: "variable_clipboard_unsupported", error: error instanceof Error ? error.message : "变量剪贴板内容无法安全处理" });
const topFields = Object.keys(ActionVariable.create());
const aliasesFor = (key: string): string[] => key === "varType" ? ["varType", "VarType", "Type"]
  : key === "defaultValue" ? ["defaultValue", "DefaultValue", "default", "default_value"] : [key, pascal(key)];

/** This is the existing editor/ActionStepsDto codec, not a claim about connected native capabilities. */
function convertFields(raw: unknown, fields: readonly string[], toDto: boolean, top = false): VariableClipboardRow {
  if (!isRecord(raw)) throw new Error("变量或高级元数据不是可识别的 JSON 对象");
  const output = structuredClone(raw);
  for (const key of fields) {
    const aliases = top ? aliasesFor(key) : [key, pascal(key)];
    const found = aliases.filter((name) => Object.hasOwn(raw, name) && raw[name] !== undefined);
    if (found.length > 1) throw new Error("变量正文包含歧义字段别名，不能安全复制粘贴");
    if (!found.length) continue;
    let value = structuredClone(raw[found[0]!]);
    for (const name of aliases) delete output[name];
    if (top && key === "varType") value = readVariableClipboardType(value);
    if (top && key === "inputParamInfo" && value !== null) value = convertFields(value, Object.keys(ActionVariableInputParamInfo.create()), toDto);
    if (top && key === "outputParamInfo" && value !== null) value = convertFields(value, Object.keys(ActionVariableOutputParamInfo.create()), toDto);
    if (top && key === "tableDef" && value !== null) {
      value = convertFields(value, Object.keys(ActionTableDef.create()), toDto);
      const name = toDto ? "Fields" : "fields";
      if (Object.hasOwn(value as object, name)) {
        const rows = (value as VariableClipboardRow)[name];
        if (!Array.isArray(rows)) throw new Error("表格变量字段集合不可核验");
        (value as VariableClipboardRow)[name] = rows.map((field) => convertFields(field, Object.keys(ActionTableField.create()), toDto));
      }
    }
    define(output, toDto ? key === "varType" ? "Type" : pascal(key) : key, value);
  }
  return output;
}

function readVariableClipboardType(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase(), mapped = wireVarTypeToEditor(value);
    if (normalized === "text" || editorVarTypeToWire(mapped) === normalized) return mapped;
  }
  throw new Error("变量类型未被当前剪贴板格式识别，不能默认为文本");
}

/** A file name alone is not proof that the destination owns the referenced contents. */
export function assertVariableClipboardInline(raw: VariableClipboardRow): void {
  for (const name of ["default.file", "defaultValue.file", "defaultValueFile", "DefaultValueFile"]) {
    if (Object.hasOwn(raw, name) && raw[name] !== undefined && raw[name] !== "" && raw[name] !== null) throw new Error("变量默认值引用外置文件；剪贴板尚不支持证明文件归属及移交，请保留原文档");
  }
  for (const name of aliasesFor("defaultValue")) {
    if (Object.hasOwn(raw, name) && raw[name] !== undefined && raw[name] !== null && typeof raw[name] !== "string") {
      throw new Error("当前剪贴板格式不能安全传输该默认值");
    }
  }
}

export function normalizeVariableClipboardRow(raw: unknown): VariableClipboardRow {
  if (!isRecord(raw)) throw new Error("变量剪贴板行不是 JSON 对象");
  assertVariableClipboardInline(raw);
  const row = convertFields(raw, topFields, false, true);
  if (typeof row.key !== "string" || row.key !== row.key.trim() || !isValidActionVariableKey(row.key)) throw new Error("剪贴板变量名称无效");
  for (const key of ["id", "desc", "paramName", "group", "customType"]) if (row[key] !== undefined && typeof row[key] !== "string") throw new Error("变量文本字段类型不可核验");
  for (const key of ["isLocked", "saveState", "isInput", "isOutput"]) if (row[key] !== undefined && typeof row[key] !== "boolean") throw new Error("变量标记必须是明确布尔值");
  return row;
}

export function variableClipboardRowToDto(raw: unknown): VariableClipboardRow {
  return convertFields(normalizeVariableClipboardRow(raw), topFields, true, true);
}

/** Preserve unknown nested metadata rather than rebuilding it with generated fromPartial. */
export function variableClipboardRowToEditor(raw: unknown): ActionVariable {
  const row = normalizeVariableClipboardRow(raw);
  const overlay = (defaults: unknown, value: unknown): unknown => {
    if (!isRecord(defaults) || !isRecord(value)) return structuredClone(value);
    const result = structuredClone(defaults);
    for (const [key, item] of Object.entries(value)) define(result, key, overlay(result[key], item));
    return result;
  };
  const result = overlay(ActionVariable.create(), row) as ActionVariable;
  if (row.defaultValue === null) result.defaultValue = "";
  if (row.inputParamInfo === null) result.inputParamInfo = undefined;
  if (row.outputParamInfo === null) result.outputParamInfo = undefined;
  if (row.tableDef === null) result.tableDef = undefined;
  if (isRecord(row.inputParamInfo)) result.inputParamInfo = overlay(ActionVariableInputParamInfo.create(), row.inputParamInfo) as ActionVariable["inputParamInfo"];
  if (isRecord(row.outputParamInfo)) result.outputParamInfo = overlay(ActionVariableOutputParamInfo.create(), row.outputParamInfo) as ActionVariable["outputParamInfo"];
  if (isRecord(row.tableDef)) {
    result.tableDef = overlay(ActionTableDef.create(), row.tableDef) as ActionVariable["tableDef"];
    if (Array.isArray(row.tableDef.fields)) result.tableDef!.fields = row.tableDef.fields.map((field) => overlay(ActionTableField.create(), field) as ActionTableField);
  }
  return result;
}

export function parseProgramVariableClipboardRows(text: string): VariableClipboardRow[] {
  const root = parseVariableReferenceJson(text);
  let rows: unknown;
  if (Array.isArray(root)) rows = root;
  else if (isRecord(root)) {
    const keys = ["Variables", "variables"].filter((key) => Object.hasOwn(root, key));
    if (keys.length !== 1) throw new Error("剪贴板变量集合不存在或含歧义别名");
    rows = root[keys[0]!];
  }
  if (!Array.isArray(rows) || !rows.length) throw new Error("剪贴板没有可粘贴的变量");
  return rows.map(normalizeVariableClipboardRow);
}

/** Keep the native ActionStepsDto envelope, including the historical variable-only comment step. */
export function serializeProgramVariableClipboardRows(rows: readonly VariableClipboardRow[]): string {
  if (!rows.length) throw new Error("请先选择要复制的变量");
  const variables = rows.map(variableClipboardRowToDto);
  return stringifyLosslessJson({ Variables: variables, Steps: [{ StepRunnerKey: "sys:comment",
    InputParams: { note: { VarKey: "", Value: "$$" + rows.map((row) => `{${row.key}}`).join(" ") } }, OutputParams: {},
    IfSteps: [], ElseSteps: [], Note: "", Disabled: false, Collapsed: false, DelayMs: 0 }], SubPrograms: [] }, 2);
}

export function allocateVariableClipboardRows(existing: readonly { id?: unknown; key?: unknown }[], incoming: readonly VariableClipboardRow[]): VariableClipboardRow[] {
  const ids = new Set(existing.flatMap((row) => typeof row.id === "string" ? [row.id] : []));
  const names = new Set(existing.flatMap((row) => typeof row.key === "string" ? [row.key.trim().toLowerCase()] : []));
  let nextId = 1;
  return incoming.map((raw) => {
    const row = normalizeVariableClipboardRow(raw);
    while (ids.has(`v-${nextId}`)) nextId++;
    row.id = `v-${nextId++}`; ids.add(row.id as string);
    const base = `${row.key}_copy`;
    let key = base, suffix = 2;
    while (names.has(key.toLowerCase())) key = `${base}_${suffix++}`;
    row.key = key; names.add(key.toLowerCase());
    return row;
  });
}

export function exportProgramVariables(present: XProgramPresent, ids: readonly string[]): ProgramVariableClipboardExportResult {
  try {
    if (!ids.length || new Set(ids).size !== ids.length || ids.some((id) => !id.trim())) throw new Error("所选变量身份无效或不唯一");
    const rows = ids.map((id) => {
      const matches = present.variables.filter((row) => row.id === id);
      if (matches.length !== 1) throw new Error("所选变量已不存在或身份不唯一");
      return normalizeVariableClipboardRow(matches[0]);
    });
    return { ok: true, text: serializeProgramVariableClipboardRows(rows) };
  } catch (error) { return failure(error); }
}

export function prepareProgramVariablePaste(present: XProgramPresent, text: string): PreparedProgramVariablePaste {
  try {
    const rows = allocateVariableClipboardRows(present.variables, parseProgramVariableClipboardRows(text));
    return { ok: true, changed: true, insertedIds: rows.map((row) => row.id as string), present: {
      steps: structuredClone(present.steps), variables: [...structuredClone(present.variables), ...rows.map(variableClipboardRowToEditor)],
    } };
  } catch (error) { return failure(error); }
}
