import type { ProgramDocumentEditOptions, ProgramDocumentEditResult, ProgramDocumentSession } from "./programDocumentSession";
import { parseProgramDocumentSnapshot, serializeProgramDocumentSnapshot } from "./programDocumentWire";
import { collectRawSubPrograms, isSubProgramRecord, type SubProgramRecord } from "./programDocumentSubProgramModel";
import { changeProgramVariableExpression, parseVariableReferenceJson, prepareProgramVariableChange, type ProgramVariableChangeRequest } from "../program/programVariableReferences";
import { parseWireParamKey } from "../../input-param-wire";
import { parseLosslessJson, stringifyLosslessJson } from "../shared/losslessJson";
import type { ActionSubProgram } from "../types/common";
import type { ActionProgramSnapshot } from "../program/assembleActionProgramSnapshot";
import { resolveProgramWireStepFields } from "../wire/programWire";

function rawSurface(document: SubProgramRecord, surface: string): SubProgramRecord {
  aliases(document, [["subPrograms", "SubPrograms"]]);
  if (surface === "main") return document;
  const id = surface.startsWith("sub-") ? surface.slice(4) : "";
  const matches = collectRawSubPrograms(document).filter((entry) => entry.row.id === id);
  if (!id || matches.length !== 1 || !matches[0]!.owned) throw new Error("变量所属子程序不存在、不唯一或不属于本地程序");
  for (const ancestor of collectRawSubPrograms(document).filter((entry) => matches[0]!.path.startsWith(entry.path + "/") || entry === matches[0])) {
    aliases(ancestor.row, [["id", "Id"], ["kind", "Kind"], ["subPrograms", "SubPrograms"]]);
  }
  aliases(matches[0]!.row, [["id", "Id"], ["kind", "Kind"], ["subPrograms", "SubPrograms"]]);
  return matches[0]!.row;
}

function projectedSurface(snapshot: ActionProgramSnapshot, surface: string): ActionProgramSnapshot | ActionSubProgram {
  if (surface === "main") return snapshot;
  const find = (rows: ActionSubProgram[]): ActionSubProgram | undefined => {
    for (const row of rows) { if (row.id === surface.slice(4)) return row; const result = find(row.subPrograms); if (result) return result; }
  };
  const result = find(snapshot.subPrograms);
  if (!result) throw new Error("变量所属程序已经不存在");
  return result;
}

function aliases(record: SubProgramRecord, groups: readonly (readonly string[])[]): void {
  for (const group of groups) {
    const found = group.filter((key) => Object.hasOwn(record, key));
    if (found.length > 1) throw new Error("原始变量或引用包含歧义字段别名，请先核对正文");
    // The current program projection reads canonical collection/identity names only.
    if (found.length && found[0] !== group[0]) throw new Error("原始程序字段未被当前编辑投影完整识别，请先核对正文");
  }
}

