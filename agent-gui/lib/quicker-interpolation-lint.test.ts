import test from "node:test";
import assert from "node:assert/strict";
import {
  extractProgramVariableKeys,
  findInterpolationPrefixWarnings,
  formatValuePrefixWarningsMessage,
  scanProgramValuePrefixWarnings,
  valueStringMissingEvalPrefix,
} from "./quicker-interpolation-lint.ts";

test("extractProgramVariableKeys reads variables array", () => {
  const keys = extractProgramVariableKeys(
    JSON.stringify({
      variables: [{ key: "lineCount", type: "integer" }],
      steps: [],
    }),
  );
  assert.deepEqual([...keys], ["lineCount"]);
});

test("valueStringMissingEvalPrefix", () => {
  assert.equal(valueStringMissingEvalPrefix("hello"), true);
  assert.equal(valueStringMissingEvalPrefix("$$Hi"), false);
  assert.equal(valueStringMissingEvalPrefix("$=1+1"), false);
});

test("findInterpolationPrefixWarnings flags message without $$", () => {
  const text = `"message": { "value": "Before：{lineCount}\\nAfter：{lineCount}" }`;
  const keys = new Set(["lineCount"]);
  const hits = findInterpolationPrefixWarnings(text, keys);
  assert.equal(hits.length, 2);
});

test("findInterpolationPrefixWarnings ignores undefined vars", () => {
  const text = `"message": { "value": "{unknown}" }`;
  const hits = findInterpolationPrefixWarnings(text, new Set(["lineCount"]));
  assert.equal(hits.length, 0);
});

test("findInterpolationPrefixWarnings accepts $$ prefix", () => {
  const text = `"message": { "value": "$$Hi {lineCount}" }`;
  const hits = findInterpolationPrefixWarnings(text, new Set(["lineCount"]));
  assert.equal(hits.length, 0);
});

test("findInterpolationPrefixWarnings accepts $= prefix", () => {
  const text = `"condition": { "value": "$={lineCount} > 0" }`;
  const hits = findInterpolationPrefixWarnings(text, new Set(["lineCount"]));
  assert.equal(hits.length, 0);
});

test("scanProgramValuePrefixWarnings flags inline value", () => {
  const data = {
    variables: [{ key: "lineCount", type: "integer" }],
    steps: [
      {
        stepRunnerKey: "sys:MsgBox",
        inputParams: {
          message: { value: "Count: {lineCount}" },
        },
      },
    ],
  };
  const hits = scanProgramValuePrefixWarnings(JSON.stringify(data));
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.suggestedPrefix, "$$");
  assert.match(hits[0]?.location ?? "", /inputParams\.message/);
});

test("scanProgramValuePrefixWarnings skips varKey binding", () => {
  const data = {
    variables: [{ key: "lineCount", type: "integer" }],
    steps: [
      {
        stepRunnerKey: "sys:MsgBox",
        inputParams: {
          message: { varKey: "lineCount" },
        },
      },
    ],
  };
  const hits = scanProgramValuePrefixWarnings(JSON.stringify(data));
  assert.equal(hits.length, 0);
});

test("scanProgramValuePrefixWarnings skips expression param", () => {
  const data = {
    variables: [{ key: "lineCount", type: "integer" }],
    steps: [
      {
        stepRunnerKey: "sys:evalexpression",
        inputParams: {
          expression: { value: "{lineCount} + 1" },
        },
      },
    ],
  };
  const hits = scanProgramValuePrefixWarnings(JSON.stringify(data));
  assert.equal(hits.length, 0);
});

test("scanProgramValuePrefixWarnings attaches line range away from file start", () => {
  const steps = Array.from({ length: 6 }, (_, i) => ({
    stepRunnerKey: "sys:noop",
    inputParams: { index: { value: String(i) } },
  }));
  steps.push({
    stepRunnerKey: "sys:MsgBox",
    inputParams: { message: { value: "Count: {lineCount}" } },
  });
  const jsonText = JSON.stringify(
    { variables: [{ key: "lineCount", type: "integer" }], steps },
    null,
    2,
  );
  const hits = scanProgramValuePrefixWarnings(jsonText);
  assert.equal(hits.length, 1);
  assert.ok((hits[0]?.startLine ?? 0) > 5);
  assert.ok((hits[0]?.endLine ?? 0) >= (hits[0]?.startLine ?? 0));
  assert.match(hits[0]?.read ?? "", /startLine:\s*\d+/);
  assert.equal(hits[0]?.dataJsonPath, hits[0]?.location);
});

test("formatValuePrefixWarningsMessage tells agent not to read from line 1", () => {
  const jsonText = JSON.stringify(
    {
      variables: [{ key: "n", type: "integer" }],
      steps: [
        {
          stepRunnerKey: "sys:MsgBox",
          inputParams: { message: { value: "{n}" } },
        },
      ],
    },
    null,
    2,
  );
  const warnings = scanProgramValuePrefixWarnings(jsonText);
  const msg = formatValuePrefixWarningsMessage(warnings);
  assert.match(msg, /Do NOT read data\.json from line 1/);
  assert.match(msg, /workspace_program/);
});
