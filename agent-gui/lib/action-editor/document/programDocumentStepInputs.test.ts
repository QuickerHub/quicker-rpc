import assert from "node:assert/strict";
import { test } from "node:test";
import { expandWireInputParams } from "../../input-param-wire";
import { parseLosslessJson, stringifyLosslessJson } from "../shared/losslessJson";
import { createProgramDocumentSession, type ProgramDocumentIdentity, type ProgramDocumentSession } from "./programDocumentSession";
import { applyProgramDocumentStepInputs, inspectProgramDocumentStepInputs, MAX_STEP_INPUT_CHANGES, MAX_STEP_INPUT_VALUE_LENGTH,
  type ProgramDocumentStepInputsRequest } from "./programDocumentStepInputs";

const identity: ProgramDocumentIdentity = { documentKey: "native-action", host: { kind: "v1", instanceId: "original", actionId: "action", version: "1" }, projectBinding: null };
const step = (stepId = "selected", inputParams: Record<string, unknown> = { text: "before", second: "second" }) => ({
  stepId, stepRunnerKey: "fixture:exactRunner", inputParams, note: "human note", outputParams: { answer: "human-output" },
  future: { retained: true }, ifSteps: [], elseSteps: [],
});
const create = (body: Record<string, unknown> = { steps: [step()], variables: [] }) =>
  createProgramDocumentSession({ identity, content: stringifyLosslessJson(body) });
const raw = (session: ProgramDocumentSession): any => parseLosslessJson(session.getState().content);
const request = (session: ProgramDocumentSession, changes = [{ key: "text", value: "after" }]): ProgramDocumentStepInputsRequest => ({
  expectedRevision: session.getState().revision, expectedIdentity: session.getState().identity,
  stepId: "selected", expectedRunnerKey: "fixture:exactRunner", changes, allowedInputKeys: new Set(["text", "second"]),
});
function rejected(session: ProgramDocumentSession, input: ProgramDocumentStepInputsRequest): void {
  const before = session.getState(), history = session.getHistoryState();
  const result = applyProgramDocumentStepInputs(session, input);
  assert.equal(result.ok, false);
  assert.equal(session.getState(), before, "a rejection retains the exact current state");
  assert.equal(session.getHistoryState(), history, "a rejection retains undo and redo");
}

test("a read inspector distinguishes absent control values from raw bindings without normalizing the document", () => {
  const session = create({ steps: [step("selected", {
    text: "", escaped: "@value:@var:literal", expression: "$=1 + 1", legacy: { Value: "old", VarKey: "", future: 1 },
    whitespace: { value: "not a literal", varKey: " " }, "bound.var": "control", typed: { value: false },
    ambiguous: { value: "camel", Value: "pascal" },
  })] });
  const before = session.getState(), history = session.getHistoryState();
  const inspector = inspectProgramDocumentStepInputs(before.content, "selected", "fixture:exactRunner");
  assert.deepEqual(inspector.readValue("missing"), { kind: "missing" });
  assert.deepEqual(inspector.readValue("text"), { kind: "value", value: "" });
  assert.deepEqual(inspector.readValue("escaped"), { kind: "value", value: "@var:literal" });
  assert.deepEqual(inspector.readValue("legacy"), { kind: "value", value: "old" });
  assert.deepEqual(inspector.readValue("expression"), { kind: "value", value: "$=1 + 1" }, "physical inspection never grants literal semantics");
  for (const key of ["whitespace", "bound", "typed", "ambiguous", "text.var", "text "])
    assert.equal(inspector.readValue(key).kind, "unavailable", key);
  assert.equal(session.getState(), before); assert.equal(session.getHistoryState(), history);
  assert.throws(() => inspectProgramDocumentStepInputs(before.content, "selected", "fixture:otherRunner"));
});

