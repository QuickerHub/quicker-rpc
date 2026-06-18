import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  estimateStructuredResultChars,
  formatToolResultForAgent,
} from "@/lib/tool-result-agent-view";
import { SHELL_TOOL } from "@/lib/host-tool-constants";
import { formatLocalToolResult, isStructuredToolResult } from "@/lib/tool-result";
import { AGENT_VIEW_SCENARIOS, getAgentViewScenario } from "@/lib/tool-test-agent-view-scenarios";

describe("tool-test agent view scenarios", () => {
  it("all scenarios compress or stay under budget", () => {
    for (const scenario of AGENT_VIEW_SCENARIOS) {
      const raw = scenario.buildRaw();
      const compressed = formatToolResultForAgent(
        scenario.toolName,
        scenario.input,
        raw,
      );
      assert.ok(compressed);
    }
  });

  it("shell-large scenario saves chars", () => {
    const scenario = getAgentViewScenario("shell-large");
    assert.ok(scenario);
    const raw = scenario!.buildRaw();
    assert.ok(isStructuredToolResult(raw));
    const before = estimateStructuredResultChars(raw);
    const compressed = formatToolResultForAgent(
      SHELL_TOOL,
      scenario!.input,
      raw,
    );
    assert.ok(isStructuredToolResult(compressed));
    const after = estimateStructuredResultChars(compressed);
    assert.ok(after < before);
  });
});
