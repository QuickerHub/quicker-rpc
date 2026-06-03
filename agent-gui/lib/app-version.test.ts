import test from "node:test";
import assert from "node:assert/strict";
import { formatDisplayVersion } from "./app-version-format.ts";

test("formatDisplayVersion strips v prefix and build suffix", () => {
  assert.equal(formatDisplayVersion("v0.9.17.0+abc123"), "0.9.17.0");
  assert.equal(formatDisplayVersion("0.9.2"), "0.9.2");
});
