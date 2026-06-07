import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseProgramWireJson,
  serializeProgramWireJson,
} from "@/lib/action-editor/wire/programWire";

test("programWire roundtrip variable default wire", () => {
  const raw = {
    steps: [],
    variables: [
      { key: "inlineVar", default: "hello" },
      { key: "fileVar", "default.file": "files/body-default1.txt" },
    ],
  };

  const parsed = parseProgramWireJson(JSON.stringify(raw));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const fileVar = parsed.present.variables[1] as typeof parsed.present.variables[1] & {
    defaultValueFile?: string;
  };
  assert.equal(parsed.present.variables[0]?.defaultValue, "hello");
  assert.equal(fileVar.defaultValue, "");
  assert.equal(fileVar.defaultValueFile, "files/body-default1.txt");

  const serialized = serializeProgramWireJson(parsed.present, parsed.extraTopLevel);
  assert.match(serialized, /"default": "hello"/);
  assert.match(serialized, /"default\.file": "files\/body-default1\.txt"/);
  assert.doesNotMatch(serialized, /"defaultValue"/);
});

test("programWire reads legacy defaultValue and serializes to default wire", () => {
  const legacy = {
    steps: [],
    variables: [
      { key: "inlineVar", defaultValue: "hello" },
      { key: "fileVar", defaultValue: { file: "files/body-default1.txt" } },
      { key: "wireFileVar", "defaultValue.file": "files/wire-default1.txt" },
      { key: "legacyFileVar", defaultValueFile: "files/legacy-default1.txt" },
    ],
  };

  const parsed = parseProgramWireJson(JSON.stringify(legacy));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(parsed.present.variables[0]?.defaultValue, "hello");

  for (const index of [1, 2, 3]) {
    const variable = parsed.present.variables[index] as typeof parsed.present.variables[number] & {
      defaultValueFile?: string;
    };
    assert.equal(variable.defaultValue, "");
    assert.ok(variable.defaultValueFile?.startsWith("files/"));
  }

  const serialized = serializeProgramWireJson(parsed.present, parsed.extraTopLevel);
  assert.match(serialized, /"default": "hello"/);
  assert.match(serialized, /"default\.file": "files\/body-default1\.txt"/);
  assert.match(serialized, /"default\.file": "files\/wire-default1\.txt"/);
  assert.match(serialized, /"default\.file": "files\/legacy-default1\.txt"/);
  assert.doesNotMatch(serialized, /"defaultValue"/);
});

test("normalizeDataJsonTextForDisk migrates legacy defaultValue on disk", async () => {
  const { normalizeDataJsonTextForDisk } = await import("@/lib/action-editor/wire/programWire");
  const legacy = JSON.stringify({
    steps: [],
    variables: [
      { key: "inlineVar", defaultValue: "hello" },
      { key: "fileVar", defaultValue: { file: "files/body-default1.txt" } },
      { key: "legacyFileVar", defaultValueFile: "files/legacy-default1.txt" },
    ],
  });
  const out = normalizeDataJsonTextForDisk(legacy);
  assert.match(out, /"default": "hello"/);
  assert.match(out, /"default\.file": "files\/body-default1\.txt"/);
  assert.match(out, /"default\.file": "files\/legacy-default1\.txt"/);
  assert.doesNotMatch(out, /"defaultValue"/);
  assert.doesNotMatch(out, /"defaultValueFile"/);
});

test("programWire roundtrip varType and file ref", () => {
  const raw = {
    steps: [
      {
        stepId: "s-1",
        stepRunnerKey: "sys:form",
        inputParams: {
          "formDef.file": "files/form1.form.json",
          title: "Hello",
        },
      },
    ],
    variables: [
      { key: "flag", varType: "boolean" },
      { key: "count", varType: "integer" },
      { key: "textOnly" },
    ],
  };

  const parsed = parseProgramWireJson(JSON.stringify(raw));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(parsed.present.variables[0]?.varType, 2);
  assert.equal(parsed.present.variables[1]?.varType, 12);
  assert.equal(parsed.present.steps[0]?.inputParams.formDef?.file, "files/form1.form.json");

  const serialized = serializeProgramWireJson(parsed.present, parsed.extraTopLevel);
  assert.match(serialized, /"formDef\.file": "files\/form1\.form\.json"/);
  assert.match(serialized, /"title": "Hello"/);
  const again = parseProgramWireJson(serialized);
  assert.equal(again.ok, true);
  if (!again.ok) return;

  assert.equal(again.present.variables[0]?.varType, 2);
  assert.equal(again.present.variables[1]?.varType, 12);
  assert.equal(again.present.steps[0]?.inputParams.formDef?.file, "files/form1.form.json");
});

test("normalizeDataJsonTextForDisk compacts legacy object binds", async () => {
  const { normalizeDataJsonTextForDisk } = await import("@/lib/action-editor/wire/programWire");
  const legacy = JSON.stringify({
    steps: [
      {
        stepRunnerKey: "sys:evalexpression",
        inputParams: {
          expression: { value: "1+1" },
          code: { file: "files/x.eval.cs" },
        },
      },
    ],
    variables: [],
  });
  const out = normalizeDataJsonTextForDisk(legacy);
  assert.match(out, /"expression": "1\+1"/);
  assert.match(out, /"code\.file": "files\/x\.eval\.cs"/);
  assert.doesNotMatch(out, /"value"/);
});

test("isActionProjectDataPath", async () => {
  const {
    isActionProjectDataPath,
    isEmbeddedSubProgramDataPath,
    actionProjectInfoPathFromDataPath,
    actionIdFromDataPath,
    embeddedSubProgramProjectDirFromDataPath,
  } = await import("@/lib/action-project-data-parse");
  assert.equal(
    isActionProjectDataPath(".quicker/actions/my-action/data.json"),
    true,
  );
  assert.equal(isActionProjectDataPath(".quicker/actions/my-action/info.json"), false);
  assert.equal(
    actionProjectInfoPathFromDataPath(".quicker/actions/guid/data.json"),
    ".quicker/actions/guid/info.json",
  );

  const subData =
    ".quicker/actions/846b4132-ad73-42e8-b2f9-c42fe718ae20/subprograms/039e60db-424c-4653-8798-01feb36b1aa0/data.json";
  assert.equal(isActionProjectDataPath(subData), true);
  assert.equal(isEmbeddedSubProgramDataPath(subData), true);
  assert.equal(
    actionProjectInfoPathFromDataPath(subData),
    ".quicker/actions/846b4132-ad73-42e8-b2f9-c42fe718ae20/subprograms/039e60db-424c-4653-8798-01feb36b1aa0/info.json",
  );
  assert.equal(
    actionIdFromDataPath(subData),
    "846b4132-ad73-42e8-b2f9-c42fe718ae20",
  );
  assert.equal(
    embeddedSubProgramProjectDirFromDataPath(subData),
    ".quicker/actions/846b4132-ad73-42e8-b2f9-c42fe718ae20/subprograms/039e60db-424c-4653-8798-01feb36b1aa0",
  );
});
