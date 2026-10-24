import type { ProgramDocumentEditResult, ProgramDocumentIdentity, ProgramDocumentSession } from "../document/programDocumentSession";
import { applyProgramDocumentSubProgramProperties, type SubProgramPropertiesPatch } from "../document/programDocumentSubProgramProperties";
import { applyProgramDocumentStepInputs, type ProgramDocumentStepInputsRequest } from "../document/programDocumentStepInputs";
import { createProgramDocumentSubProgram, deleteProgramDocumentSubProgram, prepareProgramDocumentSubProgramDelete,
  type CreateDocumentSubProgramResult, type PreparedSubProgramDelete, type PrepareSubProgramDeleteResult } from "../document/programDocumentSubPrograms";
import type { ActionSubProgram } from "../types/common";
import type { ActionProgramSnapshot } from "./assembleActionProgramSnapshot";
import { cloneXProgramPresent, type XProgramPresent } from "./xProgramHistory";
import { findUniqueOwnedProgramDocumentStep, isSubProgramRecord } from "../document/programDocumentSubProgramModel";
import { parseLosslessJson } from "../shared/losslessJson";

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
    getIdentity: () => session.getState().identity,
    getHistoryState: () => session.getHistoryState(),
    applyAgentStepInputs(input: ProgramDocumentStepInputsRequest): ProgramDocumentEditResult {
      if (!options.isCurrent()) return { ok: false, code: "identity_conflict", error: "The original program document is no longer current.", state: session.getState() };
      const result = applyProgramDocumentStepInputs(session, input);
      options.onChange(result);
      return result;
    },
    applyAgentStepNote(input: { expectedRevision: number; expectedIdentity: ProgramDocumentIdentity; stepId: string; note: string }): ProgramDocumentEditResult {
      const reject = (error: string): ProgramDocumentEditResult => ({ ok: false, code: "identity_conflict", error, state: session.getState() });
      if (!options.isCurrent()) return reject("The original program document is no longer current.");
      try {
        const body: unknown = parseLosslessJson(session.getState().content);
        if (!isSubProgramRecord(body)) return reject("The program document root is not an object.");
        findUniqueOwnedProgramDocumentStep(body, input.stepId);
      } catch (error) {
        return reject(error instanceof Error ? error.message : String(error));
      }
      const snapshot = session.readSnapshot();
      let matches = 0;
      const steps = (rows: typeof snapshot.steps): void => { for (const step of rows) {
        if (step.stepId === input.stepId) { matches++; step.note = input.note; }
        steps(step.ifSteps); steps(step.elseSteps);
      } };
      const programs = (body: ActionProgramSnapshot | ActionSubProgram): void => { steps(body.steps); for (const sub of body.subPrograms) programs(sub); };
      programs(snapshot);
      if (!input.stepId || matches !== 1) return reject("The selected step is missing or ambiguous in the original program document.");
      const result = session.applySnapshot(snapshot, { expectedRevision: input.expectedRevision, expectedIdentity: input.expectedIdentity, source: "agent" });
      options.onChange(result);
      return result;
    },
    createSubProgram(input: { id: string; suggestedName?: string }, expectedIdentity: ProgramDocumentIdentity): CreateDocumentSubProgramResult {
      if (!options.isCurrent()) return { ok: false, code: "identity_conflict", error: "文档已经切换，无法新建子程序", state: session.getState() };
      const result = createProgramDocumentSubProgram(session, input, { ...editOptions(), expectedIdentity });
      options.onChange(result);
      return result;
    },
    prepareSubProgramDelete(id: string): PrepareSubProgramDeleteResult {
      if (!options.isCurrent()) return { ok: false, code: "identity_conflict", error: "文档已经切换，无法准备删除子程序", state: session.getState() };
      return prepareProgramDocumentSubProgramDelete(session, id);
    },
    deleteSubProgram(preview: PreparedSubProgramDelete): ProgramDocumentEditResult {
      if (!options.isCurrent()) return { ok: false, code: "identity_conflict", error: "文档已经切换，请重新核对删除目标", state: session.getState() };
      const result = deleteProgramDocumentSubProgram(session, preview, {
        source: "ui", expectedRevision: preview.revision, expectedIdentity: preview.identity,
      });
      options.onChange(result);
      return result;
    },
    applySubProgramProperties(id: string, patch: SubProgramPropertiesPatch, expected: { identity: ProgramDocumentIdentity; properties: SubProgramPropertiesPatch }): ProgramDocumentEditResult {
      const reject = (error: string): ProgramDocumentEditResult => ({ ok: false, code: "identity_conflict", error, state: session.getState() });
      if (!options.isCurrent()) return reject("文档已经切换，请在当前文档重新打开属性");
      let row: ActionSubProgram;
      try { row = findSurface(session.readSnapshot(), `sub-${id}`) as ActionSubProgram; }
      catch { return reject("子程序已经不存在，请保留草稿并重新核对当前文档"); }
      if (row.name !== expected.properties.name || row.description !== expected.properties.description || row.icon !== expected.properties.icon) {
        return reject("子程序属性已经改变，请保留草稿并重新核对当前属性");
      }
      const result = applyProgramDocumentSubProgramProperties(session, id, patch, { ...editOptions(), expectedIdentity: expected.identity });
      options.onChange(result);
      return result;
    },
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
