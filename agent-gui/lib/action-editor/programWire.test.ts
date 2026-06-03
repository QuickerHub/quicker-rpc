import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseProgramWireJson,
  serializeProgramWireJson,
} from "@/lib/action-editor/wire/programWire";

test("programWire roundtrip varType and file ref", () => {
  const raw = {
    steps: [
      {
        stepId: "s-1",
        stepRunnerKey: "sys:form",
        inputParams: {
          formDef: { file: "files/form1.form.json" },
          title: { value: "Hello" },
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
  const again = parseProgramWireJson(serialized);
  assert.equal(again.ok, true);
  if (!again.ok) return;

  assert.equal(again.present.variables[0]?.varType, 2);
  assert.equal(again.present.variables[1]?.varType, 12);
  assert.equal(again.present.steps[0]?.inputParams.formDef?.file, "files/form1.form.json");
});

test("isActionProjectDataPath", async () => {
  const { isActionProjectDataPath, actionProjectInfoPathFromDataPath } = await import(
    "@/lib/action-project-data-parse"
  );
  assert.equal(
    isActionProjectDataPath(".quicker/actions/my-action/data.json"),
    true,
  );
  assert.equal(isActionProjectDataPath(".quicker/actions/my-action/info.json"), false);
  assert.equal(
    actionProjectInfoPathFromDataPath(".quicker/actions/guid/data.json"),
    ".quicker/actions/guid/info.json",
  );
});
