import assert from "node:assert/strict";
import test from "node:test";
import { ActionStep, ActionVariable, ActionStepParam, ActionVariableInputParamInfo } from "../types/common";
import { CsVarType } from "../steps/paramEditors/csStepEnums";
import { prepareProgramVariableChange, getUnusedProgramVariables } from "./programVariableReferences";
import type { XProgramPresent } from "./xProgramHistory";

const variable = (key = "旧值", extra: Partial<ActionVariable> = {}) => ActionVariable.create({ id: `id-${key}`, key, varType: CsVarType.Dict, ...extra });
const step = (value: string, runner = "sys:evalexpression", key = "expression") => ActionStep.create({ stepId: "step", stepRunnerKey: runner,
  inputParams: { [key]: ActionStepParam.create({ value }) } });
const rename = (present: XProgramPresent, name = "新值") => prepareProgramVariableChange(present,
  { kind: "edit", expected: structuredClone(present.variables[0]!), next: { ...present.variables[0]!, key: name } });

test("rename is atomic, uses original variable type, and covers branch bindings and variable dependencies", () => {
  const original = variable();
  const nested = step("$={旧值.member} + {旧值[0]} + {旧值}");
  nested.outputParams = { exact: "旧值", member: "旧值.member", longer: "旧值更多" };
  nested.inputParams.bound = ActionStepParam.create({ varKey: "旧值", value: "ignored" });
  const present = { variables: [original, variable("依赖", { defaultValue: "$$hello {旧值}", inputParamInfo: ActionVariableInputParamInfo.create({ visibleExpression: "$={旧值} != null" }) })],
    steps: [ActionStep.create({ stepId: "outer", stepRunnerKey: "sys:if", ifSteps: [nested], elseSteps: [step("$={旧值}")] })] };
  const before = structuredClone(present);
  const result = prepareProgramVariableChange(present, { kind: "edit", expected: original, next: { ...original, key: "新值", varType: CsVarType.Text } });
  assert.equal(result.ok, true); if (!result.ok) return;
  assert.deepEqual(present, before); assert.equal(result.present.variables[0]!.id, original.id);
  assert.equal(result.present.steps[0]!.ifSteps[0]!.inputParams.expression!.value, "$={新值.member} + {新值[0]} + {新值}");
  assert.deepEqual(result.present.steps[0]!.ifSteps[0]!.outputParams, { exact: "新值", member: "新值.member", longer: "旧值更多" });
  assert.equal(result.present.steps[0]!.ifSteps[0]!.inputParams.bound!.varKey, "新值");
  assert.equal(result.present.variables[1]!.defaultValue, "$$hello {新值}");
  assert.equal(result.present.variables[1]!.inputParamInfo!.visibleExpression, "$={新值} != null");
});

test("script literal calls rename without changing comments, unrelated strings or longer variable names", () => {
  for (const [runner, source, expected] of [
    ["sys:csscript", '/* context.GetVarValue("旧值") */ var text = "旧值"; context.GetVarValue("旧值"); context.SetVarValue("旧值", 1);', '/* context.GetVarValue("旧值") */ var text = "旧值"; context.GetVarValue("新值"); context.SetVarValue("新值", 1);'],
    ["sys:jsscript", '// quickerGetVar("旧值")\nquickerGetVar("旧值"); quickerSetVar(\'旧值\', 1); quickerGetVar("旧值更多");', '// quickerGetVar("旧值")\nquickerGetVar("新值"); quickerSetVar(\'新值\', 1); quickerGetVar("旧值更多");'],
    ["sys:pythonscript", '# quicker.context.GetVarValue("旧值")\nquicker.context.GetVarValue("旧值")', '# quicker.context.GetVarValue("旧值")\nquicker.context.GetVarValue("新值")'],
  ]) {
    const result = rename({ variables: [variable()], steps: [step(source!, runner!, "script")] });
    assert.equal(result.ok, true, runner); if (result.ok) assert.equal(result.present.steps[0]!.inputParams.script!.value, expected);
  }
});