function guardRawScope(body: SubProgramRecord, references: boolean, request: ProgramVariableChangeRequest): void {
  const unknownReference = (value: unknown): void => {
    if (typeof value === "string") {
      const result = changeProgramVariableExpression(value, request);
      if (!result.ok || result.value !== value) throw new Error("未知原始扩展字段可能引用该变量，当前事务不能安全改写");
    } else if (Array.isArray(value)) value.forEach(unknownReference);
    else if (isSubProgramRecord(value)) Object.values(value).forEach(unknownReference);
  };
  aliases(body, [["steps", "Steps"], ["variables", "Variables"], ["subPrograms", "SubPrograms"]]);
  if (!Array.isArray(body.variables)) throw new Error("变量集合不可核验");
  for (const variable of body.variables) {
    if (!isSubProgramRecord(variable)) throw new Error("变量正文不可核验");
    aliases(variable, [["id", "Id"], ["key", "Key"], ["varType", "VarType", "Type"], ["inputParamInfo", "InputParamInfo"], ["outputParamInfo", "OutputParamInfo"],
      ["isInput", "IsInput"], ["isOutput", "IsOutput"], ["isLocked", "IsLocked"], ["defaultValueFile", "DefaultValueFile"],
      ["desc", "Desc"], ["customType", "CustomType"], ["tableDef", "TableDef"]]);
    for (const key of ["isInput", "isOutput", "isLocked"]) if (Object.hasOwn(variable, key) && typeof variable[key] !== "boolean") throw new Error("变量权限标记不是明确布尔值");
    for (const key of ["inputParamInfo", "outputParamInfo"]) if (isSubProgramRecord(variable[key])) {
      aliases(variable[key], [["visibleExpression", "VisibleExpression"]]);
    }
    if (!references) continue;
    const variableFields = new Set(["id", "key", "varType", "desc", "isLocked", "saveState", "isInput", "isOutput", "paramName", "group", "customType", "inputParamInfo", "outputParamInfo", "tableDef", "default", "defaultValue", "DefaultValue", "default_value", "default.file", "defaultValue.file", "defaultValueFile"]);
    for (const [key, value] of Object.entries(variable)) if (!variableFields.has(key)) unknownReference(value);
    const defaults = ["default", "defaultValue", "DefaultValue", "default_value"].filter((key) => Object.hasOwn(variable, key));
    if (defaults.length > 1) throw new Error("变量默认值包含歧义字段别名");
    for (const key of defaults) if (variable[key] !== null && typeof variable[key] !== "string") throw new Error("变量默认值正文尚不能完整核验");
  }
  if (!references) return;
  for (const [key, value] of Object.entries(body)) if (!["steps", "variables", "subPrograms", "summaryExpression", "SummaryExpression", "id", "name", "description", "icon", "kind", "stepCount", "variableCount"].includes(key)) unknownReference(value);
  const visit = (rows: unknown): void => {
    if (rows === undefined) return;
    if (!Array.isArray(rows)) throw new Error("步骤集合不可核验");
    for (const step of rows) {
      if (!isSubProgramRecord(step)) throw new Error("步骤正文不可核验");
      aliases(step, [["stepId", "StepId"], ["stepRunnerKey", "StepRunnerKey"], ["key", "Key"],
        ["inputParams", "InputParams"], ["inputs", "Inputs"], ["outputParams", "OutputParams"], ["outputs", "Outputs"],
        ["ifSteps", "IfSteps"], ["elseSteps", "ElseSteps"]]);
      const fields = resolveProgramWireStepFields(step);
      for (const [key, value] of Object.entries(step)) if (!["stepId", fields.runner, fields.inputs, fields.outputs, "ifSteps", "elseSteps", "note", "disabled", "collapsed", "delayMs"].includes(key)) unknownReference(value);
      const inputs = step[fields.inputs];
      if (inputs !== undefined && !isSubProgramRecord(inputs)) throw new Error("输入参数结构不可核验");
      const seen = new Set<string>();
      for (const [key, pin] of Object.entries((inputs ?? {}) as SubProgramRecord)) {
        const base = parseWireParamKey(key).baseKey;
        if (seen.has(base)) throw new Error("输入参数同时存在多种绑定，不能安全改写引用");
        seen.add(base);
        if (pin === null || typeof pin === "string") continue;
        if (!isSubProgramRecord(pin)) throw new Error("输入参数正文不可核验");
        for (const [name, value] of Object.entries(pin)) if (!["value", "Value", "varKey", "VarKey", "file", "File"].includes(name)) unknownReference(value);
        for (const names of [["value", "Value"], ["varKey", "VarKey"], ["file", "File"]]) {
          const keys = names.filter((name) => Object.hasOwn(pin, name));
          if (keys.length > 1) throw new Error("输入参数包含歧义字段别名");
          if (keys.length && typeof pin[keys[0]!] !== "string" && pin[keys[0]!] !== null) throw new Error("输入参数绑定正文不可核验");
        }
      }
      visit(step.ifSteps); visit(step.elseSteps);
    }
  };
  visit(body.steps);
}

/** Use the latest complete native document, comparing only the captured variable rows for staleness. */
export function applyProgramDocumentVariableChange(
  session: ProgramDocumentSession, surface: string, request: ProgramVariableChangeRequest, options: ProgramDocumentEditOptions,
): ProgramDocumentEditResult {
  return session.transact({ ...options, update(document) {
    parseVariableReferenceJson(session.getState().content);
    const body = rawSurface(document, surface);
    const references = request.kind === "delete" || request.expected.key !== request.next.key.trim();
    guardRawScope(body, references, request);
    const content = stringifyLosslessJson(document);
    const snapshot = parseProgramDocumentSnapshot(content);
    const target = projectedSurface(snapshot, surface);
    const prepared = prepareProgramVariableChange(target, request);
    if (!prepared.ok) throw new Error(prepared.error);
    Object.assign(target, prepared.present);
    const merged = parseLosslessJson(serializeProgramDocumentSnapshot(content, snapshot));
    if (!isSubProgramRecord(merged)) throw new Error("程序正文不可核验");
    if (references) {
      const output = rawSurface(merged, surface);
      const summaries = ["summaryExpression", "SummaryExpression"].filter((key) => Object.hasOwn(body, key));
      if (summaries.length > 1) throw new Error("摘要表达式包含歧义字段别名");
      for (const key of summaries) {
        if (typeof body[key] !== "string") throw new Error("摘要表达式结构不可核验");
        const result = changeProgramVariableExpression(body[key], request);
        if (!result.ok) throw new Error(result.error);
        output[key] = result.value;
      }
      if (surface === "main" && session.getState().metadata) {
        const metadata = parseLosslessJson(session.getState().metadata!.content);
        if (isSubProgramRecord(metadata)) for (const key of ["summaryExpression", "SummaryExpression"]) {
          if (typeof metadata[key] !== "string") continue;
          const result = changeProgramVariableExpression(metadata[key], request);
          if (!result.ok || result.value !== metadata[key]) throw new Error("动作元数据中的摘要表达式仍引用该变量；本次变量事务不能修改此元数据字段");
        }
      }
    }
    return merged;
  } });
}
