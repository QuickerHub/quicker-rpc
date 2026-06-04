import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCollapsedDiffTexts,
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

test("countUnifiedDiffDisplayLines uses collapsed display height", () => {
  assert.equal(countUnifiedDiffDisplayLines("a\nb", "a\nB"), 2);
});

test("buildCollapsedDiffTexts folds long unchanged runs", () => {
  const oldLines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
  const newLines = [...oldLines];
  newLines[10] = "LINE 10";
  const oldText = `${oldLines.join("\n")}\n`;
  const newText = `${newLines.join("\n")}\n`;
  const collapsed = buildCollapsedDiffTexts(oldText, newText);
  assert.ok(collapsed.displayLineCount < 20);
  assert.ok(collapsed.removed.includes("行未修改"));
  assert.deepEqual(
    countLineDiffStats(oldText, newText),
    { addLines: 1, removeLines: 1 },
  );
});