test("dynamic script calls and external source reject the entire rename/delete without mutation", () => {
  for (const bad of [step('context.GetVarValue(name)', "sys:csscript", "script"),
    step('const read = quickerGetVar; read("旧值")', "sys:jsscript", "script"),
    ActionStep.create({ stepId: "external", stepRunnerKey: "sys:evalexpression", inputParams: { expression: ActionStepParam.create({ file: "files/code.txt" }) } })]) {
    const present = { steps: [bad], variables: [variable()] };
    const before = structuredClone(present);
    assert.equal(rename(present).ok, false);
    assert.equal(prepareProgramVariableChange(present, { kind: "delete", expected: present.variables }).ok, false);
    assert.equal(getUnusedProgramVariables(present).ok, false);
    assert.deepEqual(present, before);
  }
});

test("inline Domain form preserves unknown fields and exact numeric lexemes", () => {
  const value = '{"Fields":[{"FieldKey":"旧值","Label":"$$hi {旧值}","VisibleExpression":"$={旧值} != null","Future":9223372036854775807}],"Unknown":1e999}';
  const result = rename({ steps: [step(value, "sys:form", "formDef")], variables: [variable()] });
  assert.equal(result.ok, true); if (!result.ok) return;
  const form = result.present.steps[0]!.inputParams.formDef!.value;
  assert.match(form, /"FieldKey":"新值"/); assert.match(form, /9223372036854775807/); assert.match(form, /1e999/);
  assert.match(form, /hi \{新值\}/);
});

test("authoring form target changes without renaming its distinct UI field key", () => {
  const result = rename({ variables: [variable()], steps: [step('{"schema":"quicker.form.v1","fields":[{"key":"field-id","target":"旧值","label":"$$Hi {旧值}","future":9007199254740993}]}', "sys:form", "formDef")] });
  assert.equal(result.ok, true); if (!result.ok) return;
  const output = result.present.steps[0]!.inputParams.formDef!.value;
  assert.match(output, /"key":"field-id"/); assert.match(output, /"target":"新值"/); assert.match(output, /9007199254740993/);
  const legacy = rename({ variables: [variable()], steps: [step('{"schema":"quicker.form.v1","mode":"variables","fields":[{"key":"field-id","target":"旧值"}]}', "sys:form", "formSpec")] });
  assert.equal(legacy.ok, true); if (legacy.ok) assert.match(legacy.present.steps[0]!.inputParams.formSpec!.value, /"target":"新值"/);
});

test("form camel aliases and key-only visibleWhen preserve field identity, dictionary targets stay in their scope", () => {
  const form = '{"fields":[{"key":"旧值","helpText":"$${旧值}","selectionItems":"$${旧值}"},{"key":"other","visibleWhen":{"field":"旧值","eq":"yes"}}]}';
  const result = rename({ variables: [variable()], steps: [step(form, "sys:form", "formDef")] });
  assert.equal(result.ok, true); if (result.ok) {
    const data = JSON.parse(result.present.steps[0]!.inputParams.formDef!.value);
    assert.equal(data.fields[0].key, "旧值"); assert.equal(data.fields[0].target, "新值");
    assert.equal(data.fields[0].helpText, "$${新值}"); assert.equal(data.fields[0].selectionItems, "$${新值}");
    assert.equal(data.fields[1].visibleWhen.field, "旧值");
  }
  const dictionary = rename({ variables: [variable()], steps: [step('{"mode":"dict_dynamic","dictVar":"旧值","fields":[{"key":"field","target":"旧值"}]}', "sys:form", "formDef")] });
  assert.equal(dictionary.ok, true); if (dictionary.ok) {
    const data = JSON.parse(dictionary.present.steps[0]!.inputParams.formDef!.value);
    assert.equal(data.dictVar, "新值"); assert.equal(data.fields[0].target, "旧值");
  }
});

