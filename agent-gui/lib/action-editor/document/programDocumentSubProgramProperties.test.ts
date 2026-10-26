import assert from "node:assert/strict";
import { test } from "node:test";
import { expandWireInputParams } from "../../input-param-wire";
import { parseLosslessJson, stringifyLosslessJson } from "../shared/losslessJson";
import { normalizeProgramWireForDisk } from "../wire/normalizeProgramWireForDisk";
import { createProgramDocumentSession, type ProgramDocumentSession } from "./programDocumentSession";
import { applyProgramDocumentSubProgramProperties } from "./programDocumentSubProgramProperties";

const identity = { documentKey: "fixture/data.json", projectBinding: null };
const call = (input: unknown = "Old", extra: Record<string, unknown> = {}) => ({ stepRunnerKey: "sys:subprogram", inputParams: { subProgram: input }, ...extra });
const create = (body: Record<string, unknown>) => createProgramDocumentSession({ identity, content: stringifyLosslessJson(body) });
const options = (session: ProgramDocumentSession) => ({ expectedRevision: session.getState().revision, expectedIdentity: session.getState().identity, source: "ui" as const });
const rename = (session: ProgramDocumentSession, name: string, id = "target") => applyProgramDocumentSubProgramProperties(session, id, { name, description: "new description", icon: "new icon" }, options(session));
const raw = (session: ProgramDocumentSession): any => parseLosslessJson(session.getState().content);

test("properties and literal calls across every owned body/branch form one lossless undo transaction", () => {
  const body: any = parseLosslessJson('{"future":9223372036854775807,"decimal":0.123456789012345678901,"steps":[],"variables":[{"key":"x","future":1e999}],"subPrograms":[]}');
  body.steps = [call(), { stepRunnerKey: "future:branch", ifSteps: [call({ Value: "Old", future: body.future })], elseSteps: [call("Old")] }];
  body.subPrograms = [{ id: "target", name: "Old", kind: 1, future: body.future, description: "before", icon: "before", variables: [], steps: [call()], subPrograms: [{ id: "nested", name: "Nested", kind: 0, steps: [call()], variables: [] }] }, { id: "other", name: "Other", steps: [call()], variables: [] }];
  const session = create(body);
  const initial = session.getState().content;
  assert.equal(rename(session, " New ").ok, true);
  assert.equal(session.getState().revision, 1);
  assert.equal(session.getHistoryState().undoDepth, 1);
  const next = raw(session);
  assert.equal(next.subPrograms[0].name, "New");
  assert.equal(next.subPrograms[0].description, "new description");
  assert.equal(next.subPrograms[0].icon, "new icon");
  assert.equal(next.steps[0].inputParams.subProgram, "New");
  assert.equal(next.steps[1].ifSteps[0].inputParams.subProgram.Value, "New");
  assert.equal(stringifyLosslessJson(next.steps[1].ifSteps[0].inputParams.subProgram.future), "9223372036854775807");
  assert.equal(next.steps[1].elseSteps[0].inputParams.subProgram, "New");
  assert.equal(next.subPrograms[0].steps[0].inputParams.subProgram, "New");
  assert.equal(next.subPrograms[0].subPrograms[0].steps[0].inputParams.subProgram, "New");
  assert.equal(next.subPrograms[1].steps[0].inputParams.subProgram, "New");
  const saved = session.beginSave(() => session.readSnapshot());
  if (!saved.ok) assert.fail(saved.error);
  const disk = normalizeProgramWireForDisk(saved.ticket.content);
  for (const lexeme of ["9223372036854775807", "0.123456789012345678901", "1e999"]) assert.ok(disk.includes(lexeme));
  assert.equal(JSON.parse(disk).subPrograms[0].name, "New");
  const changed = session.getState().content;
  assert.equal(session.undo(options(session)).ok, true);
  assert.equal(session.getState().content, initial);
  assert.equal(session.redo(options(session)).ok, true);
  assert.equal(session.getState().content, changed);
});

