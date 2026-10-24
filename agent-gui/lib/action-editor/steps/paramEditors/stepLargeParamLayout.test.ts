import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLargeParamLayout, isStepParamScriptHero, nextLargeParamTab, reconcileLargeParamTab, stepLargeParamLanguageBadge } from "./stepLargeParamLayout";
import { mapAgentSchemaToStepRunnerItem } from "../../api/stepRunnerSchemaMap";
import type { StepRunnerInputParamDef } from "../../types/action_query";
const def = (key: string, values: Partial<StepRunnerInputParamDef> = {}) =>
  Object.freeze({ key, name: key, isAdvanced: false, isMultiLine: false, defaultHighlightType: "", ...values });
test("script tabs require native multiline metadata, not key substrings or ordinary list text", () => {
  assert.equal(isStepParamScriptHero(def("code")), false);
  assert.equal(isStepParamScriptHero(def("scriptPath", { isMultiLine: true })), false);
  assert.equal(isStepParamScriptHero(def("reference", { isMultiLine: true })), false);
  assert.equal(isStepParamScriptHero(def("user_code", { isMultiLine: true })), true);
  assert.equal(isStepParamScriptHero(def("expression", { isMultiLine: true })), true);
});
test("explicit native highlight metadata enables large fields without inspecting their values", () => {
  for (const type of [" C# ", "JSON", "tsx", "python", "SQL", "xaml", "markdown"]) {
    assert.equal(isStepParamScriptHero(def("body", { isMultiLine: true, defaultHighlightType: type })), true);
  }
  assert.equal(isStepParamScriptHero(def("body", { isMultiLine: true, defaultHighlightType: "unknown" })), false);
  assert.equal(isStepParamScriptHero(def("body", { defaultHighlightType: "json" })), false);
  const mapped = mapAgentSchemaToStepRunnerItem({ inputs: [{ key: "body", valueType: "Text", isMultiLine: true, defaultHighlightType: "json" }] });
  assert.equal(isStepParamScriptHero(mapped.inputParamDefs[0]!), true);
});
test("capture toolbar remains a distinct native editor dependency", () => {
  assert.equal(isStepParamScriptHero(def(" ToolbarScript ", { isMultiLine: true, defaultHighlightType: "json" })), false);
});
test("language badges use native aliases and field keys without interpreting script contents", () => {
  assert.equal(stepLargeParamLanguageBadge(def("body", { defaultHighlightType: " csharp " })), "C#");
  assert.equal(stepLargeParamLanguageBadge(def("jscode")), "JS");
  assert.equal(stepLargeParamLanguageBadge(def("code")), "");
});
test("advanced counts exclude tab fields and preserve exact schema objects", () => {
  const script = def("code", { isMultiLine: true, isAdvanced: true });
  const reference = def("reference", { isMultiLine: true, isAdvanced: true });
  const layout = buildLargeParamLayout(Object.freeze([script, reference]), Object.freeze([{ isAdvanced: true }]));
  assert.equal(layout.tabs[0], script); assert.equal(layout.advancedFullRowCount, 2);
});
test("schema refresh retains the current tab until its field disappears; params always remains valid", () => {
  assert.equal(reconcileLargeParamTab("code", [def("code", { isMultiLine: true })]), "code");
  assert.equal(reconcileLargeParamTab("code", []), null);
  assert.equal(reconcileLargeParamTab("code", [def("code")]), null);
  assert.equal(reconcileLargeParamTab(null, []), null);
  assert.equal(reconcileLargeParamTab("params", [def("params", { isMultiLine: true, defaultHighlightType: "json" })]), "params");
});
test("large parameter tab keys support roving arrows and Home/End without colliding with a params field", () => {
  assert.equal(nextLargeParamTab(null, ["code", "params"], "ArrowLeft"), "params");
  assert.equal(nextLargeParamTab("params", ["code", "params"], "ArrowRight"), null);
  assert.equal(nextLargeParamTab("code", ["code", "params"], "End"), "params");
  assert.equal(nextLargeParamTab("code", ["code", "params"], "Home"), null);
  assert.equal(nextLargeParamTab(null, ["code"], "Escape"), undefined);
});
