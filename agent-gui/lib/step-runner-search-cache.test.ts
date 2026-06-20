import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cacheStepRunnerSearch,
  clearStepRunnerSearchCache,
  getCachedStepRunnerSearch,
  normalizeStepRunnerSearchQuery,
} from "./step-runner-search-cache.ts";
import type { StructuredToolResult } from "./tool-result.ts";

const sampleResult = (): StructuredToolResult => ({
  ok: true,
  exitCode: 0,
  source: "qkrpc",
  data: { matchCount: 1 },
});

test("normalizeStepRunnerSearchQuery trims and lowercases", () => {
  assert.equal(normalizeStepRunnerSearchQuery("  GetClipboardText "), "getclipboardtext");
});

test("step runner search cache dedupes per thread", () => {
  clearStepRunnerSearchCache();
  cacheStepRunnerSearch("t1", "clipboard", sampleResult());
  assert.ok(getCachedStepRunnerSearch("t1", "clipboard"));
  assert.deepEqual(getCachedStepRunnerSearch("t1", " CLIPBOARD "), sampleResult());
  assert.equal(getCachedStepRunnerSearch("t2", "clipboard"), undefined);
  clearStepRunnerSearchCache("t1");
  assert.equal(getCachedStepRunnerSearch("t1", "clipboard"), undefined);
});
