import type { ProgramDocumentEditResult, ProgramDocumentSession } from "../document/programDocumentSession";
import type { ActionSubProgram } from "../types/common";
import type { ActionProgramSnapshot } from "./assembleActionProgramSnapshot";
import { cloneXProgramPresent, type XProgramPresent } from "./xProgramHistory";

export type XProgramEditorControl = {
  getPresent(): XProgramPresent;
  commit(present: XProgramPresent): void;
};

/** Surface adapters contain no present or history; every read and edit belongs to the session. */
export function createProgramDocumentEditorController(
  session: ProgramDocumentSession,
  options: { isCurrent(): boolean; onChange(result: ProgramDocumentEditResult): void },
) {
  const controls = new Map<string, XProgramEditorControl>();
  const findSurface = (snapshot: ActionProgramSnapshot, surface: string): XProgramPresent => {
    if (surface === "main") return snapshot;
    const id = surface.replace(/^sub-/, "");
    const find = (rows: ActionSubProgram[]): ActionSubProgram | undefined => {
      for (const row of rows) {
        if (row.id === id) return row;
        const nested = find(row.subPrograms);
        if (nested) return nested;
      }
    };
    const row = find(snapshot.subPrograms);
    if (!row) throw new Error("The program surface no longer exists in this document");
    return row;
  };
  const editOptions = () => ({ expectedRevision: session.getState().revision,
    expectedIdentity: session.getState().identity, source: "ui" as const });
  return {
    getSnapshot: () => session.readSnapshot(),
    getHistoryState: () => session.getHistoryState(),
    getSurface(surface: string): XProgramEditorControl {
      let control = controls.get(surface);
      if (!control) {
        control = {
          getPresent: () => cloneXProgramPresent(findSurface(session.readSnapshot(), surface)),
          commit: (present) => {
            if (!options.isCurrent()) return;
            const snapshot = session.readSnapshot();
            const body = findSurface(snapshot, surface);
            Object.assign(body, cloneXProgramPresent(present));
            if (surface !== "main") Object.assign(body, { stepCount: body.steps.length, variableCount: body.variables.length });
            options.onChange(session.applySnapshot(snapshot, editOptions()));
          },
        };
        controls.set(surface, control);
      }
      return control;
    },
    undo: () => { if (options.isCurrent()) options.onChange(session.undo(editOptions())); },
    redo: () => { if (options.isCurrent()) options.onChange(session.redo(editOptions())); },
  };
}

export type ProgramDocumentEditorController = ReturnType<typeof createProgramDocumentEditorController>;
