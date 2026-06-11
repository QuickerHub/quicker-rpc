import assert from "node:assert/strict";
import { test } from "node:test";
import { extractTailLinesPreview, streamingContentSignature } from "./preview-tail-lines.ts";

test("extractTailLinesPreview returns full text when within max lines", () => {
  const result = extractTailLinesPreview("a\nb\nc", 4);
  assert.equal(result.tail, "a\nb\nc");
  assert.equal(result.omitted, 0);
  assert.equal(result.lineCount, 3);
});

test("extractTailLinesPreview keeps last N lines", () => {
  const result = extractTailLinesPreview("1\n2\n3\n4\n5", 2);
  assert.equal(result.tail, "4\n5");
  assert.equal(result.omitted, 3);
  assert.equal(result.lineCount, 5);
});

test("streamingContentSignature changes when tail grows", () => {
  const a = streamingContentSignature("hello");
  const b = streamingContentSignature("hello world");
  assert.notEqual(a, b);
});
