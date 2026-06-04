import test from "node:test";
import assert from "node:assert/strict";
import {
  extractProgramVariableKeys,
  findInterpolationPrefixWarnings,
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
