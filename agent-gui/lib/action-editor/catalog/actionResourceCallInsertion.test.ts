import assert from "node:assert/strict";
import { test } from "node:test";
import { buildResourceCallPayload, requireResourceCallSchema, resourceCallMatchesOrigin } from "./resourceCallInsertion";
import type { DesignerResourceItem } from "./designerResourcePage";
import { createDesignerCatalogPort } from "./designerCatalogPort";
import type { DesignerCatalogContext } from "./designerCatalogContext";
import { mapAgentSchemaToStepRunnerItem } from "../api/stepRunnerSchemaMap";
import catalog from "../data/step-runners-ui-catalog.json";
import { StepRunnerItem } from "../types/action_query";
import { prepareToolboxStep } from "../toolbox/prepareToolboxStep";

const id = "abcdefab-cdef-4abc-8def-abcdefabcdef";
const origin = { documentKey: "source/data.json#sub-child", catalogKey: "full-bound-target", ownerId: "visible-surface:1" };
const item: DesignerResourceItem = { id, title: "Native action title", description: "", icon: "", editVersion: "9223372036854775807",
  actionType: "XAction", callIdentifier: "never-use-an-action-call-alias" };
// This is the checked-in get-ui export, mapped through the SAME production schema adapter.
const schema = mapAgentSchemaToStepRunnerItem(catalog.schemas["sys:runAction"]);

test("native action drops use the runAction StartAction UI definition for every catalog action type", async () => {
  for (const actionType of ["XAction", "RunScript", "RunOrOpen", null, "FutureNativeActionType"]) {
    const payload = buildResourceCallPayload("action", { ...item, actionType }, origin)!;
    assert.equal(resourceCallMatchesOrigin(payload, origin), true);
    assert.equal(payload.stepRunnerKey, "sys:runAction");
    assert.equal(payload.controlFieldValue, "StartAction");
    assert.deepEqual(payload.inputPresets, { actionId: id });
    const step = await prepareToolboxStep(payload, [], () => "new-id", async (key, control) => {
      assert.equal(key, "sys:runAction"); assert.equal(control, "StartAction"); return schema;
    });
    assert.deepEqual(step.inputParams.type, { varKey: "", value: "StartAction" });
    assert.deepEqual(step.inputParams.actionId, { varKey: "", value: id });
    assert.equal(step.note, item.title);
    assert.equal(step.stepId, "new-id");
  }
  for (const resourceId of ["", "Display Name", "%%alias", " " + id, "../data.json"])
    assert.equal(buildResourceCallPayload("action", { ...item, id: resourceId }, origin), null);
});

test("action resource payloads are pinned to the document/surface/owner/binding and reject guessed mappings", () => {
  const payload = buildResourceCallPayload("action", item, origin)!;
  for (const changed of [{ documentKey: "other" }, { catalogKey: "other" }, { ownerId: "hidden-owner" }])
    assert.equal(resourceCallMatchesOrigin(payload, { ...origin, ...changed }), false);
  for (const changed of [{ stepRunnerKey: "sys:subprogram" }, { controlFieldValue: "StartCurrentAction" },
    { inputPresets: { actionId: "other" } }, { inputPresets: { actionId: id, type: "StopAction" } },
    { subProgramIdentifier: "%%guessed" }, { resourceCall: { ...payload.resourceCall!, kind: "global_subprogram" as const } },
    { resourceCall: { ...payload.resourceCall!, callIdentifier: "other" } }])
    assert.equal(resourceCallMatchesOrigin({ ...payload, ...changed }, origin), false);
});

test("action call requires the exact bound UI control and actionId parameter; missing schema never falls back", async () => {
  const payload = buildResourceCallPayload("action", item, origin)!;
  let ids = 0;
  for (const detail of [null, StepRunnerItem.fromPartial({ ...schema, key: "other" }),
    StepRunnerItem.fromPartial({ ...schema, inputParamDefs: schema.inputParamDefs.filter((def) => def.key !== "actionId") }),
    StepRunnerItem.fromPartial({ ...schema, inputParamDefs: schema.inputParamDefs.map((def) => def.isControlField ? { ...def, key: "guessed" } : def) }),
    StepRunnerItem.fromPartial({ ...schema, inputParamDefs: schema.inputParamDefs.map((def) => def.isControlField ? { ...def, selectionItems: [{ value: "StopAction" }] } : def) })]) {
    await assert.rejects(prepareToolboxStep(payload, [schema], () => { ids++; return "unexpected"; }, async () => detail), /未插入步骤/);
  }
  await assert.rejects(prepareToolboxStep(payload, [schema], () => { ids++; return "unexpected"; }, async () => { throw Error("bound schema unavailable"); }), /bound schema unavailable/);
  assert.equal(ids, 0);
  assert.doesNotThrow(() => requireResourceCallSchema(payload, schema));
});

test("local action insertion requires its own V1 catalog scope, independent of XAction body/open capability", () => {
  const scope = (caps: Record<string, boolean>, hostKind: "v1" | "v2" = "v1"): DesignerCatalogContext => ({
    cwd: "C:/fixture", projectDirectory: ".quicker/actions/source", expectedProjectBinding: {
      schemaVersion: 1, kind: "action", actionId: id, hostBinding: { hostInstanceId: "fake", hostSessionId: "a".repeat(32),
        endpoint: `QuickerRpc_User_${"A".repeat(24)}_${"a".repeat(32)}`, protocolVersion: 1, schemaVersion: 1,
        hostKind, quickerVersion: "fixture", capabilities: caps },
    },
  });
  let requests = 0;
  const fetcher: typeof fetch = async () => { requests++; throw Error("Eligibility is not a host operation"); };
  const summariesOnly = createDesignerCatalogPort(scope({ "resource.action.page.read": true }), fetcher);
  assert.equal(summariesOnly.canInsertResourceCall("action"), true);
  assert.equal(summariesOnly.resourceActionOpenAvailable, false);
  assert.equal(summariesOnly.resourceCallInsertAvailable, false);
  const bodyOnly = createDesignerCatalogPort(scope({ "action.legacyBody.read": true }), fetcher);
  assert.equal(bodyOnly.canInsertResourceCall("action"), false);
  for (const context of [undefined, null, scope({ "resource.globalSubprogram.page.read": true }), scope({ "resource.action.page.read": true }, "v2")])
    assert.equal(createDesignerCatalogPort(context, fetcher).canInsertResourceCall("action"), false);
  summariesOnly.dispose(); assert.equal(summariesOnly.canInsertResourceCall("action"), false);
  assert.equal(requests, 0);
});