test("dynamic bindings, expressions, external identifiers and cached bodies remain unchanged", () => {
  const untouched = [call({ value: "Old", varKey: "variable", future: true }), call({ value: "Old", file: "files/name.txt" }), call("$=Old"), call('$$Old'), call('%%Old'), call('@@Old'), call('$="Old" + Run()'), call('$=@"Old"'), call('$="Old\u0085"'), call("Old", { stepRunnerKey: "future:subprogram" }), call("Old", { inputParams: { other: "Old" } }), call("Old", { inputParams: { subProgram: "not Old", SubProgram: "Old" } })];
  const linked = { id: "linked", name: "Old", kind: 2, steps: [call()], subPrograms: [{ id: "foreign-child", name: "Old", kind: 1, steps: [call()] }] };
  const template = { id: "template", kind: 3, steps: [call()] };
  const session = create({ steps: untouched, subPrograms: [{ id: "target", name: "Old", steps: [] }, linked, template] });
  assert.equal(rename(session, "New").ok, true);
  assert.deepEqual(raw(session).steps, untouched);
  assert.deepEqual(raw(session).subPrograms.slice(1), [linked, template]);
  const state = session.getState();
  assert.equal(rename(session, "Forbidden", "foreign-child").ok, false);
  assert.equal(session.getState(), state);
});

test("case-sensitive trimmed names, stable unique ids and revision/identity validation reject without edits", () => {
  const session = create({ steps: [call()], subPrograms: [{ id: "target", name: "Old", steps: [] }, { id: "other", name: "Taken", steps: [] }] });
  const state = session.getState();
  for (const name of [" ", "%%global", "@@template", " Taken "]) assert.equal(rename(session, name).ok, false);
  for (const id of ["", "absent"]) assert.equal(rename(session, "New", id).ok, false);
  assert.equal(session.getState(), state);
  assert.equal(rename(session, "taken").ok, true);
  const changed = session.getState();
  const stale = applyProgramDocumentSubProgramProperties(session, "target", { name: "New", description: "", icon: "" }, { ...options(session), expectedRevision: 0 });
  assert.equal(!stale.ok && stale.code, "revision_conflict");
  const foreign = applyProgramDocumentSubProgramProperties(session, "target", { name: "New", description: "", icon: "" }, { ...options(session), expectedIdentity: { documentKey: "foreign" } });
  assert.equal(!foreign.ok && foreign.code, "identity_conflict");
  assert.equal(session.getState(), changed);
  const ambiguous = create({ subPrograms: [{ id: "target", name: "Old" }, { id: "other", name: "Old" }] });
  assert.equal(rename(ambiguous, "New").ok, false);
  const duplicate = create({ subPrograms: [{ id: "target", name: "Old" }, { id: "target", name: "Other" }] });
  assert.equal(rename(duplicate, "New").ok, false);
});

test("typed-prefix names and native expression-prefix names survive disk codec and consecutive rename", () => {
  for (const name of ["@value:Name", "@var:Name", "@file:files/name", "$=literal", "$$literal", '$=quote"\\backslash\nline\u0085NEL\u2028separator\u2029终', '$=\"; Run(); //']) {
    const session = create({ steps: [call(), call({ Value: "Old", future: true }), call("Old", { inputParams: { SubProgram: "Old" } })], subPrograms: [{ id: "target", name: "Old", steps: [call()] }] });
    assert.equal(rename(session, name).ok, true);
    const saved = session.beginSave(() => session.readSnapshot());
    if (!saved.ok) assert.fail(saved.error);
    const disk = JSON.parse(normalizeProgramWireForDisk(saved.ticket.content));
    const value = expandWireInputParams(disk.steps[0].inputParams).subProgram!.value!;
    if (name.startsWith("$")) {
      assert.ok(value.startsWith('$="'));
      for (const newline of ["\n", "\r", "\u0085", "\u2028", "\u2029"]) assert.ok(!value.includes(newline));
      assert.equal(JSON.parse(value.slice(2)), name);
    } else assert.equal(value, name);
    assert.equal(rename(session, "Next").ok, true);
    const next = raw(session);
    assert.equal(next.steps[0].inputParams.subProgram, "Next");
    assert.equal(next.steps[1].inputParams.subProgram.Value, "Next");
    assert.equal(next.steps[2].inputParams.SubProgram, "Next");
    assert.equal(next.subPrograms[0].steps[0].inputParams.subProgram, "Next");
    assert.equal(session.getHistoryState().undoDepth, 2);
  }
});

test("fallback id and numeric enum lexeme work without materializing unknown native fields", () => {
  const session = create(parseLosslessJson('{"steps":[{"stepRunnerKey":"sys:subprogram","inputParams":{"subProgram":"target"}}],"subPrograms":[{"id":"target","kind":1e0,"future":9007199254740993,"steps":[]}]}') as Record<string, unknown>);
  assert.equal(rename(session, "Name").ok, true);
  assert.ok(session.getState().content.includes('"kind": 1e0'));
  assert.ok(session.getState().content.includes("9007199254740993"));
  const state = session.getState();
  assert.equal(rename(session, " Name ").ok && session.getState() === state, true);
  assert.equal(session.getHistoryState().undoDepth, 1);
});

