import type { ActionSubProgram, ActionVariable } from "../types/common";
import type { ActionProgramSnapshot } from "../program/assembleActionProgramSnapshot";
import { hashProgramStepContent } from "../program/stepDiskSlice";
import { parseVariableReferenceJson, prepareProgramVariableChange, type ProgramVariableChangeRequest } from "../program/programVariableReferences";
import { collectRawSubPrograms, isSubProgramRecord, type SubProgramRecord } from "./programDocumentSubProgramModel";
import { readClipboardSurface, readClipboardVariables } from "./programDocumentVariableClipboard";
import { parseProgramDocumentSnapshot, programDocumentFingerprint, serializeProgramDocumentSnapshot } from "./programDocumentWire";
import { stringifyLosslessJson } from "../shared/losslessJson";

export type ProgramDocumentVariableSelector = Readonly<{ surface: string; variableId: string }>;
export type ProgramDocumentVariableFieldChange = Readonly<{ field: string; valueJson: string }>;
export type ProgramDocumentVariableField = Readonly<{ field: string; editable: boolean; reason?: string; valueKind?: string }>;
export type ProgramDocumentVariableRead = ProgramDocumentVariableSelector & Readonly<{
  variableJson: string;
  defaultKind: string;
  contract: Readonly<{
    revision: string;
    source: "document-controller";
    nativeValidation: "unobserved";
    fields: readonly ProgramDocumentVariableField[];
  }>;
}>;
export type ProgramDocumentVariableLiveOptions = Readonly<{ fieldDenials?: Readonly<Record<string, string>> }>;
export type ProgramDocumentVariableLiveFailure = Readonly<{ ok: false; code: string; error: string }>;
export type ProgramDocumentVariableLiveChange = ProgramDocumentVariableSelector & Readonly<{
  contractRevision: string; changes: readonly ProgramDocumentVariableFieldChange[];
}>;

const failure = (code: string, error: string): ProgramDocumentVariableLiveFailure => ({ ok: false, code, error });
const inlineAliases = ["default", "defaultValue", "DefaultValue", "default_value"] as const;
const fileAliases = ["default.file", "defaultValue.file", "defaultValueFile", "DefaultValueFile"] as const;
const knownFields = ["id", "key", "desc", "group", "saveState", "isLocked", "defaultValue", "varType", "customType", "isInput", "isOutput", "paramName", "inputParamInfo", "outputParamInfo", "tableDef", "defaultValueFile"];
const canonicalFields = ["id", "key", "varType", "desc", "group", "saveState", "isLocked", "isInput", "isOutput", "paramName", "customType", "inputParamInfo", "outputParamInfo", "tableDef", "defaultValueFile"];
const dynamic = (value: string) => /^(?:\$=|\$\$|%%|@@)/.test(value.trimStart());

function projectedSurface(snapshot: ActionProgramSnapshot, surface: string): ActionProgramSnapshot | ActionSubProgram {
  if (surface === "main") return snapshot;
  const find = (rows: ActionSubProgram[]): ActionSubProgram | undefined => {
    for (const row of rows) { if (`sub-${row.id}` === surface) return row; const nested = find(row.subPrograms); if (nested) return nested; }
  };
  const result = find(snapshot.subPrograms);
  if (!result) throw Error("变量所属程序不在当前完整文档中。");
  return result;
}

function defaultShape(raw: SubProgramRecord): { kind: string; alias?: string; reason?: string } {
  if (fileAliases.some(key => Object.hasOwn(raw, key))
    || (isSubProgramRecord(raw.defaultValue) && Object.hasOwn(raw.defaultValue, "file"))) {
    return { kind: "file", reason: "外置默认值只读；本轮没有文件读取、写入或重新绑定权限。" };
  }
  const aliases = inlineAliases.filter(key => Object.hasOwn(raw, key));
  if (aliases.length === 0) return { kind: "missing", reason: "原文没有可证明的 inline string 默认值。" };
  if (aliases.length !== 1) return { kind: "ambiguous", reason: "默认值存在多个别名，无法证明唯一写回位置。" };
  const alias = aliases[0]!, value = raw[alias];
  if (typeof value !== "string") return { kind: "opaque", reason: "默认值不是 inline string，保留其原始数值、null 或结构。" };
  if (dynamic(value)) return { kind: "unknown-expression", reason: "默认值使用未证明的动态表达式模式。" };
  return { kind: "inline-string", alias };
}

