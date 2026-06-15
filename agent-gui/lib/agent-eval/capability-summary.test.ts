import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  aggregateAgentEvalCapabilitySummaries,
  buildAgentEvalCapabilitySummary,
  formatAgentEvalCapabilityAggregate,
  formatAgentEvalCapabilitySummary,
} from "@/lib/agent-eval/capability-summary";
import type {
  AgentEvalRuntimeMetadata,
  AgentEvalToolCall,
} from "@/lib/agent-eval/types";

function call(
  toolName: string,
  input: Record<string, unknown> = {},
): AgentEvalToolCall {
  return { toolName, state: "output-available", input };
}

const runtimeMetadata: AgentEvalRuntimeMetadata[] = [
  {
    feedbackCount: 1,
    recoveryDecision: { kind: "next_action" },
    turnState: {
      intent: "action_authoring",
      risk: "write",
      recommendedToolIds: ["workspace_program"],
    },
  },
];

function item(
  summary: ReturnType<typeof buildAgentEvalCapabilitySummary>,
  axis: string,
) {
  const found = summary.items.find((entry) => entry.axis === axis);
  assert.ok(found, `missing axis ${axis}`);
  return found;
}

describe("agent-eval capability-summary", () => {
  it("marks runtime axes unknown when metadata was not captured", () => {
    const summary = buildAgentEvalCapabilitySummary({
      toolCalls: [call("workspace_program", { action: "diagnostics" })],
      traceRubric: { passed: true, violations: [] },
    });

    assert.equal(summary.passed, true);
    assert.equal(item(summary, "runtime_intent").status, "unknown");
    assert.equal(item(summary, "runtime_risk").status, "unknown");
    assert.equal(item(summary, "recovery").status, "unknown");
    assert.equal(item(summary, "verification").status, "pass");
  });

  it("maps rubric violations to capability axes", () => {
    const summary = buildAgentEvalCapabilitySummary({
      runtimeMetadata,
      toolCalls: [call("workspace_program", { action: "patch" })],
      traceRubric: {
        passed: false,
        violations: [
          "E: runtime intent expected action_authoring, got workspace_navigation",
          "E: runtime risk expected write, got read",
          "E: runtime recovery should recommend diagnostics after workspace_program patch",
          "E: patch with inputParams before qkrpc_step_runner_get",
        ],
      },
    });

    assert.equal(summary.passed, false);
    assert.equal(item(summary, "runtime_intent").status, "fail");
    assert.equal(item(summary, "runtime_risk").status, "fail");
    assert.equal(item(summary, "recovery").status, "fail");
    assert.equal(item(summary, "tool_protocol").status, "fail");
  });

  it("marks verification unknown when diagnostics were not observed", () => {
    const summary = buildAgentEvalCapabilitySummary({
      runtimeMetadata,
      toolCalls: [call("workspace_program", { action: "read_data" })],
      traceRubric: { passed: true, violations: [] },
    });

    assert.equal(summary.passed, true);
    assert.equal(item(summary, "verification").status, "unknown");
  });

  it("formats a compact CLI summary", () => {
    const summary = buildAgentEvalCapabilitySummary({
      runtimeMetadata,
      toolCalls: [call("workspace_program", { action: "diagnostics" })],
      traceRubric: { passed: true, violations: [] },
    });

    assert.match(
      formatAgentEvalCapabilitySummary(summary),
      /tool_protocol=pass .*verification=pass/,
    );
  });

  it("aggregates capability status counts across reports", () => {
    const pass = buildAgentEvalCapabilitySummary({
      runtimeMetadata,
      toolCalls: [call("workspace_program", { action: "diagnostics" })],
      traceRubric: { passed: true, violations: [] },
    });
    const fail = buildAgentEvalCapabilitySummary({
      runtimeMetadata,
      toolCalls: [call("workspace_program", { action: "patch" })],
      traceRubric: {
        passed: false,
        violations: ["E: runtime risk expected write, got read"],
      },
    });

    const aggregate = aggregateAgentEvalCapabilitySummaries([
      { capabilitySummary: pass },
      { capabilitySummary: fail },
      {},
    ]);

    const risk = aggregate.axes.find((axis) => axis.axis === "runtime_risk");
    assert.deepEqual(risk, {
      axis: "runtime_risk",
      pass: 1,
      fail: 1,
      unknown: 1,
    });
    assert.match(
      formatAgentEvalCapabilityAggregate(aggregate),
      /runtime_risk=P1\/F1\/U1/,
    );
  });
});