test("an Agent batch uses the existing Session once; one undo retains the latest human draft", () => {
  const session = create({ steps: [step("selected", { text: "before", second: { Value: "second", VarKey: "", File: null, future: { intact: true } } })], variables: [] });
  session.transact({ expectedRevision: 0, expectedIdentity: identity, source: "ui", update(body) {
    (body.steps as ReturnType<typeof step>[])[0]!.note = "human unblurred draft";
  } });
  const human = session.getState().content;
  const baseline = session.getState().baselineContent;
  const result = applyProgramDocumentStepInputs(session, request(session, [{ key: "text", value: "Agent value" }, { key: "second", value: "Agent second" }]));
  assert.ok(result.ok); assert.equal(result.changed, true);
  assert.equal(result.state.revision, 2); assert.equal(result.state.lastChangeSource, "agent");
  assert.equal(result.state.dirty, true); assert.equal(result.state.baselineContent, baseline);
  assert.equal(session.getHistoryState().undoDepth, 2);
  assert.equal(raw(session).steps[0].inputParams.text, "Agent value");
  assert.deepEqual(raw(session).steps[0].inputParams.second, { Value: "Agent second", VarKey: "", File: null, future: { intact: true } });
  assert.equal(raw(session).steps[0].note, "human unblurred draft");
  assert.deepEqual(raw(session).steps[0].outputParams, { answer: "human-output" });
  const committed = session.getState().content;
  session.undo({ expectedRevision: 2, expectedIdentity: identity, source: "ui" });
  assert.equal(session.getState().content, human);
  session.redo({ expectedRevision: 3, expectedIdentity: identity, source: "ui" });
  assert.equal(session.getState().content, committed);
});

test("empty and semantically unchanged changes preserve raw encodings and create no history", () => {
  const session = create({ steps: [step("selected", { text: "@value:before", second: { Value: "second", varKey: "", file: "" } })], variables: [] });
  const before = session.getState();
  for (const changes of [[], [{ key: "text", value: "before" }], [{ key: "second", value: "second" }]]) {
    const result = applyProgramDocumentStepInputs(session, request(session, changes));
    assert.ok(result.ok); assert.equal(result.changed, false); assert.equal(result.state, before);
  }
  assert.equal(session.getHistoryState().undoDepth, 0);
});

test("the same raw locator edits main branches and recursively owned subprogram branches", () => {
  const body = { steps: [step("main"), { ...step("parent"), ifSteps: [step("if")], elseSteps: [step("else")] }], variables: [],
    subPrograms: [{ id: "child", kind: 1, steps: [step("child-step")], variables: [], subPrograms: [
      { id: "nested", steps: [{ ...step("nested-parent"), elseSteps: [step("nested-else")] }], variables: [] },
    ] }] };
  for (const stepId of ["main", "if", "else", "child-step", "nested-else"]) {
    const session = create(body);
    const result = applyProgramDocumentStepInputs(session, { ...request(session), stepId });
    assert.ok(result.ok); assert.equal(result.state.revision, 1);
    assert.equal(result.state.content.match(/"text": "after"/g)?.length, 1);
  }
});

test("foreign cached steps never become editable and participate in whole-document ambiguity", () => {
  for (const body of [
    { steps: [step()], subPrograms: [{ id: "foreign", kind: 2, steps: [step()], variables: [] }] },
    { steps: [], subPrograms: [{ id: "foreign", kind: 2, steps: [], subPrograms: [{ id: "cached", steps: [step()] }] }] },
    { steps: [{ ...step("parent"), ifSteps: [step()], elseSteps: [step()] }] },
    { steps: [step(), step()] }, { steps: [step("other")] },
  ]) {
    const session = create(body); rejected(session, request(session));
  }
});

test("the native runner and input map must match without competing aliases", () => {
  for (const candidate of [
    { ...step(), stepRunnerKey: "fixture:otherRunner" },
    { ...step(), key: "fixture:exactRunner" },
    { ...step(), inputs: { text: "ambiguous" } },
    { ...step(), StepId: "selected" },
  ]) {
    const session = create({ steps: [candidate] }); rejected(session, request(session));
  }
  const session = create({ steps: [{ stepId: "selected", Key: "fixture:exactRunner", Inputs: { text: "legacy" } }] });
  const result = applyProgramDocumentStepInputs(session, request(session));
  assert.ok(result.ok); assert.equal(raw(session).steps[0].Inputs.text, "after");
  assert.equal(raw(session).steps[0].inputParams, undefined);
});