function resolve(content: string, selector: ProgramDocumentVariableSelector) {
  if (!selector || typeof selector.surface !== "string" || !selector.surface || selector.surface !== selector.surface.trim()
    || typeof selector.variableId !== "string" || !selector.variableId || selector.variableId !== selector.variableId.trim()) {
    throw Error("需要实际编辑面与非空原始变量 ID。");
  }
  const document = parseVariableReferenceJson(content);
  if (!isSubProgramRecord(document)) throw Error("程序原文不是对象。");
  const body = readClipboardSurface(document, selector.surface);
  if (selector.surface !== "main") {
    const programs = collectRawSubPrograms(document), selected = programs.find(entry => entry.row === body)!;
    for (const ancestor of programs.filter(entry => entry === selected || selected.path.startsWith(`${entry.path}/`))) {
      const id = ancestor.row.id;
      if (typeof id !== "string" || !id.trim() || id !== id.trim() || programs.filter(entry => entry.row.id === id).length !== 1) {
        throw Error("变量所属程序或祖先缺少唯一稳定的原始 ID。");
      }
    }
  }
  const rows = readClipboardVariables(body);
  for (const row of rows) {
    for (const key of canonicalFields) {
      if (Object.keys(row).some(name => name !== key && name.toLowerCase() === key.toLowerCase())) throw Error("变量字段包含未被当前投影识别或歧义的别名。");
    }
    if (Object.hasOwn(row, "Type")) throw Error("原始变量类型别名尚未完整投影。");
    for (const key of ["isInput", "isOutput", "isLocked"]) {
      if (Object.hasOwn(row, key) && typeof row[key] !== "boolean") throw Error("原始变量权限标记不是明确布尔值。");
    }
  }
  const rawMatches = rows.filter(row => row.id === selector.variableId);
  if (rawMatches.length !== 1) throw Error("所选变量没有当前编辑面内唯一的原始 ID；不能使用投影生成的身份。");
  const snapshot = parseProgramDocumentSnapshot(content), present = projectedSurface(snapshot, selector.surface);
  if (present.variables.length !== rows.length || present.variables.some((row, index) => row.key !== rows[index]!.key
    || (typeof rows[index]!.id === "string" && rows[index]!.id !== row.id))) throw Error("原始变量与当前编辑投影不一致。");
  const matches = present.variables.filter(row => row.id === selector.variableId);
  if (matches.length !== 1) throw Error("所选变量的编辑投影不唯一。");
  return { document, snapshot, raw: rawMatches[0]!, expected: matches[0]!, present };
}

