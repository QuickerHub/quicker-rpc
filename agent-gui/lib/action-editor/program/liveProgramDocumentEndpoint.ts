import type { LiveProgramDocumentEndpoint, LiveProgramDocumentStep } from "../../live-program-document";
import type { WorkspaceDocumentOwner } from "../../workspace-document-instances";
import type { ProgramDocumentSession } from "../document/programDocumentSession";
import type { ActionProgramSnapshot } from "./assembleActionProgramSnapshot";
import type { ProgramDocumentEditorController } from "./programDocumentEditorController";
import type { ActionStep, ActionSubProgram } from "../types/common";
import type { DesignerCatalogPort } from "../catalog/designerCatalogPort";

function collectSteps(snapshot: ActionProgramSnapshot): LiveProgramDocumentStep[] {
  const result: LiveProgramDocumentStep[] = [];
  const steps = (rows: ActionStep[], surface: string): void => { for (const step of rows) {
    result.push({ stepId: step.stepId, surface, runnerKey: step.stepRunnerKey, note: step.note });
    steps(step.ifSteps, surface); steps(step.elseSteps, surface);
  } };
  const program = (row: ActionSubProgram): void => { steps(row.steps, `sub-${row.id}`); for (const sub of row.subPrograms) program(sub); };
  steps(snapshot.steps, "main"); for (const sub of snapshot.subPrograms) program(sub);
  return result;
}

/** Only references the existing APDE controller/session. It allocates no editable state or history. */
export function createProgramDocumentLiveEndpoint(options: {
  owner: WorkspaceDocumentOwner;
  sessionId: string;
  session: ProgramDocumentSession;
  controller: ProgramDocumentEditorController;
  catalogPort?: DesignerCatalogPort;
  isCurrent(): boolean;
  flushPendingEdits(): boolean | void;
  isLiveEditingBlocked?(): boolean;
}): LiveProgramDocumentEndpoint {
  const current = () => options.isCurrent() && !options.session.isClosed();
  const failure = () => ({ ok: false as const, code: "LIVE_DOCUMENT_STALE", error: "The original program document is no longer current." });
  const unavailable = () => !current() ? failure() : options.isLiveEditingBlocked?.()
    ? { ok: false as const, code: "LIVE_DOCUMENT_BUSY", error: "The original program document has an unconfirmed editor dialog; confirm or cancel it before live editing." }
    : undefined;
  const assertAvailable = () => {
    const result = unavailable();
    if (result) throw Object.assign(Error(result.error), { code: result.code });
  };
  return {
    getTarget() {
      if (!current()) return;
      const identity = options.session.getState().identity;
      if (identity.projectBinding === undefined) return;
      return { owner: options.owner, sessionId: options.sessionId, identity: { ...identity, projectBinding: identity.projectBinding } };
    },
    flushPendingEdits() {
      assertAvailable();
      if (options.flushPendingEdits() === false) throw Object.assign(
        Error("The original program document has an unconfirmed variable edit; correct or discard it first."), { code: "LIVE_DOCUMENT_BUSY" });
      assertAvailable();
    },
    read() {
      const blocked = unavailable(); if (blocked) return blocked;
      const state = options.session.getState(), steps = collectSteps(options.session.readSnapshot());
      return { ok: true, snapshot: { revision: state.revision, dirty: state.dirty, content: state.content, steps } };
    },
    ...(options.catalogPort ? { async readInputContract(input: { stepRunnerKey: string; controlFieldValue?: string }, signal?: AbortSignal) {
      assertAvailable();
      const contract = await options.catalogPort!.readInputContract(input, signal);
      signal?.throwIfAborted();
      assertAvailable();
      return contract;
    } } : {}),
    setStepInputs(input) {
      const blocked = unavailable(); if (blocked) return blocked;
      const revisionBefore = options.session.getState().revision;
      const result = options.controller.applyAgentStepInputs(input);
      if (!result.ok) return { ok: false, code: result.code, error: result.error, revision: result.state.revision };
      return { ok: true, changed: result.changed, revisionBefore, revisionAfter: result.state.revision, dirty: result.state.dirty };
    },
    setStepNote(input) {
      const blocked = unavailable(); if (blocked) return blocked;
      const revisionBefore = options.session.getState().revision;
      const result = options.controller.applyAgentStepNote(input);
      if (!result.ok) return { ok: false, code: result.code, error: result.error, revision: result.state.revision };
      return { ok: true, changed: result.changed, revisionBefore, revisionAfter: result.state.revision, dirty: result.state.dirty };
    },
  };
}
