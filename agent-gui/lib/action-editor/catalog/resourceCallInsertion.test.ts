import assert from "node:assert/strict";
import { test } from "node:test";
import { buildResourceCallPayload, resourceCallMatchesOrigin } from "./resourceCallInsertion";
import type { DesignerResourceItem } from "./designerResourcePage";
import { StepRunnerItem } from "../types/action_query";
import { prepareToolboxStep } from "../toolbox/prepareToolboxStep";

const origin = { documentKey: "cwd/source/data.json#sub-child", catalogKey: "complete-binding", ownerId: "visible-instance:1" };
const item: DesignerResourceItem = { id: "native-id", title: "Display name", description: "", icon: "", editVersion: "9223372036854775807",
  actionType: null, callIdentifier: "%%native-call-identifier" };
const schema = StepRunnerItem.fromPartial({ key: "sys:subprogram", inputParamDefs: [{ key: "subProgram", varType: 0, isRequired: true }] });

test("global resource calls use the native identifier verbatim and do not invent action or missing-identifier mappings", () => {
  const payload = buildResourceCallPayload("global_subprogram", { ...item, callIdentifier: " %%native-value " }, origin)!;
  assert.equal(payload.stepRunnerKey, "sys:subprogram");
  assert.deepEqual(payload.inputPresets, { subProgram: " %%native-value " });
  assert.equal(payload.controlFieldValue, undefined); assert.equal(payload.subProgramIdentifier, undefined);
  assert.deepEqual(payload.resourceCall, { ...origin, resourceId: item.id, callIdentifier: " %%native-value " });
  for (const kind of [null, "", "   "]) assert.equal(buildResourceCallPayload("global_subprogram", { ...item, callIdentifier: kind }, origin), null);
  assert.equal(buildResourceCallPayload("action", item, origin), null);
  assert.equal(buildResourceCallPayload("global_subprogram", item, { ...origin, ownerId: "" }), null);
});

test("drag and explicit insertion require the same document, surface, catalog binding and visible owner", () => {
  const payload = buildResourceCallPayload("global_subprogram", item, origin)!;
  assert.equal(resourceCallMatchesOrigin(JSON.parse(JSON.stringify(payload)), { ...origin }), true);
  for (const other of [undefined, { ...origin, documentKey: "other" }, { ...origin, documentKey: "cwd/source/data.json" },
    { ...origin, catalogKey: "other-complete-binding" }, { ...origin, ownerId: "visible-instance:2" }])
    assert.equal(resourceCallMatchesOrigin(payload, other), false);
  for (const changed of [{ stepRunnerKey: "sys:runAction" }, { controlFieldValue: "guessed" }, { subProgramIdentifier: "guessed" },
    { inputPresets: { subProgram: "%%other" } }, { inputPresets: { subProgram: item.callIdentifier!, extra: "guessed" } }])
    assert.equal(resourceCallMatchesOrigin({ ...payload, ...changed }, origin), false);
});

test("resource preparation requires the exact bound sys:subprogram UI definition before constructing a step", async () => {
  const payload = buildResourceCallPayload("global_subprogram", item, origin)!;
  let ids = 0, requests = 0;
  const step = await prepareToolboxStep(payload, [], () => { ids++; return "new-step"; }, async (key, control) => {
    requests++; assert.equal(key, "sys:subprogram"); assert.equal(control, undefined); return schema;
  });
  assert.equal(step.stepId, "new-step"); assert.deepEqual(step.inputParams.subProgram, { varKey: "", value: item.callIdentifier });
  assert.equal(requests, 1); assert.equal(ids, 1);
  for (const missing of [null, StepRunnerItem.fromPartial({ key: "other", inputParamDefs: schema.inputParamDefs }),
    StepRunnerItem.fromPartial({ key: "sys:subprogram", inputParamDefs: [{ key: "guessed" }] }),
    StepRunnerItem.fromPartial({ key: "sys:subprogram", inputParamDefs: [...schema.inputParamDefs, { key: "mode", isControlField: true }] })])
    await assert.rejects(prepareToolboxStep(payload, [schema], () => { ids++; return "wrong"; }, async () => missing), /未插入步骤/);
  await assert.rejects(prepareToolboxStep(payload, [schema], () => { ids++; return "wrong"; }, async () => { throw Error("bound host unavailable"); }), /bound host unavailable/);
  assert.equal(ids, 1, "a missing or failed bound schema never falls back to a cached guessed step");
});
