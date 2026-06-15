import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGENT_RUNTIME_EVAL_SCENARIOS,
  evaluateAgentRuntimeScenario,
  evaluateAgentRuntimeScenarios,
} from "./agent-runtime-eval.ts";

describe("agent-runtime-eval", () => {
  it("has unique scenario ids and natural-language prompts", () => {
    const ids = new Set<string>();
    for (const scenario of AGENT_RUNTIME_EVAL_SCENARIOS) {
      assert.ok(scenario.id.length > 0);
      assert.ok(scenario.label.length > 0);
      assert.ok(scenario.userText.length >= 10, scenario.id);
      assert.ok(!ids.has(scenario.id), `duplicate id: ${scenario.id}`);
      ids.add(scenario.id);
      assert.ok(
        !/workspace_program|qkrpc_action_|qkrpc_step_runner/i.test(scenario.userText),
        `tool names leaked into prompt: ${scenario.id}`,
      );
    }
  });

  it("passes all bundled runtime scenarios", () => {
    const results = evaluateAgentRuntimeScenarios();
    assert.deepEqual(
      results.filter((result) => !result.passed),
      [],
    );
  });

  it("reports precise failures for a broken scenario", () => {
    const result = evaluateAgentRuntimeScenario({
      id: "broken",
      label: "Broken",
      chatMode: "agent",
      userText: "帮我修改动作",
      enabledToolIds: ["docs"],
      expect: {
        intent: "workspace",
        risk: "read",
        recommendedTools: ["workspace_program"],
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.failures.some((failure) => failure.startsWith("intent ")));
    assert.ok(result.failures.some((failure) => failure.startsWith("risk ")));
    assert.ok(
      result.failures.some((failure) =>
        failure.includes("missing recommended tool workspace_program"),
      ),
    );
  });
});
