import assert from "node:assert/strict";
import test from "node:test";
import { resolveProgramDocumentStepPin } from "./programDocumentStepPin";
import { computeNestedProgramStepDiskSlice, hashProgramStepContent } from "./stepDiskSlice";
import { createProgramDocumentSession } from "../document/programDocumentSession";
import { createProgramDocumentEditorController } from "./programDocumentEditorController";
import { createProgramDocumentLiveEndpoint } from "./liveProgramDocumentEndpoint";
import { createLiveProgramDocumentRegistry } from "../../live-program-document-registry";
import { createProgramStepTag, programStepDisplayTitle } from "../../program-step-tag";
import type { LiveProgramDocumentScope } from "../../live-program-document";
import { workspaceDocumentKey } from "../../workspace-document-instances";

const step = (stepId: string, extra = {}) => ({ stepId, stepRunnerKey: "sys:notify", note: stepId,
  inputParams: { msg: "before" }, outputParams: { errMessage: "result" }, ...extra });
const program = (id: string, steps: unknown[], subPrograms: unknown[] = [], kind: unknown = 1) => ({ id, name: id, kind, steps, variables: [], subPrograms });
const document = () => ({ steps: [step("main", { ifSteps: [step("main-if", { elseSteps: [step("main-deep")] })] })], variables: [], subPrograms: [
  program("remote", [step("cached")], [program("foreign-child", [step("foreign-descendant")])], 2),
  program("outer", [step("outer-step")], [program("inner", [step("branch", { ifSteps: [step("inner-if")], elseSteps: [step("nested")] })])]),
] });

test("main pin paths retain the existing root/if/else convention", () => {
  const content = JSON.stringify(document());
  for (const [id, path] of [["main", "0"], ["main-if", "0/if/0"], ["main-deep", "0/if/0/else/0"]]) {
    const result = resolveProgramDocumentStepPin(content, id!);
    assert.equal(result.ok, true);
    if (result.ok) { assert.equal(result.slice.nodePath, path); assert.equal(JSON.parse(result.slice.content).stepId, id); }
  }
});

test("recursive owned pins use exact root document indices and preserve lossless source slices", () => {
  const content = JSON.stringify(document(), null, 2).replace('"note": "nested"',
    '"note": "nested", "future": 9007199254740993, "decimal": 0.12345678901234567890123456789');
  const result = resolveProgramDocumentStepPin(content, "nested");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.slice.nodePath, "subPrograms/1/subPrograms/0/steps/0/elseSteps/0");
  assert.match(result.slice.content, /9007199254740993/); assert.match(result.slice.content, /0\.12345678901234567890123456789/);
  assert.equal(result.slice.contentHash, hashProgramStepContent(result.slice.content));
  assert.equal(content.split("\n").slice(result.slice.startLine - 1, result.slice.endLine).join("\n").trim(), result.slice.content.trim());
  assert.equal(result.stepRunnerKey, "sys:notify"); assert.equal(result.note, "nested");
});

test("missing/unspecified native internal kind is owned, while foreign ancestors never are", () => {
  for (const kind of [undefined, 0, 1]) {
    const row = program("internal", [step("selected")], [], kind);
    if (kind === undefined) delete row.kind;
    const content = JSON.stringify({ subPrograms: [row] });
    assert.equal(resolveProgramDocumentStepPin(content, "selected").ok, true);
  }
  for (const id of ["cached", "foreign-descendant"]) {
    const result = resolveProgramDocumentStepPin(JSON.stringify(document()), id);
    assert.equal(result.ok, false); if (!result.ok) assert.match(result.error, /拥有的内部子程序/);
  }
});

test("paths follow the current body after reordering, and nested chip titles do not invent a root steps prefix", () => {
  const body = document(); body.subPrograms.unshift(program("new", []));
  const result = resolveProgramDocumentStepPin(JSON.stringify(body), "nested");
  assert.equal(result.ok, true); if (!result.ok) return;
  assert.equal(result.slice.nodePath, "subPrograms/2/subPrograms/0/steps/0/elseSteps/0");
  assert.equal(JSON.parse(result.slice.content).stepId, "nested");
  assert.equal(programStepDisplayTitle({ stepRunnerKey: "sys:notify", nodePath: result.slice.nodePath }), `sys:notify · [${result.slice.nodePath}]`);
  assert.equal(programStepDisplayTitle({ stepRunnerKey: "sys:notify", nodePath: "0/if/1" }), "sys:notify · [steps/0/if/1]");
});

test("duplicates anywhere in main/branches/owned or foreign caches fail before producing a pin", () => {
  for (const duplicate of ["main", "main-if", "outer-step", "cached", "foreign-descendant"]) {
    const body = document(); body.steps.push(step(duplicate));
    const result = resolveProgramDocumentStepPin(JSON.stringify(body), duplicate);
    assert.equal(result.ok, false); if (!result.ok) assert.match(result.error, /不唯一/);
  }
});

