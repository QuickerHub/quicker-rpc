import assert from "node:assert/strict";
import { test } from "node:test";
import { QUICKERBENCH_CORE_TASK_IDS } from "@/lib/quickerbench/catalog-types";
import {
  COMPOSER_TEST_PROMPT_GROUPS,
  COMPOSER_TEST_PROMPTS,
} from "./composer-test-prompts.ts";

test("composer test prompts mirror quickerbench core tasks", () => {
  const ids = new Set<string>();
  assert.equal(COMPOSER_TEST_PROMPTS.length, QUICKERBENCH_CORE_TASK_IDS.length);
  for (const ex of COMPOSER_TEST_PROMPTS) {
    assert.ok(ex.userText.trim().length >= 24, ex.id);
    assert.ok(!ids.has(ex.id), ex.id);
    ids.add(ex.id);
    assert.ok(!ex.assistantText, ex.id);
    assert.match(ex.description, /入 .+ → 出 .+/);
  }
  assert.deepEqual(
    new Set(COMPOSER_TEST_PROMPTS.map((ex) => ex.id)),
    new Set(QUICKERBENCH_CORE_TASK_IDS),
  );
  assert.deepEqual(COMPOSER_TEST_PROMPTS.map((ex) => ex.id), [
    "user-action-likes-total",
  ]);
  const groupIds = COMPOSER_TEST_PROMPT_GROUPS.map((group) => group.id);
  assert.deepEqual(groupIds, ["quickerbench-q3"]);
});
