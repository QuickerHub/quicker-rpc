import { compactWireInputParam, expandWireInputParams, parseWireParamKey } from "../../input-param-wire";
import { collectRawSubPrograms as collectSubPrograms, isInternalSubProgramRecord as isInternal, isSubProgramRecord as isRecord,
  quoteSubProgramConstant, readStepInputsForRunner, staticSubProgramIdentifier as staticIdentifier,
  subProgramRows as rows, subProgramText as text, type SubProgramRecord as RecordValue } from "./programDocumentSubProgramModel";
import type { ProgramDocumentEditOptions, ProgramDocumentEditResult, ProgramDocumentSession } from "./programDocumentSession";

export type SubProgramPropertiesPatch = { name: string; description: string; icon: string };
function nativeLiteral(name: string): string {
  // The native runner evaluates these prefixes. A constant expression preserves the literal name.
  return name.startsWith("$=") || name.startsWith("$$") ? `$=${quoteSubProgramConstant(name)}` : name;
}

function renameStepTarget(step: RecordValue, oldName: string, newName: string): void {
  const input = readStepInputsForRunner(step, "sys:subprogram");
  if (!input) return;
  const expanded = expandWireInputParams(input);
  const key = expanded.subProgram !== undefined ? "subProgram" : "SubProgram";
  const pin = expanded[key];
  if (!pin || pin.varKey?.trim() || pin.file?.trim() || typeof pin.value !== "string" || staticIdentifier(pin.value) !== oldName) return;

  // Find the value contributor using the same merge order as the wire reader.
  let contributor: [string, unknown] | undefined;
  for (const [wireKey, raw] of Object.entries(input)) {
    if (parseWireParamKey(wireKey).baseKey !== key) continue;
    if (typeof expandWireInputParams({ [wireKey]: raw })[key]?.value === "string") contributor = [wireKey, raw];
  }
  if (!contributor) return;
  const [wireKey, raw] = contributor;
  const value = nativeLiteral(newName);
  if (isRecord(raw)) {
    const field = raw.value !== null && raw.value !== undefined ? "value" : "Value";
    raw[field] = value;
  } else {
    input[wireKey] = compactWireInputParam(key, { value })[key];
  }
}

function renameProgramCalls(program: RecordValue, oldName: string, newName: string): void {
  const visit = (steps: unknown): void => {
    for (const step of rows(steps)) {
      renameStepTarget(step, oldName, newName);
      visit(step.ifSteps);
      visit(step.IfSteps);
      visit(step.elseSteps);
      visit(step.ElseSteps);
    }
  };
  visit(program.steps);
  for (const row of rows(program.subPrograms)) {
    if (isInternal(row)) renameProgramCalls(row, oldName, newName);
  }
}

/**
 * Properties and all owned literal call sites enter the existing document timeline once.
 * Names starting with native expression prefixes use a fixed quoted constant expression
 * in their call pins; arbitrary existing expressions are never evaluated or rewritten.
 */
export function applyProgramDocumentSubProgramProperties(
  session: ProgramDocumentSession,
  id: string,
  patch: SubProgramPropertiesPatch,
  options: ProgramDocumentEditOptions,
): ProgramDocumentEditResult {
  return session.transact({ ...options, update: (document) => {
    if (typeof id !== "string" || !id.trim()) throw new Error("Subprogram requires a stable id");
    if (!patch || [patch.name, patch.description, patch.icon].some((value) => typeof value !== "string")) throw new Error("Subprogram properties must be strings");
    const entries = collectSubPrograms(document);
    const matching = entries.filter(({ row }) => text(row.id) === id.trim());
    if (matching.length !== 1) throw new Error("Subprogram id is missing or ambiguous");
    const target = matching[0]!;
    if (!target.owned) throw new Error("Only owned internal subprogram properties can be edited");
    const name = patch.name.trim();
    if (!name) throw new Error("Subprogram name cannot be empty");
    if (name.startsWith("%%") || name.startsWith("@@")) throw new Error("Internal subprogram name cannot start with %% or @@");
    if (entries.some(({ row, owned }) => owned && row !== target.row && text(row.name) === name)) throw new Error("Subprogram name already exists");
    const oldName = text(target.row.name) || text(target.row.id);
    if (oldName !== name) {
      if (entries.some(({ row, owned }) => owned && row !== target.row && (text(row.name) || text(row.id)) === oldName)) throw new Error("Existing subprogram identifier is ambiguous");
      renameProgramCalls(document, oldName, name);
    }
    target.row.name = name;
    target.row.description = patch.description;
    target.row.icon = patch.icon;
  } });
}
