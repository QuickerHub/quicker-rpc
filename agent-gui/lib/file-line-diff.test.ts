import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCollapsedDiffTexts,
  buildInterleavedDiffDisplay,
  computeLineDiff,
  countLineDiffStats,
  countUnifiedDiffDisplayLines,
  FILE_DIFF_NO_COLLAPSE,
  firstChangedDisplayLineNumber,
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

test("countUnifiedDiffDisplayLines uses interleaved line count", () => {
  assert.equal(countUnifiedDiffDisplayLines("a\nb", "a\nB"), 3);
});

test("buildInterleavedDiffDisplay lists deletes and inserts on separate lines", () => {
  const display = buildInterleavedDiffDisplay(
    '{\n  "variables": []\n}\n',
    '{\n  "variables": [\n    { "key": "title" }\n  ]\n}\n',
    { minEqualCollapse: 999 },
  );
  assert.ok(display.lineKinds.includes("delete"));
  assert.ok(display.lineKinds.includes("insert"));
  assert.ok(!display.text.includes('[]} "'));
});

test("buildInterleavedDiffDisplay shows full interleaved diff for heavy data.json rewrite", () => {
  const old = `{
  "steps": [],
  "variables": []
}
`;
  const neu = `{
  "variables": [
    { "key": "title", "type": 0, "defaultValue": "" },
    { "key": "tags", "type": 0, "defaultValue": "" }
  ],
  "steps": [
    { "stepRunnerKey": "sys:form", "inputParams": {} },
    { "stepRunnerKey": "sys:notify", "inputParams": {} }
  ]
}
`;
  const display = buildInterleavedDiffDisplay(old, neu, {
    minEqualCollapse: FILE_DIFF_NO_COLLAPSE,
  });
  assert.ok(!display.text.includes("变更前"));
  assert.ok(!display.text.includes("变更后"));
  assert.ok(display.lineKinds.includes("delete"));
  assert.ok(display.lineKinds.includes("insert"));
  assert.ok(display.displayLineCount > 10);
});

test("firstChangedDisplayLineNumber skips leading equal context", () => {
  const oldLines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
  const newLines = [...oldLines];
  newLines[10] = "LINE 10";
  const display = buildInterleavedDiffDisplay(
    `${oldLines.join("\n")}\n`,
    `${newLines.join("\n")}\n`,
    { minEqualCollapse: 3 },
  );
  const idx = display.lineKinds.findIndex(
    (k) => k === "delete" || k === "insert",
  );
  assert.ok(idx >= 0);
  assert.equal(firstChangedDisplayLineNumber(display.lineKinds), idx + 1);
});

test("buildCollapsedDiffTexts folds long unchanged runs", () => {
  const oldLines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
  const newLines = [...oldLines];
  newLines[10] = "LINE 10";
  const oldText = `${oldLines.join("\n")}\n`;
  const newText = `${newLines.join("\n")}\n`;
  const collapsed = buildCollapsedDiffTexts(oldText, newText);
  assert.ok(collapsed.displayLineCount < 20);
  assert.ok(!collapsed.removed.includes("行未修改"));
  assert.ok(!collapsed.removed.includes("行已省略"));
  assert.deepEqual(
    countLineDiffStats(oldText, newText),
    { addLines: 1, removeLines: 1 },
  );
});