test("an invalid member of a mixed batch cannot partially apply another valid input", () => {
  for (const extra of [{ key: "missing", value: "no addition" }, { key: "second", value: "must not unbind" }]) {
    const session = create({ steps: [step("selected", { text: "before", second: "@var:bound" })] });
    rejected(session, { ...request(session, [{ key: "text", value: "first valid" }, extra]), allowedInputKeys: new Set(["text", "second", "missing"]) });
  }
});

test("a rejected batch and a no-op retain the Session's existing redo branch", () => {
  const session = create();
  session.transact({ expectedRevision: 0, source: "ui", update(body) { body.humanMarker = true; } });
  session.undo({ expectedRevision: 1, expectedIdentity: identity, source: "ui" });
  assert.equal(session.getHistoryState().redoDepth, 1);
  rejected(session, request(session, [{ key: "text", value: "valid" }, { key: "missing", value: "invalid" }]));
  const before = session.getState();
  assert.equal(applyProgramDocumentStepInputs(session, request(session, [{ key: "text", value: "before" }])).ok, true);
  assert.equal(session.getState(), before);
  assert.equal(session.getHistoryState().redoDepth, 1);
});

test("binding suffixes, case aliases and opaque existing values fail without normalization", () => {
  const maps: Record<string, unknown>[] = [
    { text: "before", Text: "ambiguous" }, { text: "before", "text ": "ambiguous" },
    { text: "before", "text.var": "" }, { text: "before", "text.FILE": "" },
    { "text.var": "" }, { "text.file": "" }, { text: "@var:binding" }, { text: "@file:files/code.cs" },
    ...[1, false, null, ["opaque"], {}, { value: 1 }, { Value: null }, { value: "a", Value: "a" }, { VALUE: "a" },
      { value: "a", varKey: "v" }, { value: "a", File: "files/code.cs" }, { value: "a", varKey: 0 },
      { value: "a", file: false }, { value: "a", varKey: "", VarKey: "" }, { value: "a", file: "", File: "" },
      { value: "a", varKey: " " }, { Value: "a", VarKey: "\t" }, { value: "a", file: " " },
      { value: "a", VARKEY: "" }].map((text) => ({ text })),
  ];
  for (const inputParams of maps) {
    const session = create({ steps: [step("selected", inputParams)] }); rejected(session, request(session));
  }
});

test("empty legacy binding placeholders remain intact while their value contributor changes", () => {
  for (const blank of [null, ""]) {
    for (const [valueField, varField, fileField] of [["value", "varKey", "file"], ["Value", "VarKey", "File"]]) {
      const literal = { [valueField!]: "before", [varField!]: blank, [fileField!]: blank, extra: ["unknown"] };
      const session = create({ steps: [step("selected", { text: literal })] });
      assert.equal(applyProgramDocumentStepInputs(session, request(session)).ok, true);
      assert.deepEqual(raw(session).steps[0].inputParams.text, { ...literal, [valueField!]: "after" });
    }
  }
});

test("new literal marker text is encoded by the wire codec without creating a binding", () => {
  for (const value of ["@var:a", "@file:files/a.cs", "@value:literal", "@VAR:a", "", "  exact whitespace  "]) {
    const session = create({ steps: [step("selected", { text: "@value:@var:old-literal" })] });
    assert.equal(applyProgramDocumentStepInputs(session, request(session, [{ key: "text", value }])).ok, true);
    assert.deepEqual(expandWireInputParams(raw(session).steps[0].inputParams).text, { value });
    assert.equal(Object.hasOwn(raw(session).steps[0].inputParams, "text.var"), false);
    const legacy = create({ steps: [step("selected", { text: { Value: "old", future: true } })] });
    assert.equal(applyProgramDocumentStepInputs(legacy, request(legacy, [{ key: "text", value }])).ok, true);
    assert.deepEqual(expandWireInputParams(raw(legacy).steps[0].inputParams).text, { value });
    assert.deepEqual(raw(legacy).steps[0].inputParams.text, { Value: value, future: true });
  }
});

