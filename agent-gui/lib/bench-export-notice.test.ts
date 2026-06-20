import assert from "node:assert/strict";
import test from "node:test";
import {
  appendBenchExportNotice,
  buildBenchExportNoticeText,
  isBenchExportNoticeMessage,
} from "./bench-export-notice";

test("appendBenchExportNotice appends assistant text with export path", () => {
  const result = {
    path: "D:/exports/bench-test.json",
    filename: "bench-test.json",
    exportsDirectory: "D:/exports",
  };
  const next = appendBenchExportNotice(
    [{ id: "u1", role: "user", parts: [{ type: "text", text: "hello" }] }],
    result,
    { mockSummary: "mock assert PASS" },
  );
  assert.equal(next.length, 2);
  assert.equal(next[1]?.role, "assistant");
  const text = buildBenchExportNoticeText(result, { mockSummary: "mock assert PASS" });
  assert.equal(
    next[1]?.parts[0] && "text" in next[1].parts[0] ? next[1].parts[0].text : "",
    text,
  );
  assert.ok(isBenchExportNoticeMessage(next[1]!, result.path));
});

test("appendBenchExportNotice dedupes same export path", () => {
  const result = {
    path: "D:/exports/bench-test.json",
    filename: "bench-test.json",
  };
  const base = [
    { id: "u1", role: "user" as const, parts: [{ type: "text" as const, text: "hello" }] },
  ];
  const once = appendBenchExportNotice(base, result);
  const twice = appendBenchExportNotice(once, result);
  assert.equal(twice.length, once.length);
});
