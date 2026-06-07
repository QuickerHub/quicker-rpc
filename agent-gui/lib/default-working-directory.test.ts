import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveEffectiveWorkingDirectory } from "@/lib/default-working-directory";

test("resolveEffectiveWorkingDirectory returns trimmed override", () => {
  assert.equal(
    resolveEffectiveWorkingDirectory("  D:\\projects\\foo  "),
    "D:\\projects\\foo",
  );
});

test("resolveEffectiveWorkingDirectory falls back when override empty", () => {
  const fallback = resolveEffectiveWorkingDirectory(undefined);
  assert.ok(fallback);
  assert.equal(resolveEffectiveWorkingDirectory(""), fallback);
  assert.equal(resolveEffectiveWorkingDirectory("   "), fallback);
});
