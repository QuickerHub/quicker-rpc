import { expandWireInputParams } from "../../input-param-wire";
import { parseLosslessJson } from "../shared/losslessJson";
import type { ProgramDocumentEditOptions, ProgramDocumentEditResult, ProgramDocumentFailure, ProgramDocumentIdentity, ProgramDocumentSession } from "./programDocumentSession";
import { programDocumentFingerprint } from "./programDocumentWire";
import { collectRawSubPrograms, isSubProgramRecord, readStepInputsForRunner, staticSubProgramIdentifier,
  subProgramRows, subProgramText, type RawSubProgramEntry, type SubProgramRecord } from "./programDocumentSubProgramModel";

export type SubProgramDocumentEditOptions = ProgramDocumentEditOptions & { expectedIdentity: ProgramDocumentIdentity };
export type CreatedDocumentSubProgram = Readonly<{ id: string; name: string }>;
export type CreateDocumentSubProgramResult = ProgramDocumentFailure
  | (Extract<ProgramDocumentEditResult, { ok: true }> & { created: CreatedDocumentSubProgram });
export type SubProgramDeleteReference = Readonly<{
  path: string;
  targetId: string;
  kind: "subprogram" | "show_text";
}>;
export type PreparedSubProgramDelete = Readonly<{
  revision: number;
  identity: Readonly<ProgramDocumentIdentity>;
  id: string;
  name: string;
  targetFingerprint: string;
  removedIds: readonly string[];
  canDelete: boolean;
  references: readonly SubProgramDeleteReference[];
  /** Native stored references only: arbitrary dynamic expressions are never evaluated or proven unused. */
  referenceBoundary: "stored-values-and-show-text-operations";
}>;
export type PrepareSubProgramDeleteResult = { ok: true; preview: PreparedSubProgramDelete } | ProgramDocumentFailure;

// A reopened session can have the same persistent identity/revision/body. Its predecessor's
// confirmation is still not its work; this holds no document copy and expires with the preview.
const previewOwners = new WeakMap<PreparedSubProgramDelete, ProgramDocumentSession>();

function reject(session: ProgramDocumentSession, code: ProgramDocumentFailure["code"], error: string): ProgramDocumentFailure {
  return { ok: false, code, error, state: session.getState() };
}

function rootOf(session: ProgramDocumentSession): SubProgramRecord {
  const root: unknown = parseLosslessJson(session.getState().content);
  if (!isSubProgramRecord(root)) throw new Error("Program document must be an object");
  return root;
}

function requireTarget(root: SubProgramRecord, id: string): RawSubProgramEntry {
  if (typeof id !== "string" || !id.trim()) throw new Error("Subprogram requires a stable id");
  const matching = collectRawSubPrograms(root).filter(({ row }) => subProgramText(row.id) === id.trim());
  if (matching.length !== 1) throw new Error("Subprogram id is missing or ambiguous");
  const target = matching[0]!;
  if (!target.owned) throw new Error("Only owned internal subprograms can be deleted");
  return target;
}

function nextName(root: SubProgramRecord, entries: RawSubProgramEntry[], id: string, suggestedName?: string): string {
  if (suggestedName !== undefined && typeof suggestedName !== "string") throw new Error("Subprogram name must be a string");
  // Root row names match the Web add menu; owned nested names also remain unique with properties edits.
  const used = new Set(entries.filter((entry) => entry.owned || entry.parent === root)
    .map(({ row }) => subProgramText(row.name)).filter(Boolean));
  const suggested = (suggestedName ?? "").trim();
  if (suggested.startsWith("%%") || suggested.startsWith("@@")) throw new Error("Internal subprogram name cannot start with %% or @@");
  if (suggested && !used.has(suggested)) return suggested;
  if (suggested) {
    for (let index = 2; index < 10000; index++) {
      if (!used.has(suggested + index)) return suggested + index;
    }
  }
  for (let index = 1; index < 10000; index++) {
    if (!used.has("子程序" + index)) return "子程序" + index;
  }
  const fallback = "子程序_" + id.slice(0, 8);
  if (used.has(fallback)) throw new Error("Cannot generate a unique internal subprogram name");
  return fallback;
}

/** Append an empty root definition, just like the source Web add menu. IDs belong to the caller. */
export function createProgramDocumentSubProgram(session: ProgramDocumentSession,
  input: { id: string; suggestedName?: string }, options: SubProgramDocumentEditOptions): CreateDocumentSubProgramResult {
  let created: CreatedDocumentSubProgram | undefined;
  const result = session.transact({ ...options, update: (root) => {
    if (!options.expectedIdentity) throw new Error("Subprogram creation requires the complete document identity");
    if (!input || typeof input.id !== "string" || !input.id.trim()) throw new Error("Subprogram requires a stable id");
    const id = input.id.trim();
    const entries = collectRawSubPrograms(root);
    const ids = entries.map(({ row }) => subProgramText(row.id)).filter(Boolean);
    if (ids.includes(id) || new Set(ids).size !== ids.length) throw new Error("Subprogram id is already present or ambiguous");
    const name = nextName(root, entries, id, input.suggestedName);
    const rows = subProgramRows(root.subPrograms);
    rows.push({ id, name, description: "", icon: "", kind: 1, steps: [], variables: [], subPrograms: [], stepCount: 0, variableCount: 0 });
    root.subPrograms = rows;
    created = Object.freeze({ id, name });
  } });
  return result.ok ? { ...result, created: created! } : result;
}

