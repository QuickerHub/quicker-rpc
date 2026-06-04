import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getDefaultTitleTestExample,
  TITLE_TEST_EXAMPLE_GROUPS,
  TITLE_TEST_EXAMPLES,
} from "./tool-test-title-examples.ts";
import { isTitleWithinSidebarLimit } from "./thread-title-display.ts";
import { buildTitleTestMessages, localReferenceTitle } from "./tool-test-title.ts";

test("title test examples have unique ids", () => {
  const ids = new Set<string>();
  for (const ex of TITLE_TEST_EXAMPLES) {
    assert.ok(ex.userText.trim().length > 0);
    assert.ok(!ids.has(ex.id), ex.id);
    ids.add(ex.id);
  }
});

test("example groups cover basics authoring and english", () => {
  const groupIds = TITLE_TEST_EXAMPLE_GROUPS.map((g) => g.id);
  assert.ok(groupIds.includes("basics"));
  assert.ok(groupIds.includes("authoring"));
  assert.ok(groupIds.includes("english"));
  assert.ok(TITLE_TEST_EXAMPLES.length >= 8);
  for (const ex of TITLE_TEST_EXAMPLES) {
    assert.ok(ex.description.length > 0);
  }
});

test("local reference title truncates long user line", () => {
  const ex = getDefaultTitleTestExample();
  const messages = buildTitleTestMessages(ex.userText, ex.assistantText);
  const local = localReferenceTitle(messages);
  assert.ok(local.length > 0);
  assert.ok(isTitleWithinSidebarLimit(local));
});
