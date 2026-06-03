import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatJsonDisplayText,
  shouldUseJsonEditor,
  tryParseJsonString,
} from "./format-json-display.ts";

test("tryParseJsonString parses object strings", () => {
  const parsed = tryParseJsonString('{"a":1}');
  assert.deepEqual(parsed, { a: 1 });
});

test("formatJsonDisplayText pretty-prints embedded JSON strings", () => {
  const raw = JSON.stringify({ stepRunnerKey: "sys:csscript", name: "x" });
  const text = formatJsonDisplayText(raw);
  assert.match(text, /\n/);
  assert.match(text, /"stepRunnerKey"/);
});

test("shouldUseJsonEditor is true for large JSON payloads", () => {
  const raw = JSON.stringify({
    stepRunnerKey: "sys:csscript",
    name: "运行C#代码",
    description: "x".repeat(200),
    inputs: [{ key: "mode", title: "运行模式" }],
  });
  assert.equal(shouldUseJsonEditor(raw), true);
});