// Native usage guards compare names without case sensitivity. Uppercasing is conservative for
// expanding Unicode case mappings too: an ambiguous spelling can block deletion, never permit it.
const folded = (value: string) => value.toUpperCase();
const under = (path: string, ancestor: string) => path === ancestor || path.startsWith(ancestor + "/");

function referencesFor(root: SubProgramRecord, target: RawSubProgramEntry): SubProgramDeleteReference[] {
  const entries = collectRawSubPrograms(root);
  const removed = [target, ...entries.filter((entry) => entry.owned && under(entry.path, target.path) && entry.path !== target.path)];
  const names = removed.map(({ row, path }) => ({ id: subProgramText(row.id),
    name: subProgramText(row.name) || subProgramText(row.id), path }));
  const references: SubProgramDeleteReference[] = [];
  const visit = (program: SubProgramRecord, programPath: string): void => {
    const steps = (values: unknown, path: string): void => {
      subProgramRows(values).forEach((step, index) => {
        const stepPath = path + "/" + index;
        const call = readStepInputsForRunner(step, "sys:subprogram");
        const shown = readStepInputsForRunner(step, "sys:showText");
        const callParams = call ? expandWireInputParams(call) : undefined;
        const callValue = callParams?.subProgram !== undefined ? callParams.subProgram.value : callParams?.SubProgram?.value;
        const identifier = typeof callValue === "string" ? staticSubProgramIdentifier(callValue) : undefined;
        const operations = shown ? expandWireInputParams(shown).operations?.value : undefined;
        for (const name of names) {
          // Keep the native self-reference refusal. References to removed descendants only
          // matter outside the removed subtree; its internal bodies disappear together.
          if (name.path !== target.path && under(programPath, target.path)) continue;
          if (identifier !== undefined && folded(identifier) === folded(name.name)) {
            references.push(Object.freeze({ path: stepPath, targetId: name.id, kind: "subprogram" }));
          }
          if (typeof operations === "string" && folded(operations).includes(folded("$sp$" + name.name))) {
            references.push(Object.freeze({ path: stepPath, targetId: name.id, kind: "show_text" }));
          }
        }
        for (const branch of ["ifSteps", "IfSteps", "elseSteps", "ElseSteps"]) steps(step[branch], stepPath + "/" + branch);
      });
    };
    steps(program.steps, programPath + "/steps");
    subProgramRows(program.subPrograms).forEach((row, index) => visit(row, programPath + "/subPrograms/" + index));
  };
  // Foreign cache bodies are inspected only for conservative stored usage, never edited.
  visit(root, "");
  return references;
}

/** Read-only preparation. The caller owns the confirmation UI and must flush drafts first. */
export function prepareProgramDocumentSubProgramDelete(session: ProgramDocumentSession, id: string): PrepareSubProgramDeleteResult {
  try {
    const root = rootOf(session);
    const target = requireTarget(root, id);
    const references = Object.freeze(referencesFor(root, target));
    const removedIds = Object.freeze(collectRawSubPrograms(root).filter((entry) => entry.owned && under(entry.path, target.path))
      .map(({ row }) => subProgramText(row.id)));
    const preview = Object.freeze({ revision: session.getState().revision, identity: session.getState().identity,
      id: subProgramText(target.row.id), name: subProgramText(target.row.name) || subProgramText(target.row.id),
      targetFingerprint: programDocumentFingerprint(target.row), removedIds, canDelete: references.length === 0, references,
      referenceBoundary: "stored-values-and-show-text-operations" as const });
    previewOwners.set(preview, session);
    return { ok: true, preview };
  } catch (error) {
    return reject(session, "invalid_document", error instanceof Error ? error.message : String(error));
  }
}

/** Commit after confirmation using its exact identity/revision; this function never prompts or calls a host. */
export function deleteProgramDocumentSubProgram(session: ProgramDocumentSession, preview: PreparedSubProgramDelete,
  options: SubProgramDocumentEditOptions): ProgramDocumentEditResult {
  if (!preview || options.expectedRevision !== preview.revision) return reject(session, "revision_conflict", "Deletion confirmation belongs to a different document revision");
  if (previewOwners.get(preview) !== session) return reject(session, "identity_conflict", "Deletion confirmation does not belong to this document session");
  if (!options.expectedIdentity || programDocumentFingerprint(options.expectedIdentity) !== programDocumentFingerprint(preview.identity)) {
    return reject(session, "identity_conflict", "Deletion confirmation belongs to a different document identity");
  }
  return session.transact({ ...options, update: (root) => {
    const target = requireTarget(root, preview.id);
    if (programDocumentFingerprint(target.row) !== preview.targetFingerprint) throw new Error("Subprogram changed after deletion was prepared");
    if (referencesFor(root, target).length) throw new Error("Subprogram is used in this document and cannot be deleted");
    const rows = subProgramRows(target.parent.subPrograms);
    rows.splice(target.index, 1);
    target.parent.subPrograms = rows;
  } });
}