function rawIdentities(value: unknown, path = "", result: Record<string, unknown> = {}): Record<string, unknown> {
  if (Array.isArray(value)) value.forEach((item, index) => rawIdentities(item, `${path}/${index}`, result));
  else if (isSubProgramRecord(value)) for (const [key, item] of Object.entries(value)) {
    const location = `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
    if (key.toLowerCase() === "id" || key.toLowerCase() === "stepid") Object.defineProperty(result, location, { value: item, enumerable: true });
    rawIdentities(item, location, result);
  }
  return result;
}

function detail(selector: ProgramDocumentVariableSelector, raw: SubProgramRecord, options: ProgramDocumentVariableLiveOptions): ProgramDocumentVariableRead {
  const target = { surface: selector.surface, variableId: selector.variableId };
  const shape = defaultShape(raw);
  const fields: ProgramDocumentVariableField[] = knownFields.map(field => {
    const denial = options.fieldDenials?.[field];
    if (typeof denial === "string") return { field, editable: false, reason: denial };
    if (["key", "desc", "group"].includes(field)) {
      const reason = Object.hasOwn(raw, field) && typeof raw[field] !== "string" ? "原字段不是明确字符串。"
        : field === "key" && (raw.isInput === true || raw.isOutput === true) ? "接口变量改名需要调用者迁移契约。" : undefined;
      return { field, editable: !reason, valueKind: "string", ...(reason ? { reason } : {}) };
    }
    if (field === "saveState" || field === "isLocked") {
      const reason = Object.hasOwn(raw, field) && typeof raw[field] !== "boolean" ? "原字段不是明确布尔值。" : undefined;
      return { field, editable: !reason, valueKind: "boolean", ...(reason ? { reason } : {}) };
    }
    if (field === "defaultValue") return { field, editable: shape.kind === "inline-string", valueKind: "string", ...(shape.reason ? { reason: shape.reason } : {}) };
    return { field, editable: false, reason: field === "id" ? "稳定变量身份只读。"
      : field === "defaultValueFile" ? "外置文件绑定只读。" : "当前没有此字段的类型、接口或结构化编辑契约；不能使用 UI 枚举推断宿主权限。" };
  });
  for (const field of Object.keys(raw)) if (!knownFields.includes(field) && !inlineAliases.includes(field as typeof inlineAliases[number]) && !fileAliases.includes(field as typeof fileAliases[number])) {
    fields.push({ field, editable: false, reason: "未知扩展字段只读，保留原文。" });
  }
  // This local revision identifies an observed mapping, not a native capability or grant.
  const revision = "document-variable-v1:" + hashProgramStepContent(programDocumentFingerprint({ selector: target, fields, defaultKind: shape.kind,
    defaultAlias: shape.alias, varType: raw.varType, interface: [raw.isInput, raw.isOutput] }));
  return { ...target, variableJson: stringifyLosslessJson(raw), defaultKind: shape.kind,
    contract: { revision, source: "document-controller", nativeValidation: "unobserved", fields } };
}

export function readProgramDocumentVariable(content: string, selector: ProgramDocumentVariableSelector,
  options: ProgramDocumentVariableLiveOptions = {}): { ok: true; variable: ProgramDocumentVariableRead } | ProgramDocumentVariableLiveFailure {
  try { const resolved = resolve(content, selector); return { ok: true, variable: detail(selector, resolved.raw, options) }; }
  catch (error) { return failure("VARIABLE_TARGET_UNAVAILABLE", error instanceof Error ? error.message : String(error)); }
}

/** Prepare one proven row; the original Session/controller alone owns the eventual transaction. */
export function prepareProgramDocumentVariableLiveChange(content: string, input: ProgramDocumentVariableLiveChange,
  options: ProgramDocumentVariableLiveOptions = {}): { ok: true; request: ProgramVariableChangeRequest; changedFields: readonly string[] } | ProgramDocumentVariableLiveFailure {
  try {
    if (!input || typeof input !== "object" || Object.keys(input).some(key => !["surface", "variableId", "contractRevision", "changes"].includes(key))
      || typeof input.contractRevision !== "string" || !Array.isArray(input.changes) || input.changes.length < 1 || input.changes.length > 16
      || new TextEncoder().encode(JSON.stringify(input)).length > 1_048_576) return failure("INVALID_VARIABLE_CHANGES", "变量修改必须是单行、1 至 16 个字段且不超过 1 MiB。");
    const resolved = resolve(content, input), current = detail(input, resolved.raw, options);
    if (input.contractRevision !== current.contract.revision) return failure("VARIABLE_CONTRACT_CHANGED", "变量字段契约已变化，请重新读取原变量。");
    const seen = new Set<string>(), changedFields: string[] = [];
    const next: ActionVariable = structuredClone(resolved.expected);
    for (const change of input.changes) {
      if (!change || typeof change !== "object" || Object.keys(change).sort().join() !== "field,valueJson" || typeof change.field !== "string"
        || !change.field || change.field.length > 256 || typeof change.valueJson !== "string" || seen.has(change.field)) return failure("INVALID_VARIABLE_CHANGES", "变量修改字段无效或重复。");
      seen.add(change.field);
      const field = current.contract.fields.find(row => row.field === change.field);
      if (!field?.editable) return failure("VARIABLE_FIELD_DENIED", field?.reason ?? "此字段没有可写契约。");
      let value: unknown;
      try { value = JSON.parse(change.valueJson); } catch { return failure("VARIABLE_FIELD_VALUE_INVALID", "valueJson 必须是明确的 JSON 标量。"); }
      if (typeof value !== field.valueKind || (typeof value === "string" && value.length > 100_000)) return failure("VARIABLE_FIELD_VALUE_INVALID", "字段值类型或长度与当前契约不符。");
      if (change.field === "defaultValue" && typeof value === "string" && dynamic(value)) return failure("VARIABLE_FIELD_DENIED", "默认值使用未证明的动态表达式模式。");
      const record = next as unknown as Record<string, unknown>;
      if (record[change.field] !== value) changedFields.push(change.field);
      record[change.field] = value;
    }
    const request: ProgramVariableChangeRequest = { kind: "edit", expected: structuredClone(resolved.expected), next };
    const prepared = prepareProgramVariableChange(resolved.present, request);
    if (!prepared.ok) return prepared;
    if (prepared.changed) {
      // Preview the existing serializer without allocating another Session. An
      // unrelated legacy projection fallback must not become a persisted ID.
      const snapshot = structuredClone(resolved.snapshot);
      Object.assign(projectedSurface(snapshot, input.surface), prepared.present);
      const merged = parseVariableReferenceJson(serializeProgramDocumentSnapshot(content, snapshot));
      if (programDocumentFingerprint(rawIdentities(resolved.document)) !== programDocumentFingerprint(rawIdentities(merged))) {
        return failure("VARIABLE_IDENTITY_MAPPING_UNPROVEN", "本次写回会新增或改写其它原始身份，不能将投影生成的 ID 写入文档。");
      }
    }
    return { ok: true, request, changedFields };
  } catch (error) { return failure("VARIABLE_TARGET_UNAVAILABLE", error instanceof Error ? error.message : String(error)); }
}
