import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionStep, ActionSubProgram, ActionVariable } from "../types/common";
import { applySnapshotToPayload, assembleActionProgramSnapshot, liveOverridesFromSnapshot, type ActionProgramSnapshot } from "./assembleActionProgramSnapshot";
import { cloneXProgramPresent, createInitialXProgramHistoryState, xProgramHistoryReducer, type XProgramPresent } from "./xProgramHistory";
import type { XProgramEditorHandle } from "./xProgramEditorHandle";

const step = (id: string) => ActionStep.fromPartial({ stepId: id, stepRunnerKey: `fixture:${id}` });
const variable = (id: string) => ActionVariable.fromPartial({ id, key: id });
const body = (id: string): XProgramPresent => ({ steps: [step(id)], variables: [variable(id)] });
const sub = (id: string): ActionSubProgram => ActionSubProgram.fromPartial({ id, name: id, ...body(id), stepCount: 1, variableCount: 1 });
const payload = (): ActionProgramSnapshot => ({ ...body("main-base"), subPrograms: [sub("child")] });
const handle = (present: XProgramPresent): XProgramEditorHandle => ({ getPresent: () => present, applyProgram: () => {} });

test("snapshot prefers each live editor, then retained override, then payload without mutating inputs", () => {
  const base = payload();
  base.subPrograms.push(sub("retained"), sub("unopened"));
  const editors = new Map([["main", handle(body("main-live"))], ["sub-child", handle(body("child-live"))]]);
  const retained = body("retained-live");
  const snap = assembleActionProgramSnapshot({ payload: base, getEditorForSurface: (id) => editors.get(id) ?? null, liveOverrides: { child: body("stale"), retained } });
  assert.equal(snap.steps[0].stepId, "main-live");
  assert.deepEqual(snap.subPrograms.map((row) => row.steps[0].stepId), ["child-live", "retained-live", "unopened"]);
  snap.subPrograms[0].steps[0].note = "snapshot-only";
  assert.equal(editors.get("sub-child")!.getPresent().steps[0].note, "");
  assert.equal(base.subPrograms[0].steps[0].stepId, "child");
  assert.equal(retained.steps[0].stepId, "retained-live");
});

test("snapshot retains nested rows, external file references and native projection extensions", () => {
  const base = payload();
  const nested = sub("nested");
  nested.steps[0].inputParams.script = { value: "", varKey: "", file: "files/script.cs" };
  Object.assign(nested.variables[0], { defaultValueFile: "files/default.txt" });
  Object.assign(nested, { fixtureUnknown: { preserved: true } });
  base.subPrograms[0].subPrograms = [nested];
  const snap = assembleActionProgramSnapshot({ payload: base });
  assert.equal(snap.subPrograms[0].subPrograms[0].steps[0].inputParams.script.file, "files/script.cs");
  assert.equal((snap.subPrograms[0].subPrograms[0].variables[0] as ActionVariable & { defaultValueFile: string }).defaultValueFile, "files/default.txt");
  assert.deepEqual((snap.subPrograms[0].subPrograms[0] as ActionSubProgram & { fixtureUnknown: unknown }).fixtureUnknown, { preserved: true });
  const edited = assembleActionProgramSnapshot({ payload: base, getEditorForSurface: (id) => id === "sub-nested" ? handle(body("nested-live")) : null });
  assert.equal(edited.subPrograms[0].subPrograms[0].steps[0].stepId, "nested-live");
  assert.equal(nested.steps[0].stepId, "nested");
});

test("unopened summary rows retain counts while an edited body updates its own counts", () => {
  const base = payload();
  base.subPrograms[0] = ActionSubProgram.fromPartial({ id: "linked", kind: 3, stepCount: 42, variableCount: 7 });
  const snap = assembleActionProgramSnapshot({ payload: base });
  assert.equal(snap.subPrograms[0].stepCount, 42);
  assert.equal(snap.subPrograms[0].variableCount, 7);
  const edited = assembleActionProgramSnapshot({ payload: base, liveOverrides: { linked: body("edited") } });
  assert.equal(edited.subPrograms[0].stepCount, 1);
});

test("post-save commit and retained tab overrides use the same snapshot without changing identity", () => {
  const base = { ...payload(), actionId: "fixture-action", version: 8, storageIdentity: { instanceId: "fixture-host" } };
  base.subPrograms[0].subPrograms = [sub("nested")];
  const snap = assembleActionProgramSnapshot({ payload: base, liveOverrides: { child: body("latest"), nested: body("latest-nested") } });
  const committed = applySnapshotToPayload(base, snap);
  const overrides = liveOverridesFromSnapshot(snap, ["sub-child", "nested"]);
  assert.deepEqual(assembleActionProgramSnapshot({ payload: committed, liveOverrides: overrides }), snap);
  assert.equal(committed.actionId, base.actionId);
  assert.equal(committed.version, 8);
  assert.equal(committed.storageIdentity, base.storageIdentity);
  committed.steps[0].note = "committed-only";
  assert.equal(snap.steps[0].note, "");
});

test("snapshot normalizes missing identities consistently and ignores a blank subprogram surface", () => {
  const base = payload();
  base.steps[0].stepId = "";
  base.variables[0].id = "";
  base.subPrograms[0].id = "";
  const queried: string[] = [];
  const snap = assembleActionProgramSnapshot({ payload: base, getEditorForSurface: (id) => { queried.push(id); return null; } });
  assert.ok(snap.steps[0].stepId);
  assert.ok(snap.variables[0].id);
  assert.deepEqual(assembleActionProgramSnapshot({ payload: snap }), snap);
  assert.deepEqual(queried, ["main"]);
  assert.equal(base.steps[0].stepId, "");
});

test("history clones keep file extensions through consecutive commits, undo and redo", () => {
  const initial = body("initial");
  initial.steps[0].inputParams.script = { value: "", varKey: "", file: "files/script.cs" };
  Object.assign(initial.variables[0], { defaultValueFile: "files/default.txt" });
  let state = createInitialXProgramHistoryState(initial);
  state = xProgramHistoryReducer(state, { type: "commitSteps", updater: (steps) => steps.map((s) => ({ ...s, note: "first" })) });
  state = xProgramHistoryReducer(state, { type: "commitVariables", updater: (variables) => variables.map((v) => ({ ...v, desc: "second" })) });
  assert.equal(state.present.steps[0].note, "first");
  assert.equal(state.present.variables[0].desc, "second");
  state = xProgramHistoryReducer(state, { type: "undo" });
  assert.equal(state.present.variables[0].desc, "");
  state = xProgramHistoryReducer(state, { type: "redo" });
  const copy = cloneXProgramPresent(state.present);
  assert.equal(copy.steps[0].inputParams.script.file, "files/script.cs");
  assert.equal((copy.variables[0] as ActionVariable & { defaultValueFile: string }).defaultValueFile, "files/default.txt");
  copy.steps[0].inputParams.script.file = "files/copy-only.cs";
  assert.equal(state.present.steps[0].inputParams.script.file, "files/script.cs");
});
