import assert from "node:assert/strict";
import { test } from "node:test";

import { filterEnabledToolsForTurn } from "./tool-intent-filter.ts";
import { TOOL_INTENT_SCENARIOS } from "./tool-intent-scenarios.ts";
import { defaultEnabledToolIds } from "./tool-registry.ts";

const enabledPool = defaultEnabledToolIds();

test("TOOL_INTENT_SCENARIOS ids are unique", () => {
  const ids = new Set<string>();
  for (const scenario of TOOL_INTENT_SCENARIOS) {
    assert.ok(!ids.has(scenario.id), `duplicate scenario id ${scenario.id}`);
    ids.add(scenario.id);
  }
});

test("every scenario mustInclude is in default enabled pool", () => {
  const pool = new Set(enabledPool);
  for (const scenario of TOOL_INTENT_SCENARIOS) {
    for (const id of scenario.mustInclude) {
      assert.ok(pool.has(id), `${scenario.id}: ${id} not in defaultEnabledToolIds`);
    }
  }
});

for (const scenario of TOOL_INTENT_SCENARIOS) {
  test(`tool intent scenario: ${scenario.id}`, () => {
    const filtered = filterEnabledToolsForTurn({
      chatMode: scenario.chatMode,
      enabledToolIds: enabledPool,
      intent: scenario.intent,
      actionScope: scenario.actionScope,
      actionDesigner: scenario.actionDesigner,
    });
    const filteredSet = new Set(filtered);

    for (const id of scenario.mustExclude) {
      assert.equal(
        filteredSet.has(id),
        false,
        `${scenario.id}: expected ${id} excluded`,
      );
    }
    for (const id of scenario.mustInclude) {
      assert.ok(filteredSet.has(id), `${scenario.id}: expected ${id} included`);
    }
  });
}
