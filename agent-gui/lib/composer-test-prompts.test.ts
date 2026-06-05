import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COMPOSER_TEST_PROMPT_GROUPS,
  COMPOSER_TEST_PROMPTS,
} from "./composer-test-prompts.ts";

test("composer test prompts are action-authoring samples only", () => {
  const ids = new Set<string>();
  assert.ok(COMPOSER_TEST_PROMPTS.length >= 8);
  for (const ex of COMPOSER_TEST_PROMPTS) {
    assert.ok(ex.userText.trim().length >= 24, ex.id);
    assert.ok(!ids.has(ex.id), ex.id);
    ids.add(ex.id);
    assert.ok(!ex.assistantText, ex.id);
  }
  const groupIds = COMPOSER_TEST_PROMPT_GROUPS.map((g) => g.id);
  assert.deepEqual(groupIds, ["new-action", "edit-action", "advanced"]);
});
