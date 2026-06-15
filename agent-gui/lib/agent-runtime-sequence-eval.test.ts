import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGENT_RUNTIME_SEQUENCE_SCENARIOS,
  evaluateAgentRuntimeSequenceScenario,
  evaluateAgentRuntimeSequenceScenarios,
} from "./agent-runtime-sequence-eval.ts";

describe("agent-runtime-sequence-eval", () => {
  it("has unique scenario ids and non-empty steps", () => {
    const ids = new Set<string>();
    for (const scenario of AGENT_RUNTIME_SEQUENCE_SCENARIOS) {
      assert.ok(scenario.id.length > 0);
      assert.ok(scenario.label.length > 0);
      assert.ok(scenario.steps.length > 0, scenario.id);
      assert.ok(!ids.has(scenario.id), `duplicate id: ${scenario.id}`);
      ids.add(scenario.id);
    }
  });

  it("passes all bundled sequence scenarios", () => {
    const results = evaluateAgentRuntimeSequenceScenarios();
    assert.deepEqual(
      results.filter((result) => !result.passed),
      [],
    );
  });

  it("reports step-level failures", () => {
    const result = evaluateAgentRuntimeSequenceScenario({
      id: "broken",
      label: "Broken",
      steps: [
        {
          label: "bad step",
          toolName: "workspace_program",
          feedback: {
            nextActions: [
              {
                tool: "workspace_program",
                reason: "Run diagnostics",
                input: { action: "diagnostics" },
              },
            ],
          },
          expect: {
            decision: "next_action",
            tool: "workspace_program",
            action: "read_data",
          },
        },
      ],
    });

    assert.equal(result.passed, false);
    assert.ok(result.failures.some((failure) => failure.includes("bad step")));
    assert.ok(result.failures.some((failure) => failure.includes("diagnostics")));
  });
});