test("plain placeholder pins need ReplaceVariable proof and cannot be declared unused", () => {
  const present = { variables: [variable()], steps: [step("plain {旧值}", "future:runner", "text")] };
  assert.equal(rename(present).ok, false); assert.equal(getUnusedProgramVariables(present).ok, false);
  assert.equal(rename({ ...present, steps: [step("plain {other}", "future:runner", "text")] }).ok, true);
});

test("C# typed wrapper is supported while computed global script calls stay unknown", () => {
  const wrapped = 'public static void Exec(IStepContext context) { var value = context.GetVarValue("旧值"); }';
  const result = rename({ variables: [variable()], steps: [step(wrapped, "sys:csscript", "script")] });
  assert.equal(result.ok, true); if (result.ok) assert.match(result.present.steps[0]!.inputParams.script!.value, /GetVarValue\("新值"\)/);
  for (const code of ['this["quickerGetVar"]("旧值")', 'window["quickerGetVar"]("旧值")', 'api["method"]("旧值")']) {
    assert.equal(rename({ variables: [variable()], steps: [step(code, "sys:jsscript", "script")] }).ok, false);
  }
});

test("HTTP IMG bindings respect exact full values and multipart line boundaries", () => {
  for (const [mode, body, expected] of [["BinaryFile", "IMG:旧值", "IMG:新值"], ["BinaryFile", "IMG:旧值更多", "IMG:旧值更多"],
    ["FILE", "photo=IMG:旧值\r\nlong=IMG:旧值更多\r\ntext=prefixIMG:旧值", "photo=IMG:新值\r\nlong=IMG:旧值更多\r\ntext=prefixIMG:旧值"],
    ["Text", "IMG:旧值", "IMG:旧值"]]) {
    const http = step(body!, "sys:http", "body"); http.inputParams.bodyType = ActionStepParam.create({ value: mode });
    const result = rename({ variables: [variable()], steps: [http] });
    assert.equal(result.ok, true); if (result.ok) assert.equal(result.present.steps[0]!.inputParams.body!.value, expected);
  }
  const dynamic = step("IMG:旧值", "sys:http", "body"); dynamic.inputParams.bodyType = ActionStepParam.create({ varKey: "mode" });
  assert.equal(rename({ variables: [variable()], steps: [dynamic] }).ok, false);
});

test("combining marks and escaped native identifiers participate in declarations and references", () => {
  for (const key of ["值\u0301", "@class", "Ⅰname"]) {
    const original = variable(key);
    const result = rename({ variables: [original], steps: [step(`$={${key}}`)] }, "改名\u0301");
    assert.equal(result.ok, true); if (result.ok) assert.equal(result.present.steps[0]!.inputParams.expression!.value, "$={改名\u0301}");
  }
  for (const name of ["class", "a\u200c", "quicker_in_param", "[cliptext]"]) assert.equal(rename({ variables: [variable()], steps: [] }, name).ok, false);
  assert.equal(rename({ variables: [variable()], steps: [] }, "params").ok, true);
});

test("delete refuses references/protection, and cleanup preserves interface and default dependencies", () => {
  const used = variable("used"), dependency = variable("dependency", { defaultValue: "$={used}" });
  const present = { steps: [], variables: [used, dependency, variable("protected", { isLocked: true }), variable("input", { isInput: true })] };
  const deleted = prepareProgramVariableChange(present, { kind: "delete", expected: [used] });
  assert.equal(deleted.ok, false); if (!deleted.ok) assert.equal(deleted.code, "variable_referenced");
  assert.equal(prepareProgramVariableChange(present, { kind: "delete", expected: [present.variables[2]!] }).ok, false);
  const unused = getUnusedProgramVariables(present); assert.equal(unused.ok, true);
  if (unused.ok) assert.deepEqual(unused.variables.map((row) => row.key), ["dependency"]);
});

