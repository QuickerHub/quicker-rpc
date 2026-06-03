import assert from "node:assert/strict";
import test from "node:test";
import { shouldRunToolTerminalEffect } from "./use-tool-terminal-effect";

test("shouldRunToolTerminalEffect ignores initial mount at terminal state", () => {
  assert.equal(
    shouldRunToolTerminalEffect(null, "output-available", "output-available"),
    false,
  );
});

test("shouldRunToolTerminalEffect runs on transition into terminal state", () => {
  assert.equal(
    shouldRunToolTerminalEffect("input-available", "output-available", "output-available"),
    true,
  );
});

test("shouldRunToolTerminalEffect does not rerun while staying terminal", () => {
  assert.equal(
    shouldRunToolTerminalEffect("output-available", "output-available", "output-available"),
    false,
  );
});
