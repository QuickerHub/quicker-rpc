import { isLosslessJsonNumber, losslessJsonNumberText } from "../shared/losslessJson";

export type SubProgramRecord = Record<string, unknown>;
export type RawSubProgramEntry = { row: SubProgramRecord; owned: boolean; parent: SubProgramRecord; index: number; path: string };

export function isSubProgramRecord(value: unknown): value is SubProgramRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !isLosslessJsonNumber(value);
}

export function subProgramRows(value: unknown): SubProgramRecord[] {
  return Array.isArray(value) ? value.filter(isSubProgramRecord) : [];
}

export function subProgramText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isInternalSubProgramRecord(row: SubProgramRecord): boolean {
  const kind = isLosslessJsonNumber(row.kind) ? Number(losslessJsonNumberText(row.kind)) : row.kind;
  return kind === undefined || kind === 0 || kind === 1;
}

/** Foreign descendants participate in identity checks, but never become owned editing surfaces. */
export function collectRawSubPrograms(program: SubProgramRecord, owned = true, path = ""): RawSubProgramEntry[] {
  return subProgramRows(program.subPrograms).flatMap((row, index) => {
    const rowPath = path + "/subPrograms/" + index;
    const entry = { row, owned: owned && isInternalSubProgramRecord(row), parent: program, index, path: rowPath };
    return [entry, ...collectRawSubPrograms(row, entry.owned, rowPath)];
  });
}

/** Current raw ownership/identity only; no input map or schema is required. */
export function findUniqueOwnedProgramDocumentStep(body: SubProgramRecord, stepId: string): SubProgramRecord {
  const rows = (record: SubProgramRecord, key: string): SubProgramRecord[] => {
    const value = record[key];
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((row) => !isSubProgramRecord(row))) throw new Error(`Invalid ${key} collection`);
    return value as SubProgramRecord[];
  };
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

/** The same accepted aliases and ambiguity boundary as the existing properties transaction. */
export function readStepInputsForRunner(step: SubProgramRecord, runner: string): SubProgramRecord | undefined {
  const present = (keys: string[]) => keys.filter((key) => step[key] !== null && step[key] !== undefined
    && !(typeof step[key] === "string" && !step[key].trim()));
  const runners = present(["stepRunnerKey", "StepRunnerKey", "key", "Key"]);
  if (!runners.some((key) => step[key] === runner)) return undefined;
  if (runners.length !== 1) throw new Error("Subprogram call has ambiguous runner aliases");
  const maps = present(["inputParams", "InputParams", "inputs", "Inputs"]);
  if (maps.length > 1) throw new Error("Subprogram call has ambiguous input aliases");
  const input = step[maps[0] ?? "inputParams"];
  return isSubProgramRecord(input) ? input : undefined;
}

/** Encode a regular C# string literal, never executable text supplied by a name. */
export function quoteSubProgramConstant(value: string): string {
  let result = '"';
  for (let index = 0; index < value.length; index++) {
    const character = value[index]!;
    if (character === '"' || character === "\\") result += "\\" + character;
    else if (character.charCodeAt(0) < 32 || character === "\u0085" || character === "\u2028" || character === "\u2029") {
      result += "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0");
    } else result += character;
  }
  return result + '"';
}

/** Only the properties writer's complete canonical constant form is a known literal. */
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
  return quoteSubProgramConstant(result) === literal ? result : undefined;
}

export function staticSubProgramIdentifier(value: string): string | undefined {
  const candidate = value.trim();
  if (candidate.startsWith("$$") || candidate.startsWith("%%") || candidate.startsWith("@@")) return undefined;
  return candidate.startsWith("$=") ? readConstantExpression(candidate)?.trim() : candidate;
}
