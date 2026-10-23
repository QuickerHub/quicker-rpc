import type { ActionStep, ActionSubProgram, ActionVariable } from "../types/common";
import { cloneXProgramPresent, normalizeProgramPresentForEditor, type XProgramPresent } from "./xProgramHistory";
import type { XProgramEditorHandle } from "./xProgramEditorHandle";

/** Editable projection only. The document controller retains the original native wire. */
export type ActionProgramSnapshot = {
  steps: ActionStep[];
  variables: ActionVariable[];
  subPrograms: ActionSubProgram[];
};

export type AssembleActionProgramSnapshotArgs = {
  payload: ActionProgramSnapshot;
  getEditorForSurface?: (surface: string) => XProgramEditorHandle | null;
  liveOverrides?: Record<string, XProgramPresent>;
};

function resolveSubProgramRow(row: ActionSubProgram, args: AssembleActionProgramSnapshotArgs): ActionSubProgram {
  const cloned = structuredClone(row);
  const id = row.id?.trim();
  const editor = id ? args.getEditorForSurface?.(`sub-${id}`) : null;
  const override = id ? args.liveOverrides?.[id] : null;
  const body = normalizeProgramPresentForEditor(editor?.getPresent() ?? override ?? row);
  cloned.steps = body.steps;
  cloned.variables = body.variables;
  if (editor || override) {
    cloned.stepCount = body.steps.length;
    cloned.variableCount = body.variables.length;
  }
  // Nested rows remain intact; their own registered surfaces use the same assembly path.
  cloned.subPrograms = (row.subPrograms ?? []).map((child) => resolveSubProgramRow(child, args));
  return cloned;
}

/** One assembly path for dirty, save and post-save baselines: editor → override → payload. */
export function assembleActionProgramSnapshot(args: AssembleActionProgramSnapshotArgs): ActionProgramSnapshot {
  const main = normalizeProgramPresentForEditor(args.getEditorForSurface?.("main")?.getPresent() ?? args.payload);
  return {
    ...main,
    subPrograms: (args.payload.subPrograms ?? []).map((row) => resolveSubProgramRow(row, args)),
  };
}

export function applySnapshotToPayload<T extends ActionProgramSnapshot>(payload: T, snapshot: ActionProgramSnapshot): T {
  return { ...payload, ...structuredClone(snapshot) };
}

export function liveOverridesFromSnapshot(
  snapshot: ActionProgramSnapshot,
  openSubProgramIds: ReadonlySet<string> | readonly string[],
): Record<string, XProgramPresent> {
  const open = new Set([...openSubProgramIds].map((id) => id.replace(/^sub-/, "").trim()));
  const result: Record<string, XProgramPresent> = {};
  const visit = (rows: ActionSubProgram[]): void => {
    for (const row of rows) {
      const id = row.id?.trim();
      if (id && open.has(id)) result[id] = cloneXProgramPresent(row);
      visit(row.subPrograms ?? []);
    }
  };
  visit(snapshot.subPrograms);
  return result;
}