test("binding groups use the effective wire pin without flattening aliases or unrelated inputs", () => {
  const preserved = [
    { subProgram: "Old", "subProgram.var": "dynamic", future: "Old" },
    { subProgram: { Value: "Old", Future: true }, "subProgram.file": "files/name.txt" },
    { subProgram: { value: "Old", VarKey: "dynamic", Future: true } },
    { subProgram: {}, SubProgram: "Old" },
  ];
  const session = create({ steps: [
    ...preserved.map((inputParams) => call("Old", { inputParams })),
    call("Old", { inputParams: { subProgram: "ignored", SubProgram: "Old", extra: { value: "Old", future: true } } }),
    call("Old", { inputParams: { subProgram: { value: "Old", Value: "untouched", future: true }, extra: "Old" } }),
    call("Old", { inputParams: { subProgram: '@value:Old', extra: "Old" } }),
    call("Old", { inputParams: { subProgram: '$="Old"' } }),
  ], subPrograms: [{ id: "target", name: "Old", steps: [] }] });
  assert.equal(rename(session, "@value:New").ok, true);
  const next = raw(session).steps;
  assert.deepEqual(next.slice(0, preserved.length).map((step: any) => step.inputParams), preserved);
  assert.deepEqual(next[4].inputParams, { subProgram: "ignored", SubProgram: "Old", extra: { value: "Old", future: true } });
  assert.deepEqual(next[5].inputParams, { subProgram: { value: "@value:New", Value: "untouched", future: true }, extra: "Old" });
  assert.deepEqual(next[6].inputParams, { subProgram: "@value:@value:New", extra: "Old" });
  assert.deepEqual(next[7].inputParams, { subProgram: "@value:@value:New" });
});

test("accepted short/native step aliases retain their namespace through rename, save, repeated rename and undo", () => {
  const original: any = parseLosslessJson('{"steps":[{"key":"sys:subprogram","inputs":{"subProgram":"Old","future":9223372036854775807},"future":1e999},{"StepRunnerKey":"future:branch","IfSteps":[{"Key":"sys:subprogram","Inputs":{"SubProgram":{"Value":"Old","future":9007199254740993}}}]}],"subPrograms":[{"id":"target","name":"Old","steps":[{"key":"sys:subprogram","inputs":{"subProgram":"Old"}}]}]}');
  const session = create(original);
  const initial = session.getState().content;
  assert.equal(rename(session, "@var:Name").ok, true);
  let next = raw(session);
  assert.equal(next.steps[0].inputs.subProgram, "@value:@var:Name");
  assert.equal(next.steps[0].stepRunnerKey, undefined);
  assert.equal(next.steps[0].inputParams, undefined);
  assert.equal(next.steps[1].IfSteps[0].Inputs.SubProgram.Value, "@var:Name");
  const saved = session.beginSave(() => session.readSnapshot());
  if (!saved.ok) assert.fail(saved.error);
  assert.equal(JSON.parse(normalizeProgramWireForDisk(saved.ticket.content)).steps[0].inputs.subProgram, "@value:@var:Name");
  assert.equal(rename(session, "Next").ok, true);
  next = raw(session);
  assert.equal(next.steps[0].inputs.subProgram, "Next");
  assert.equal(next.steps[1].IfSteps[0].Inputs.SubProgram.Value, "Next");
  assert.equal(next.subPrograms[0].steps[0].inputs.subProgram, "Next");
  for (const lexeme of ["9223372036854775807", "9007199254740993", "1e999"]) assert.ok(session.getState().content.includes(lexeme));
  session.undo(options(session)); session.undo(options(session));
  assert.equal(session.getState().content, initial);
});

test("conflicting or duplicate projected aliases reject before a session can be opened", () => {
  for (const step of [
    { stepRunnerKey: "sys:subprogram", key: "future:other", inputParams: { subProgram: "Old" } },
    { stepRunnerKey: "sys:subprogram", key: "sys:subprogram", inputParams: { subProgram: "Old" } },
    { key: "sys:subprogram", inputParams: { subProgram: "Old" }, inputs: { subProgram: "Other" } },
    { key: "sys:subprogram", inputParams: { subProgram: "Old" }, inputs: { subProgram: "Old" } },
  ]) {
    assert.throws(
      () => create({ steps: [call(), step], subPrograms: [{ id: "target", name: "Old", steps: [] }] }),
      /歧义别名/,
      "competing projected aliases cannot create a Session or its edit history",
    );
  }
});
