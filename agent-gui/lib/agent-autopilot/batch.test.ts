import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AUTOPILOT_CORE_SCENARIO_IDS,
  resolveAutopilotScenarioIds,
} from "./batch.ts";

test("resolveAutopilotScenarioIds expands autopilot-core preset", () => {
  const ids = resolveAutopilotScenarioIds({ preset: "autopilot-core" });
  assert.deepEqual(ids, [...AUTOPILOT_CORE_SCENARIO_IDS]);
});

test("resolveAutopilotScenarioIds respects limit", () => {
  const ids = resolveAutopilotScenarioIds({ preset: "autopilot-core", limit: 1 });
  assert.deepEqual(ids, AUTOPILOT_CORE_SCENARIO_IDS.slice(0, 1));
});

test("resolveAutopilotScenarioIds accepts explicit ids", () => {
  const ids = resolveAutopilotScenarioIds({ ids: ["user-action-likes-total"] });
  assert.deepEqual(ids, ["user-action-likes-total"]);
});
