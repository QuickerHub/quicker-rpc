import type { LiveProgramDocumentEndpoint, LiveProgramDocumentStep } from "../../live-program-document";
import type { WorkspaceDocumentOwner } from "../../workspace-document-instances";
import type { ProgramDocumentSession } from "../document/programDocumentSession";
import type { ActionProgramSnapshot } from "./assembleActionProgramSnapshot";
import type { ProgramDocumentEditorController } from "./programDocumentEditorController";
import type { ActionStep, ActionSubProgram } from "../types/common";
import type { DesignerCatalogPort } from "../catalog/designerCatalogPort";
import { readProgramDocumentVariable, type ProgramDocumentVariableSelector } from "../document/programDocumentVariableLive";
import type { LiveProgramSourceTarget } from "../../live-program-source-target";
import { sourceVariableOrigin, sourceVariableRenameProven } from "../../source-variable-identity";
import { sourceStepOrigin } from "../../source-step-identity";
import { readProgramDocumentLiveStep } from "../document/programDocumentStepLive";

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
  sourceTarget?(): LiveProgramSourceTarget | undefined;
}): LiveProgramDocumentEndpoint {
  let sequence = 0;
  const rows = new Map<string, { selector: ProgramDocumentVariableSelector; token: string; removed: boolean; mappingEpoch?: number }>();
  const stepRows = new Map<string, { surface: string; path: string; documentPath: string; runnerKey: string; token: string; removed: boolean; mappingEpoch?: number }>();
  const rowKey = (selector: ProgramDocumentVariableSelector) => JSON.stringify([selector.surface, selector.variableId]);
  const unsubscribe = options.session.subscribe(state => {
    for (const row of rows.values()) if (!row.removed && !readProgramDocumentVariable(state.content, row.selector).ok) row.removed = true;
    for (const [stepId, row] of stepRows) if (!row.removed) {
      try {
        const next = readProgramDocumentLiveStep(state.content, stepId);
        if (next.surface !== row.surface || next.documentPath !== row.documentPath || next.runnerKey !== row.runnerKey) row.removed = true;
      } catch { row.removed = true; }
    }
  });
  const sourceFor = (selector: ProgramDocumentVariableSelector) => {
    if (!options.sourceTarget) return { ok: true as const, fieldDenials: undefined, mappingEpoch: undefined };
    const source = options.sourceTarget();
    const origin = source && sourceVariableOrigin(source.variableIdentity, selector.surface, selector.variableId);
    if (!source || !origin) return { ok: false as const, code: "LIVE_VARIABLE_ORIGIN_UNAVAILABLE", error: "此源码变量缺少当前 codec 核验的原行来源，请重新打开后核对。" };
    const previous = rows.get(rowKey(selector));
    if (previous?.removed && previous.mappingEpoch === source.mappingEpoch) return { ok: false as const, code: "LIVE_VARIABLE_STALE", error: "原源码变量已经删除，不能把旧来源移交给重建行。" };
    return { ok: true as const, fieldDenials: sourceVariableRenameProven(origin) ? undefined : { key: "当前源码格式尚未证明此变量可以安全改名。" }, mappingEpoch: source.mappingEpoch };
  };
  const readVariable = (selector: ProgramDocumentVariableSelector) => {
    const blocked = unavailable(); if (blocked) return blocked;
    const source = sourceFor(selector); if (!source.ok) return source;
    const result = readProgramDocumentVariable(options.session.getState().content, selector, { fieldDenials: source.fieldDenials });
    if (!result.ok) return result;
    const key = rowKey(selector);
    let row = rows.get(key);
    if (!row || row.removed || row.mappingEpoch !== source.mappingEpoch) {
      row = { selector: { ...selector }, token: `${options.sessionId}:variable:${++sequence}`, removed: false, mappingEpoch: source.mappingEpoch }; rows.set(key, row);
    }
    return { ok: true as const, variable: { ...result.variable, rowIdentity: row.token } };
  };
  const current = () => options.isCurrent() && !options.session.isClosed();
  const failure = () => ({ ok: false as const, code: "LIVE_DOCUMENT_STALE", error: "The original program document is no longer current." });
  const unavailable = () => !current() ? failure() : options.session.getState().saving || options.isLiveEditingBlocked?.()
    ? { ok: false as const, code: "LIVE_DOCUMENT_BUSY", error: "The original program document has an unconfirmed editor dialog; confirm or cancel it before live editing." }
    : undefined;
  const assertAvailable = () => {
    const result = unavailable();
    if (result) throw Object.assign(Error(result.error), { code: result.code });
  };
  const readStep = (stepId: string) => {
    const blocked = unavailable(); if (blocked) return blocked;
    let selected;
    try { selected = readProgramDocumentLiveStep(options.session.getState().content, stepId); }
    catch (error) { return { ok: false as const, code: "LIVE_STEP_UNAVAILABLE", error: error instanceof Error ? error.message : String(error) }; }
    const source = options.sourceTarget?.(), previous = stepRows.get(stepId);
    if (options.sourceTarget) {
      const origin = sourceStepOrigin(source?.stepIdentity, selected.surface, stepId);
      if (!source || !origin || origin.runnerKey !== selected.runnerKey)
        return { ok: false as const, code: "LIVE_STEP_ORIGIN_UNAVAILABLE", error: "此源码步骤缺少当前 codec 核验的原行来源，请重新打开后核对。" };
      if (previous?.removed && previous.mappingEpoch === source.mappingEpoch)
        return { ok: false as const, code: "LIVE_STEP_STALE", error: "原源码步骤已经删除、移动或改变模块，旧来源不能转交给当前行。" };
    }
    let row = previous;
    if (!row || row.removed || row.mappingEpoch !== source?.mappingEpoch) {
      row = { ...selected, token: `${options.sessionId}:step:${++sequence}`, removed: false, mappingEpoch: source?.mappingEpoch };
      stepRows.set(stepId, row);
    }
    return { ok: true as const, step: { stepId, surface: selected.surface, runnerKey: selected.runnerKey, rowIdentity: row.token } };
  };
  return {
    getTarget() {
      if (!current()) return;
      const identity = options.session.getState().identity;
      if (options.sourceTarget) {
        const source = options.sourceTarget();
        if (!source || identity.projectBinding !== undefined || identity.storage?.version !== source.sourceSnapshot.revision) return;
        return { format: "source-bundle" as const, owner: options.owner, sessionId: options.sessionId, identity, source };
      }
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
    readStep,
    ...(options.catalogPort ? { async readInputContract(input: { stepRunnerKey: string; controlFieldValue?: string }, signal?: AbortSignal) {
      assertAvailable();
      const contract = await options.catalogPort!.readInputContract(input, signal);
      signal?.throwIfAborted();
      assertAvailable();
      return contract;
    } } : {}),
    setStepInputs(input) {
      const blocked = unavailable(); if (blocked) return blocked;
      const selected = readStep(input.stepId); if (!selected.ok) return selected;
      const revisionBefore = options.session.getState().revision;
      const result = options.controller.applyAgentStepInputs(input);
      if (!result.ok) return { ok: false, code: result.code, error: result.error, revision: result.state.revision };
      return { ok: true, changed: result.changed, revisionBefore, revisionAfter: result.state.revision, dirty: result.state.dirty };
    },
    setStepNote(input) {
      const blocked = unavailable(); if (blocked) return blocked;
      const selected = readStep(input.stepId); if (!selected.ok) return selected;
      const revisionBefore = options.session.getState().revision;
      const result = options.controller.applyAgentStepNote(input);
      if (!result.ok) return { ok: false, code: result.code, error: result.error, revision: result.state.revision };
      return { ok: true, changed: result.changed, revisionBefore, revisionAfter: result.state.revision, dirty: result.state.dirty };
    },
    readVariable,
    setVariable(input) {
      const selected = readVariable(input); if (!selected.ok) return selected;
      const source = sourceFor(input); if (!source.ok) return source;
      const revisionBefore = options.session.getState().revision;
      const result = options.controller.applyAgentVariableChange({ ...input, fieldDenials: source.fieldDenials });
      if (!result.ok) return { ok: false, code: result.code, error: result.error, revision: result.state.revision };
      return { ok: true, changed: result.changed, revisionBefore, revisionAfter: result.state.revision, dirty: result.state.dirty, changedFields: result.changedFields };
    },
    dispose: unsubscribe,
  };
}