test("stale expected rows, duplicate identifiers, reserved names and identity changes fail", () => {
  const present = { steps: [], variables: [variable()] };
  for (const next of [{ ...present.variables[0]!, key: "quicker_in_param" }, { ...present.variables[0]!, id: "replacement" }]) {
    assert.equal(prepareProgramVariableChange(present, { kind: "edit", expected: present.variables[0]!, next }).ok, false);
  }
  assert.equal(prepareProgramVariableChange(present, { kind: "edit", expected: { ...present.variables[0]!, desc: "stale" }, next: present.variables[0]! }).ok, false);
  assert.equal(rename({ ...present, variables: [...present.variables, { ...variable(), key: "other" }] }).ok, false);
});

test("interface rename/delete fail even if the rename draft clears the interface flag", () => {
  const original = variable("parameter", { isInput: true });
  const present = { steps: [], variables: [original] };
  assert.equal(prepareProgramVariableChange(present, { kind: "edit", expected: original, next: { ...original, key: "changed", isInput: false } }).ok, false);
  assert.equal(prepareProgramVariableChange(present, { kind: "delete", expected: [original] }).ok, false);
  assert.equal(prepareProgramVariableChange(present, { kind: "edit", expected: original, next: { ...original, desc: "documentation" } }).ok, true);
});

test("duplicate form fields and indirect script execution are unknown, never unused", () => {
  for (const body of [step('{"Fields":[{"FieldKey":"旧值","FieldKey":"other"}]}', "sys:form", "formDef"),
    step('{"Fields":[{"FieldKey":"旧值"}]}', "custom:runner", "formDef"),
    step('{"Fields":[],"FutureExpression":"$={旧值}"}', "sys:form", "formDef"),
    step('eval("quickerGetVar(\\\"旧值\\\")")', "sys:jsscript", "script"),
    step('x = f"{quicker.context.GetVarValue(\'旧值\')}"', "sys:pythonscript", "script")]) {
    const present = { steps: [body], variables: [variable()] };
    assert.equal(rename(present).ok, false); assert.equal(getUnusedProgramVariables(present).ok, false);
  }
});

test("escaped script identifiers fail rename, delete and cleanup without mutating the draft", () => {
  const source = String.raw`quicker\u0047etVar("旧值");`;
  let observed = "";
  // The syntax really calls the ordinary API; this is not an inert backslash in a string.
  Function("quickerGetVar", source)((key: string) => { observed = key; });
  assert.equal(observed, "旧值");
  const present = { variables: [variable()], steps: [step(source, "sys:jsscript", "script")] };
  const before = structuredClone(present);
  assert.equal(rename(present).ok, false);
  assert.equal(prepareProgramVariableChange(present, { kind: "delete", expected: present.variables }).ok, false);
  assert.equal(getUnusedProgramVariables(present).ok, false);
  assert.deepEqual(present, before);

  const quoted = String.raw`// quicker\u0047etVar("旧值")
const text = "quicker\\u0047etVar"; quickerGetVar("旧值");`;
  const safe = rename({ variables: [variable()], steps: [step(quoted, "sys:jsscript", "script")] });
  assert.equal(safe.ok, true);
  if (safe.ok) {
    assert.match(safe.present.steps[0]!.inputParams.script!.value, /quickerGetVar\("新值"\)/);
    assert.match(safe.present.steps[0]!.inputParams.script!.value, /quicker\\u0047etVar/);
  }
});

test("metadata-only edit preserves unsupported bodies and native extensions", () => {
  const original = { ...variable(), defaultValueFile: "files/default.txt", future: { version: "opaque" } };
  const present = { variables: [original], steps: [step('context.GetVarValue(name)', "sys:csscript", "script")] };
  const result = prepareProgramVariableChange(present, { kind: "edit", expected: original, next: { ...original, desc: "changed" } });
  assert.equal(result.ok, true); if (result.ok) assert.deepEqual(result.present.variables[0], { ...original, desc: "changed" });
});
