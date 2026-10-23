import { compactWireInputParam, expandWireInputParams, parseWireParamKey } from "../../input-param-wire";
import { isLosslessJsonNumber, losslessJsonNumberText } from "../shared/losslessJson";
import type { ProgramDocumentEditOptions, ProgramDocumentEditResult, ProgramDocumentSession } from "./programDocumentSession";

export type SubProgramPropertiesPatch = { name: string; description: string; icon: string };
type RecordValue = Record<string, unknown>;
type SubProgramEntry = { row: RecordValue; owned: boolean };

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !isLosslessJsonNumber(value);
}

function rows(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isInternal(row: RecordValue): boolean {
  const kind = isLosslessJsonNumber(row.kind) ? Number(losslessJsonNumberText(row.kind)) : row.kind;
  return kind === undefined || kind === 0 || kind === 1;
}

function collectSubPrograms(program: RecordValue, owned = true): SubProgramEntry[] {
  return rows(program.subPrograms).flatMap((row) => {
    const entry = { row, owned: owned && isInternal(row) };
    // Link/template descendants are cached foreign bodies, not local editing surfaces.
    return [entry, ...collectSubPrograms(row, entry.owned)];
  });
}

/** Encode a regular C# string literal, never executable text supplied by a name. */
function quoteConstant(value: string): string {
  let result = '"';
  for (let index = 0; index < value.length; index++) {
    const character = value[index]!;
    if (character === '"' || character === "\\") result += `\\${character}`;
    else if (character.charCodeAt(0) < 32 || character === "\u0085" || character === "\u2028" || character === "\u2029") {
      result += `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
    } else result += character;
  }
  return `${result}"`;
}

/** Only our complete, canonical constant form is static; other expressions remain opaque. */
function readConstantExpression(value: string): string | undefined {
  if (!value.startsWith('$="') || !value.endsWith('"')) return undefined;
  const literal = value.slice(2);
  let result = "";
  for (let index = 1; index < literal.length - 1; index++) {
    const character = literal[index]!;
    if (character === '"' || character.charCodeAt(0) < 32 || character === "\u0085" || character === "\u2028" || character === "\u2029") return undefined;
    if (character !== "\\") { result += character; continue; }
    const escape = literal[++index];
    if (escape === '"' || escape === "\\") result += escape;
    else if (escape === "u" && /^[0-9a-f]{4}$/.test(literal.slice(index + 1, index + 5))) {
      result += String.fromCharCode(Number.parseInt(literal.slice(index + 1, index + 5), 16));
      index += 4;
    } else return undefined;
  }
  return quoteConstant(result) === literal ? result : undefined;
}

function staticIdentifier(value: string): string | undefined {
  const candidate = value.trim();
  if (candidate.startsWith("$$") || candidate.startsWith("%%") || candidate.startsWith("@@")) return undefined;
  return candidate.startsWith("$=") ? readConstantExpression(candidate)?.trim() : candidate;
}

function nativeLiteral(name: string): string {
  // The native runner evaluates these prefixes. A constant expression preserves the literal name.
  return name.startsWith("$=") || name.startsWith("$$") ? `$=${quoteConstant(name)}` : name;
}

function renameStepTarget(step: RecordValue, oldName: string, newName: string): void {
  // AgentStepWireAliases accepts these disk/native names. Keep their original namespace.
  const present = (keys: string[]) => keys.filter((key) => step[key] !== null && step[key] !== undefined
    && !(typeof step[key] === "string" && !step[key].trim()));
  const runners = present(["stepRunnerKey", "StepRunnerKey", "key", "Key"]);
  if (!runners.some((key) => step[key] === "sys:subprogram")) return;
  if (runners.length !== 1) throw new Error("Subprogram call has ambiguous runner aliases");
  const maps = present(["inputParams", "InputParams", "inputs", "Inputs"]);
  if (maps.length > 1) throw new Error("Subprogram call has ambiguous input aliases");
  const input = step[maps[0] ?? "inputParams"];
  if (!isRecord(input)) return;
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