test("deleted, different-document and malformed identities never resolve by an old path", () => {
  const body = document(); assert.equal(resolveProgramDocumentStepPin(JSON.stringify(body), "nested").ok, true);
  body.subPrograms.splice(1, 1);
  const missing = resolveProgramDocumentStepPin(JSON.stringify(body), "nested");
  assert.equal(missing.ok, false); if (!missing.ok) assert.match(missing.error, /未找到/);
  assert.equal(resolveProgramDocumentStepPin(JSON.stringify({ steps: [step("other")] }), "nested").ok, false);
  assert.equal(resolveProgramDocumentStepPin(JSON.stringify({ steps: [step("target", { StepId: "alias" })] }), "target").ok, false);
  assert.equal(resolveProgramDocumentStepPin(JSON.stringify({ steps: [step("target")] }), " target").ok, false);
});

test("invalid array rows cannot silently compact the wire index", () => {
  for (const body of [
    { steps: [null, step("target")] },
    { subPrograms: [null, program("internal", [step("target")])] },
    { subPrograms: [program("internal", [{ ...step("target"), ifSteps: ["opaque"] }])] },
  ]) assert.equal(resolveProgramDocumentStepPin(JSON.stringify(body), "target").ok, false);
});

test("a duplicate collection key cannot substitute an earlier stale wire slice for the current step", () => {
  const first = JSON.stringify([program("old", [step("selected", { note: "stale first property" })])]);
  const last = JSON.stringify([program("new", [step("selected", { note: "current final property" })])]);
  const result = resolveProgramDocumentStepPin(`{"steps":[],"subPrograms":${first},"subPrograms":${last}}`, "selected");
  assert.equal(result.ok, false); if (!result.ok) assert.match(result.error, /切片与当前文档不一致/);
});

test("nested slice traversal rejects non-step paths and out of range/non-object values", () => {
  const content = JSON.stringify(document());
  for (const path of ["steps/0", "subPrograms/1", "subPrograms/-1/steps/0", "subPrograms/1/variables/0",
    "subPrograms/999/steps/0", "subPrograms/1/steps/0/ifSteps/999", "subPrograms/9007199254740993/steps/0"]) {
    assert.equal(computeNestedProgramStepDiskSlice(content, path).ok, false, path);
  }
  assert.equal(computeNestedProgramStepDiskSlice('{"subPrograms":[{"steps":["not an object"]}]}', "subPrograms/0/steps/0").ok, false);
});

function liveFixture() {
  const owner = { cwd: "C:/nested-fixture", path: ".quicker/actions/root/data.json", tabId: "file:root", instanceId: 1,
    key: workspaceDocumentKey("C:/nested-fixture", "file:root") };
  const session = createProgramDocumentSession({ content: JSON.stringify(document()).replace('"note":"nested"',
    '"note":"nested","future":9007199254740993,"decimal":0.12345678901234567890123456789'), identity: { documentKey: "root", projectBinding: null } });
  let current = true, blocked = false, pending = "";
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => current, onChange() {} });
  const surface = () => controller.getSurface("sub-inner");
  const flushPendingEdits = () => {
    if (!pending) return;
    const present = surface().getPresent(); present.steps[0]!.elseSteps[0]!.note = pending; pending = ""; surface().commit(present);
  };
  const endpoint = createProgramDocumentLiveEndpoint({ owner, sessionId: "root-session", session, controller, isCurrent: () => current,
    flushPendingEdits, isLiveEditingBlocked: () => blocked });
  const registry = createLiveProgramDocumentRegistry({ isOwnerCurrent: () => current }); registry.register(owner, endpoint);
  const pin = () => {
    flushPendingEdits();
    const result = resolveProgramDocumentStepPin(session.getState().content, "nested");
    if (!result.ok) throw Error(result.error);
    const tag = createProgramStepTag({ programTarget: "action", programId: "root", dataJsonPath: owner.path,
      designerStepId: result.stepId, stepRunnerKey: result.stepRunnerKey, ...result.slice });
    const grant = registry.pin(owner, tag.tagId, result.stepId, "chat"); assert.ok("pinId" in grant);
    return { tag, grant };
  };
  const capture = (grant: ReturnType<typeof pin>["grant"]): LiveProgramDocumentScope => {
    assert.ok("pinId" in grant);
    const selection = registry.captureForManualSend({ pins: [grant], cwd: owner.cwd, threadId: "chat", userMessageId: "manual", mode: "edit" });
    if (selection.state !== "ready") throw Error(selection.state);
    return selection.scope;
  };
  return { owner, session, controller, registry, pin, capture, surface, draft(note: string) { pending = note; }, block(value: boolean) { blocked = value; }, close() { current = false; session.close(); } };
}

