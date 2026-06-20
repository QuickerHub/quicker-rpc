import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cacheStepRunnerGet,
  clearStepRunnerGetCache,
  getCachedStepRunnerGet,
  normalizeStepRunnerGetCacheKey,
} from "./step-runner-get-cache.ts";

function sampleResult(): import("./tool-result.ts").StructuredToolResult {
  return {
    ok: true,
    exitCode: 0,
    source: "local",
    data: { key: "sys:evalexpression" },
  };
}

test("normalizeStepRunnerGetCacheKey includes controlField", () => {
  assert.equal(
    normalizeStepRunnerGetCacheKey("sys:writeClipboard", "text"),
    "sys:writeclipboard|text",
  );
});

test("get cache dedupes same key per thread", () => {
  clearStepRunnerGetCache();
  cacheStepRunnerGet("t1", "sys:evalexpression", undefined, sampleResult());
  assert.ok(getCachedStepRunnerGet("t1", "sys:evalexpression"));
  assert.equal(getCachedStepRunnerGet("t2", "sys:evalexpression"), undefined);
  clearStepRunnerGetCache("t1");
  assert.equal(getCachedStepRunnerGet("t1", "sys:evalexpression"), undefined);
});