test("raw unknown fields, file references, outputs and opaque numerics survive the transaction and undo", () => {
  const session = create(parseLosslessJson('{"future":9223372036854775807,"fraction":0.123456789012345678901,"steps":[{"stepId":"selected","key":"fixture:exactRunner","note":"human note","inputs":{"text":{"value":"before","varKey":"","file":null,"future":9007199254740993,"fraction":0.123456789012345678901},"script.file":"files/code.cs","other.var":"original","opaque":1e999},"outputParams":{"answer":"human-output"},"future":9007199254740993}],"variables":[{"key":"state","default.file":"files/state.json"}]}') as Record<string, unknown>);
  const before = session.getState().content, native = raw(session);
  assert.equal(applyProgramDocumentStepInputs(session, request(session)).ok, true);
  const next = raw(session);
  assert.equal(next.steps[0].inputs.text.value, "after");
  next.steps[0].inputs.text.value = "before";
  assert.equal(stringifyLosslessJson(next), stringifyLosslessJson(native));
  for (const token of ["9223372036854775807", "9007199254740993", "0.123456789012345678901", "1e999"]) assert.ok(session.getState().content.includes(token));
  session.undo({ expectedRevision: 1, expectedIdentity: identity, source: "ui" });
  assert.equal(session.getState().content, before);
});

test("schema grants are exact; parameters cannot be added, deleted or changed through binding keys", () => {
  const session = create();
  for (const input of [
    { ...request(session), allowedInputKeys: new Set(["Text"]) },
    request(session, [{ key: "text.var", value: "v" }]), request(session, [{ key: "text.file", value: "files/a" }]),
    request(session, [{ key: "missing", value: "new" }]), request(session, [{ key: "text", value: undefined as unknown as string }]),
    request(session, [{ key: "text", value: "a" }, { key: "text", value: "b" }]),
    { ...request(session, [{ key: "text", value: "a" }, { key: "Text", value: "b" }]), allowedInputKeys: new Set(["text", "Text"]) },
  ]) rejected(session, input);
});

test("bounded batch validation rejects excess count, value, key and combined payload", () => {
  const session = create();
  rejected(session, request(session, Array.from({ length: MAX_STEP_INPUT_CHANGES + 1 }, () => ({ key: "text", value: "a" }))));
  rejected(session, request(session, [{ key: "text", value: "a".repeat(MAX_STEP_INPUT_VALUE_LENGTH + 1) }]));
  rejected(session, request(session, [{ key: "text ", value: "a" }]));
  rejected(session, request(session, [{ key: "x".repeat(257), value: "a" }]));
  const changes = Array.from({ length: 12 }, (_, index) => ({ key: `p${index}`, value: "x".repeat(MAX_STEP_INPUT_VALUE_LENGTH) }));
  const large = create({ steps: [step("selected", Object.fromEntries(changes.map(({ key }) => [key, "before"])))] });
  rejected(large, { ...request(large, changes), allowedInputKeys: new Set(changes.map(({ key }) => key)) });
  assert.equal(applyProgramDocumentStepInputs(session, request(session, [{ key: "text", value: "x".repeat(MAX_STEP_INPUT_VALUE_LENGTH) }])).ok, true);
});

test("revision, complete identity and closed-session failures retain the Session's own failure codes", () => {
  const session = create();
  for (const input of [
    { ...request(session), expectedRevision: 1 },
    { ...request(session), expectedIdentity: { ...identity, host: { ...identity.host!, version: "2" } } },
  ]) {
    const result = applyProgramDocumentStepInputs(session, input);
    assert.equal(!result.ok && result.code, input.expectedRevision === 1 ? "revision_conflict" : "identity_conflict");
    assert.equal(session.getState().revision, 0);
  }
  session.close();
  const result = applyProgramDocumentStepInputs(session, request(session));
  assert.equal(!result.ok && result.code, "closed");
});

test("invalid envelopes cannot silently omit the complete identity guard or mutate the document", () => {
  const session = create();
  for (const changed of [{ expectedIdentity: undefined }, { expectedRevision: -1 }, { stepId: " selected " },
    { expectedRunnerKey: "" }, { allowedInputKeys: undefined }, { changes: null }]) {
    rejected(session, { ...request(session), ...changed } as unknown as ProgramDocumentStepInputsRequest);
  }
});