test("nested pins retain root owner and the same Session across surfaces; one Agent undo keeps human draft", () => {
  const f = liveFixture(); f.draft("unblurred human draft"); const { tag, grant } = f.pin();
  assert.equal(tag.programTarget, "action"); assert.equal(tag.programId, "root"); assert.equal(tag.dataJsonPath, f.owner.path); assert.equal(tag.subProgramId, undefined);
  const scope = f.capture(grant); assert.equal(scope.target.owner.instanceId, f.owner.instanceId); assert.equal(scope.target.identity.documentKey, "root");
  // Looking at a different surface changes neither the private target nor its source.
  f.controller.getSurface("main").getPresent();
  const read = f.registry.execute(scope, { scopeId: scope.scopeId, operationId: "read", input: { action: "read_live" } });
  assert.equal(read.ok, true); if (!read.ok) return;
  assert.ok("content" in read && "revision" in read);
  assert.match(read.content!, /unblurred human draft/);
  const edited = f.registry.execute(scope, { scopeId: scope.scopeId, operationId: "edit", input: {
    action: "edit_live", readOperationId: "read", expectedRevision: read.revision!, stepId: "nested", note: "Agent nested note" } });
  assert.equal(edited.ok, true); assert.equal(edited.persisted, false); assert.equal(f.surface().getPresent().steps[0]!.elseSteps[0]!.note, "Agent nested note");
  f.controller.undo(); assert.equal(f.surface().getPresent().steps[0]!.elseSteps[0]!.note, "unblurred human draft");
  assert.equal(f.controller.getSurface("main").getPresent().steps[0]!.note, "main");
});

test("deleting a pinned subtree or closing the original document denies capture", () => {
  for (const failure of ["deleted", "closed", "duplicate"] as const) {
    const f = liveFixture(), { grant } = f.pin(); assert.ok("pinId" in grant);
    if (failure === "closed") f.close();
    else {
      const snapshot = f.session.readSnapshot();
      if (failure === "deleted") snapshot.subPrograms.splice(1, 1);
      else snapshot.steps.push({ ...snapshot.subPrograms[1]!.subPrograms[0]!.steps[0]!.elseSteps[0]! });
      f.session.applySnapshot(snapshot, { expectedRevision: f.session.getState().revision, source: "ui" });
    }
    const result = f.registry.captureForManualSend({ pins: [grant], cwd: f.owner.cwd, threadId: "chat", userMessageId: failure, mode: "edit" });
    assert.equal(result.state, "unavailable");
  }
});

test("the existing unconfirmed-dialog busy guard still blocks a nested live operation", () => {
  const f = liveFixture(), { grant } = f.pin(), scope = f.capture(grant); f.block(true);
  const before = f.session.getState();
  const read = f.registry.execute(scope, { scopeId: scope.scopeId, operationId: "blocked-read", input: { action: "read_live" } });
  assert.equal(read.ok, false); assert.equal(f.session.getState(), before);
});

test("nested plain-input batches stay in the same controller transaction and preserve one human undo baseline", () => {
  const f = liveFixture();
  const added = f.session.transact({ expectedRevision: f.session.getState().revision, source: "ui", update(body) {
    const programs = body.subPrograms as { subPrograms: { steps: { elseSteps: { inputParams: Record<string, string> }[] }[] }[] }[];
    programs[1]!.subPrograms[0]!.steps[0]!.elseSteps[0]!.inputParams.title = "human title";
  } }); assert.equal(added.ok, true);
  f.draft("human nested draft"); f.pin();
  const before = f.session.getState();
  const result = f.controller.applyAgentStepInputs({ expectedRevision: before.revision, expectedIdentity: before.identity,
    stepId: "nested", expectedRunnerKey: "sys:notify", allowedInputKeys: new Set(["msg", "title"]),
    changes: [{ key: "msg", value: "Agent message" }, { key: "title", value: "Agent title" }] });
  assert.equal(result.ok, true); assert.equal(f.session.getHistoryState().undoDepth, before.history.undoDepth + 1);
  assert.match(f.session.getState().content, /9007199254740993/); assert.match(f.session.getState().content, /0\.12345678901234567890123456789/);
  assert.equal(f.surface().getPresent().steps[0]!.elseSteps[0]!.inputParams.msg!.value, "Agent message");
  assert.equal(f.surface().getPresent().steps[0]!.elseSteps[0]!.inputParams.title!.value, "Agent title");
  f.controller.undo(); assert.equal(f.surface().getPresent().steps[0]!.elseSteps[0]!.note, "human nested draft");
  assert.equal(f.surface().getPresent().steps[0]!.elseSteps[0]!.inputParams.msg!.value, "before");
  assert.equal(f.surface().getPresent().steps[0]!.elseSteps[0]!.inputParams.title!.value, "human title");
});
