import type { ProgramDocumentEditOptions, ProgramDocumentEditResult, ProgramDocumentSession } from "./programDocumentSession";
import { isInternalSubProgramRecord, isSubProgramRecord, type SubProgramRecord } from "./programDocumentSubProgramModel";
import { parseVariableReferenceJson } from "../program/programVariableReferences";
import { allocateVariableClipboardRows, normalizeVariableClipboardRow, parseProgramVariableClipboardRows, serializeProgramVariableClipboardRows,
  type ProgramVariableClipboardExportResult } from "../program/programVariableClipboard";
import type { ActionProgramSnapshot } from "../program/assembleActionProgramSnapshot";

function projectedVariables(snapshot: ActionProgramSnapshot, surface: string): typeof snapshot.variables {
  if (surface === "main") return snapshot.variables;
  const find = (programs: typeof snapshot.subPrograms): typeof snapshot.variables | undefined => {
    for (const program of programs) {
      if (program.id === surface.slice(4)) return program.variables;
      const nested = find(program.subPrograms); if (nested) return nested;
    }
  };
  const found = find(snapshot.subPrograms);
  if (!found) throw new Error("变量所属编辑表面已不存在");
  return found;
}

function canonical(record: SubProgramRecord, key: string): void {
  if (Object.keys(record).some((name) => name !== key && name.toLowerCase() === key.toLowerCase())) throw new Error("程序集合或身份含未被当前编辑器识别的字段别名");
}

function rawSurface(document: SubProgramRecord, surface: string): SubProgramRecord {
  canonical(document, "subPrograms");
  if (surface === "main") return document;
  const id = surface.startsWith("sub-") ? surface.slice(4) : "";
  const matches: { row: SubProgramRecord; owned: boolean }[] = [];
  const visit = (body: SubProgramRecord, owned: boolean): void => {
    canonical(body, "subPrograms");
    if (body.subPrograms === undefined) return;
    if (!Array.isArray(body.subPrograms)) throw new Error("子程序集合不可核验");
    for (const row of body.subPrograms) {
      if (!isSubProgramRecord(row)) throw new Error("子程序正文不可核验");
      canonical(row, "id"); canonical(row, "kind");
      const local = owned && isInternalSubProgramRecord(row);
      if (row.id === id) matches.push({ row, owned: local });
      visit(row, local);
    }
  };
  visit(document, true);
  if (!id || matches.length !== 1 || !matches[0]!.owned) throw new Error("变量所属子程序不存在、不唯一或不属于本地程序");
  return matches[0]!.row;
}

function variableRows(body: SubProgramRecord): SubProgramRecord[] {
  canonical(body, "variables");
  if (body.variables === undefined) return [];
  if (!Array.isArray(body.variables) || body.variables.some((row) => !isSubProgramRecord(row))) throw new Error("变量集合不可核验");
  const ids = new Set<string>(), keys = new Set<string>();
  for (const row of body.variables as SubProgramRecord[]) {
    canonical(row, "id"); canonical(row, "key");
    if (row.id !== undefined && typeof row.id !== "string") throw new Error("变量身份不是文本");
    if (typeof row.id === "string" && row.id.trim()) {
      if (ids.has(row.id)) throw new Error("变量原始身份重复，不能安全复制粘贴");
      ids.add(row.id);
    }
    if (typeof row.key !== "string" || !row.key.trim()) throw new Error("变量原始名称不可核验");
    const key = row.key.trim().toLowerCase();
    if (keys.has(key)) throw new Error("变量原始名称重复，不能安全复制粘贴");
    keys.add(key);
  }
  return body.variables as SubProgramRecord[];
}

export function exportProgramDocumentVariables(session: ProgramDocumentSession, surface: string, ids: readonly string[]): ProgramVariableClipboardExportResult {
  try {
    if (session.isClosed()) throw new Error("原文档会话已经关闭");
    if (!ids.length || new Set(ids).size !== ids.length || ids.some((id) => !id.trim())) throw new Error("所选变量身份无效或不唯一");
    const document = parseVariableReferenceJson(session.getState().content);
    if (!isSubProgramRecord(document)) throw new Error("程序正文不是对象");
    const rows = variableRows(rawSurface(document, surface));
    const projected = projectedVariables(session.readSnapshot(), surface);
    if (projected.length !== rows.length || projected.some((row, index) => row.key !== rows[index]!.key)) throw new Error("原始变量与当前编辑投影不能一一对应");
    const selected = ids.map((id) => {
      const indices = projected.flatMap((row, index) => row.id === id ? [index] : []);
      if (indices.length !== 1) throw new Error("所选变量缺少唯一编辑身份");
      const raw = rows[indices[0]!]!;
      if (typeof raw.id === "string" && raw.id.trim() && raw.id !== id) throw new Error("原始变量身份与当前编辑投影不一致");
      // Synchronous copy may locate a legacy ID-less row by its current unique projection/key.
      // This does not persist that synthetic ID or grant any asynchronous editing authority.
      return normalizeVariableClipboardRow(raw);
    });
    return { ok: true, text: serializeProgramVariableClipboardRows(selected) };
  } catch (error) {
    return { ok: false, code: "variable_clipboard_unsupported", error: error instanceof Error ? error.message : "无法安全复制所选变量" };
  }
}

/** Raw append is a single session transaction; projection is used only to reserve synthetic legacy IDs. */
export function pasteProgramDocumentVariables(session: ProgramDocumentSession, surface: string, text: string, options: ProgramDocumentEditOptions):
  ProgramDocumentEditResult & { insertedIds?: readonly string[] } {
  let insertedIds: string[] = [];
  const result = session.transact({ ...options, update(document) {
    parseVariableReferenceJson(session.getState().content);
    const body = rawSurface(document, surface), rows = variableRows(body);
    const projected = projectedVariables(session.readSnapshot(), surface);
    const incoming = allocateVariableClipboardRows([...rows, ...projected], parseProgramVariableClipboardRows(text));
    body.variables = [...rows, ...incoming];
    if (surface !== "main" && Object.hasOwn(body, "variableCount")) body.variableCount = (body.variables as unknown[]).length;
    insertedIds = incoming.map((row) => row.id as string);
  } });
  return result.ok ? { ...result, insertedIds } : result;
}
