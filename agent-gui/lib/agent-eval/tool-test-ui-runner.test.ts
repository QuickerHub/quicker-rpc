import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadEvalScenario } from "@/lib/agent-eval/eval-scenario";
import {
  buildToolTestEvalUrl,
  parseAgentRuntimeMetadataAttributes,
  parseToolTestEvalTabParam,
  resolveToolTestUiPanel,
} from "@/lib/agent-eval/tool-test-ui-runner";

describe("agent-eval tool-test-ui-runner", () => {
  it("maps chatMode to UI panel", () => {
    assert.equal(
      resolveToolTestUiPanel(loadEvalScenario("discover-step-expr")),
      "prompt-chat",
    );
    assert.equal(
      resolveToolTestUiPanel(loadEvalScenario("launcher-open-hotkeys")),
      "launcher",
    );
  });

  it("builds tool-test URL with tab and cwd", () => {
    const url = buildToolTestEvalUrl("http://127.0.0.1:3000", {
      tab: "prompt-chat",
      cwd: "D:\\fixtures\\eval-workspace",
    });
    assert.ok(url.includes("/tool-test?"));
    assert.ok(url.includes("tab=prompt-chat"));
    assert.ok(url.includes("cwd="));
  });

  it("parses tab query param", () => {
    assert.equal(parseToolTestEvalTabParam("launcher"), "launcher");
    assert.equal(parseToolTestEvalTabParam("invalid"), undefined);
  });

  it("parses runtime metadata attributes from tool-test DOM", () => {
    const metadata = parseAgentRuntimeMetadataAttributes([
      JSON.stringify({
        feedbackCount: 1,
        recoveryDecision: {
          kind: "next_action",
          action: { tool: "workspace_program", input: { action: "diagnostics" } },
        },
        turnState: {
          intent: "action_authoring",
          risk: "write",
          recommendedToolIds: ["workspace_program"],
        },
      }),
      "not-json",
      JSON.stringify({ recoveryDecision: { kind: "none" }, turnState: null }),
    ]);

    assert.equal(metadata.length, 2);
    assert.equal(metadata[0]?.feedbackCount, 1);
    assert.equal(metadata[0]?.turnState?.intent, "action_authoring");
    assert.equal(metadata[0]?.recoveryDecision.kind, "next_action");
    assert.equal(metadata[1]?.feedbackCount, 0);
    assert.equal(metadata[1]?.turnState, null);
  });
});
