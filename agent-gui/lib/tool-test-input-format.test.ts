import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultStepInputJson,
  formatToolTestInputCompact,
} from "./tool-test-input-format.ts";

test("formatToolTestInputCompact abbreviates step-runner search", () => {
  assert.equal(
    formatToolTestInputCompact({ query: "移动", limit: 8 }),
    "q=移动 n=8",
  );
});

test("formatToolTestInputCompact shows empty query", () => {
  assert.equal(formatToolTestInputCompact({ query: "", limit: 5 }), 'q="" n=5');
});

test("formatToolTestInputCompact prefers shell description over command", () => {
  assert.equal(
    formatToolTestInputCompact({
      description: "验证前端检查接口",
      command: "Invoke-RestMethod http://127.0.0.1:3000/api/dev/frontend-check",
    }),
    "验证前端检查接口",
  );
});

test("formatToolTestInputCompact shows OR and wildcard query", () => {
  assert.equal(
    formatToolTestInputCompact({ query: "表达式|evalexpression", limit: 8 }),
    "q=表达式|evalexpression n=8",
  );
  assert.equal(
    formatToolTestInputCompact({ query: "*clip*", limit: 10 }),
    "q=*clip* n=10",
  );
});

test("defaultStepInputJson is single-line", () => {
  const s = defaultStepInputJson({ query: "移动", limit: 8 });
  assert.equal(s, '{"query":"移动","limit":8}');
  assert.equal(s.includes("\n"), false);
});
