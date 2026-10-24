import assert from "node:assert/strict";
import { test } from "node:test";
// The popup projects native common outputs from the same mapped catalog before parameter editing.
import "../steps/paramEditors/ensureErrorMessageOutputParam.test";
import { StepRunnerItem } from "../types/action_query";
import { mapAgentSchemaToStepRunnerItem, mapSearchItemToStepRunnerItem } from "../api/stepRunnerSchemaMap";
import { fetchToolboxModuleSearch } from "../steps/stepQuickInsertApi";
import { buildStepFromRunner } from "../steps/toolboxStepFactory";
import { buildToolboxTabs, toolboxNodeInCategory } from "./toolboxCategories";
import { bestToolboxSearchInsertPayload, buildToolboxSearchTreeMeta } from "./toolboxSearchTree";
import { createToolboxInsertionRegistry } from "./toolboxInsertionRegistry";
import { prepareToolboxStep } from "./prepareToolboxStep";
import { compactActionStepParams } from "../steps/actionStepSerialization";
import { parseProgramDocumentSnapshot, serializeProgramDocumentSnapshot } from "../document/programDocumentWire";

const schema = StepRunnerItem.fromPartial({ key: "sys:fixture", inputParamDefs: [{ key: "mode", isControlField: true }] });

test("catalog mapping survives both server and browser projection; old hosts only get the all tab", () => {
  const row = mapSearchItemToStepRunnerItem(mapSearchItemToStepRunnerItem({
    key: "sys:fixture", name: "Fixture", category: "Text", secondaryCategories: ["System"], keywords: ["fixture"],
  }));
  assert.equal(row.category, "Text");
  assert.deepEqual(row.secondaryCategories, ["System"]);
  assert.deepEqual(row.keywords, ["fixture"]);
  assert.equal(toolboxNodeInCategory(row, "System"), true);
  assert.deepEqual(buildToolboxTabs([], [row]).map((tab) => tab.key), ["all", "System", "Text"]);
  assert.deepEqual(buildToolboxTabs([], [{ category: "", secondaryCategories: [] }]).map((tab) => tab.key), ["all"]);
});

test("toolbox search keeps nested capability presets through API parsing, tree selection and step creation", async () => {
  const previousFetch = globalThis.fetch;
  const presets = { mode: "move", text: "  exact literal  ", optional: "" };
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "/api/step-runner/toolbox-search");
    assert.deepEqual(JSON.parse(String(init?.body)), { keyword: "move", skip: 0 });
    return Response.json({ ok: true, json: JSON.stringify({ items: [{ kind: "runner", id: "r:sys:fixture:move", label: "Move", parentLabel: "Fixture", payload: { stepRunnerKey: "sys:fixture", controlFieldValue: "move", inputPresets: presets } }], totalCount: 1, hasMore: false }) });
  };
  try {
    const result = await fetchToolboxModuleSearch("", { keyword: "move", skip: 0 });
    const hit = result.items[0];
    assert.equal(hit?.kind, "runner");
    if (!hit || hit.kind !== "runner") throw new Error("Missing fixture hit");
    assert.equal(hit.parentLabel, "Fixture");
    const node = { key: "sys:fixture", name: "Fixture", subItems: [] };
    const tree = buildToolboxSearchTreeMeta([node], [hit]);
    const payload = bestToolboxSearchInsertPayload(node, tree);
    const step = buildStepFromRunner(payload, [schema], () => "new-step");
    assert.equal(step.inputParams.mode?.value, "move");
    assert.equal(step.inputParams.text?.value, "  exact literal  ");
    assert.equal(step.inputParams.optional?.value, "");
  } finally { globalThis.fetch = previousFetch; }
});

test("detail schema resolves control key before opening an insertion; never silently drops its preset", async () => {
  const calls: unknown[] = [];
  const step = await prepareToolboxStep({ stepRunnerKey: "sys:fixture", controlFieldValue: "move" }, [], () => "new", async (...args) => { calls.push(args); return schema; });
  assert.deepEqual(calls, [["sys:fixture", "move"]]);
  assert.equal(step.inputParams.mode?.value, "move");
  await assert.rejects(prepareToolboxStep({ stepRunnerKey: "sys:fixture", controlFieldValue: "move" }, [], () => "new", async () => null), /控制参数/);
});

test("creation defaults only materialize explicit new-step values; existing runtime defaults remain absent", () => {
  const detail = StepRunnerItem.fromPartial({ key: "sys:fixture", inputParamDefs: [{ key: "ordinary", defaultValue: "runtime" }, { key: "created" }] });
  Object.assign(detail.inputParamDefs[1]!, { newStepDefaultValue: "creation" });
  const step = buildStepFromRunner({ stepRunnerKey: "sys:fixture" }, [detail], () => "new");
  assert.equal(step.inputParams.ordinary, undefined);
  assert.equal(step.inputParams.created?.value, "creation");
  const mapped = mapAgentSchemaToStepRunnerItem({ stepRunnerKey: "sys:fixture", inputs: [{ key: "created", valueType: "Text", newStepDefaultValue: "from schema" }] });
  assert.equal(buildStepFromRunner({ stepRunnerKey: "sys:fixture" }, [mapped], () => "mapped").inputParams.created?.value, "from schema");
});

test("popup compaction and document/disk projection retain unknown empty and whitespace presets", () => {
  const content = '{"steps":[],"variables":[],"subPrograms":[]}';
  const snapshot = parseProgramDocumentSnapshot(content);
  const step = buildStepFromRunner({ stepRunnerKey: "sys:fixture", inputPresets: { futureEmpty: "", futureText: "  literal  " } }, [schema], () => "inserted");
  step.inputParams.mode = { varKey: "", value: "" };
  snapshot.steps.push(compactActionStepParams(step, schema));
  const saved = JSON.parse(serializeProgramDocumentSnapshot(content, snapshot));
  assert.equal(saved.steps[0].inputParams.futureEmpty, "");
  assert.equal(saved.steps[0].inputParams.futureText, "  literal  ");
  assert.equal(Object.hasOwn(saved.steps[0].inputParams, "mode"), false, "known schema default still compacts");
});

test("workspace registry isolates surfaces, metadata and stale cleanup without a global handler", async () => {
  const workspace = createToolboxInsertionRegistry();
  const otherWorkspace = createToolboxInsertionRegistry();
  const calls: string[] = [];
  const payload = { stepRunnerKey: "sys:fixture" };
  const cleanupOld = workspace.register("main", () => { calls.push("old"); });
  const cleanupMain = workspace.register("main", () => { calls.push("main"); });
  const cleanupChild = workspace.register("sub-child", () => { calls.push("child"); });
  cleanupOld();
  await workspace.request("main", payload);
  await workspace.request("sub-child", payload);
  await workspace.request("metadata", payload);
  await otherWorkspace.request("main", payload);
  cleanupChild();
  await workspace.request("main", payload);
  cleanupMain();
  await workspace.request("main", payload);
  assert.deepEqual(calls, ["main", "child", "main"]);
});
