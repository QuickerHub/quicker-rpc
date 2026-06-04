import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeThreadTitle } from "./thread-title.ts";
import {
  isTitleWithinSidebarLimit,
  measureTitleDisplayUnits,
  truncateTitleToDisplayUnits,
} from "./thread-title-display.ts";

test("measureTitleDisplayUnits: CJK counts wider than Latin", () => {
  assert.ok(measureTitleDisplayUnits("剪贴板去重") > measureTitleDisplayUnits("clip"));
  assert.equal(measureTitleDisplayUnits("clipboard"), 9);
  assert.equal(measureTitleDisplayUnits("剪贴"), 4);
});

test("English titles can use more letters than Han char cap", () => {
  const en = "Clipboard line dedupe";
  assert.ok(en.length > 18);
  assert.ok(isTitleWithinSidebarLimit(en));
  assert.equal(sanitizeThreadTitle(en), en);
});

test("truncateTitleToDisplayUnits shortens long Chinese by width not char index", () => {
  const long =
    "新建动作：读剪贴板文本，按行去重、排序后写回，并提示处理前后行数。";
  const cut = truncateTitleToDisplayUnits(long);
  assert.ok(isTitleWithinSidebarLimit(cut));
  assert.ok(cut.length > 10);
  assert.ok(cut.endsWith("…"));
});

test("isTitleWithinSidebarLimit rejects very long lines in either script", () => {
  const longCn =
    "新建动作：读剪贴板文本，按行去重、排序后写回，并提示处理前后行数。";
  const longEn =
    "Create an action to read clipboard lines dedupe sort and show counts";
  assert.equal(isTitleWithinSidebarLimit(longCn), false);
  assert.equal(isTitleWithinSidebarLimit(longEn), false);
});
