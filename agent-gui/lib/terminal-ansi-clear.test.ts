import assert from "node:assert/strict";
import test from "node:test";
import {
  chunkIncludesScreenClear,
  mergeTerminalReplay,
} from "@/lib/terminal-ansi-clear";

test("detects ED clear in chunk", () => {
  assert.equal(chunkIncludesScreenClear("\x1b[2J\x1b[HPS> "), true);
  assert.equal(chunkIncludesScreenClear("hello"), false);
});

test("mergeTerminalReplay drops content before last clear", () => {
  const before = "line1\nline2\n";
  const chunk = "\x1b[2J\x1b[HPS C:\\> ";
  const merged = mergeTerminalReplay(before, chunk);
  assert.equal(merged, chunk);
  assert.ok(!merged.includes("line1"));
});
