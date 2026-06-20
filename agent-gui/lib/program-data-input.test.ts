import assert from "node:assert/strict";
import { test } from "node:test";
import {
  coerceProgramDataContent,
  normalizeProgramDataInput,
  programDataHasBody,
  programDataSchema,
} from "@/lib/program-data-input";

test("programDataSchema defaults steps and variables", () => {
  const parsed = programDataSchema.parse({});
  assert.deepEqual(parsed.steps, []);
  assert.deepEqual(parsed.variables, []);
});

test("programDataHasBody detects non-empty program", () => {
  assert.equal(programDataHasBody({ steps: [], variables: [] }), false);
  assert.equal(
    programDataHasBody({ steps: [{ stepKey: "sys:comment" }], variables: [] }),
    true,
  );
});

test("normalizeProgramDataInput rejects invalid shape", () => {
  assert.equal(normalizeProgramDataInput({ steps: "bad" }), null);
  assert.equal(
    normalizeProgramDataInput({ steps: [], variables: [] })?.steps.length,
    0,
  );
});

test("coerceProgramDataContent accepts object and normalizes agent wire mistakes", () => {
  const coerced = coerceProgramDataContent({
    variables: [{ name: "clipText", type: "Text", value: "" }],
    steps: [
      {
        runnerKey: "sys:getClipboardText",
        inputs: { format: "UnicodeText" },
        outputs: { output: "clipText" },
      },
    ],
  });
  assert.equal(coerced.ok, true);
  if (!coerced.ok) return;
  assert.equal(coerced.normalized, true);
  const parsed = JSON.parse(coerced.text) as {
    variables: Array<{ key?: string }>;
    steps: Array<{ stepRunnerKey?: string; inputParams?: unknown }>;
  };
  assert.equal(parsed.variables[0]?.key, "clipText");
  assert.equal(parsed.steps[0]?.stepRunnerKey, "sys:getClipboardText");
  assert.ok(parsed.steps[0]?.inputParams);
});
