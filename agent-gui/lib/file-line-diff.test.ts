import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeLineDiff,
  countLineDiffStats,
  countUnifiedDiffDisplayLines,
} from "./file-line-diff";

test("countLineDiffStats counts insert/delete not whole file lines", () => {
  assert.deepEqual(countLineDiffStats("a\nb\nc", "a\nB\nc"), {
    addLines: 1,
    removeLines: 1,
  });
  assert.deepEqual(countLineDiffStats('{"a":1}', '{"a":2}'), {
    addLines: 1,
    removeLines: 1,
  });
});

test("computeLineDiff interleaves equal context with changes", () => {
  const rows = computeLineDiff("keep\nold\nend", "keep\nnew\nend");
  assert.deepEqual(
    rows.map((r) => r.kind),
    ["equal", "delete", "insert", "equal"],
  );
  assert.equal(rows[1].text, "old");
  assert.equal(rows[2].text, "new");
});

test("add-only file is all inserts", () => {
  assert.deepEqual(countLineDiffStats("", "a\nb"), {
    addLines: 2,
    removeLines: 0,
  });
});

test("remove-only yields delete rows", () => {
  assert.deepEqual(countLineDiffStats("x\ny", ""), {
    addLines: 0,
    removeLines: 2,
  });
});

test("countUnifiedDiffDisplayLines includes context lines", () => {
  assert.equal(countUnifiedDiffDisplayLines("a\nb", "a\nB"), 3);
});
