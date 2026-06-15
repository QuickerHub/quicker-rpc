import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  AgentEvalRuntimeMetadata,
  AgentEvalToolCall,
} from "@/lib/agent-eval/types";
import { evaluateTraceRubric } from "@/lib/agent-eval/trace-rubric";

function call(
  toolName: string,
  input: Record<string, unknown>,
): AgentEvalToolCall {
  return { toolName, state: "output-available", input };
}

function runtime(
  turnState: Record<string, unknown> | null,
  recoveryDecision: Record<string, unknown> = { kind: "none" },
): AgentEvalRuntimeMetadata {
  return {
    feedbackCount: 0,
    recoveryDecision,
    turnState,
  };
}

describe("agent-eval trace-rubric", () => {
  it("passes a clean search → get → patch flow", () => {
    const result = evaluateTraceRubric(
      [
        call("qkrpc_step_runner_search", { query: "expr" }),
        call("qkrpc_step_runner_get", { key: "sys:evalexpression" }),
        call("workspace_program", { action: "patch", path: "data.json" }),
        call("workspace_program", { action: "diagnostics", waitMs: 30000 }),
      ],
      { taskId: "clip-lines-expr" },
    );
    assert.equal(result.passed, true);
    assert.deepEqual(result.violations, []);
  });

  it("flags patch followed by action_get", () => {
    const result = evaluateTraceRubric([
      call("workspace_program", { action: "patch" }),
      call("qkrpc_action_get", { id: "x" }),
    ]);
    assert.equal(result.passed, false);
    assert.ok(result.violations.some((v) => v.includes("patch followed by")));
  });

  it("flags inputParams patch before step_runner_get", () => {
    const result = evaluateTraceRubric([
      call("workspace_program", {
        action: "patch",
        inputParams: { expression: "1" },
      }),
    ]);
    assert.equal(result.passed, false);
    assert.ok(result.violations.some((v) => v.includes("before qkrpc_step_runner_get")));
  });

  it("flags csscript on clip-lines-expr", () => {
    const result = evaluateTraceRubric(
      [call("workspace_program", { action: "patch", stepKey: "sys:csscript" })],
      { taskId: "clip-lines-expr" },
    );
    assert.equal(result.passed, false);
    assert.ok(result.violations.some((v) => v.includes("csscript")));
  });

  it("flags inline steps JSON in patch", () => {
    const result = evaluateTraceRubric(
      [
        call("workspace_program", {
          action: "patch",
          steps: [{ key: "delay" }],
        }),
      ],
      { taskId: "regression-no-inline-patch-json" },
    );
    assert.equal(result.passed, false);
    assert.ok(result.violations.some((v) => v.includes("inline")));
  });

  it("passes authoring runtime metadata with expected intent, risk, and tools", () => {
    const result = evaluateTraceRubric(
      [call("workspace_program", { action: "diagnostics" })],
      {
        chatMode: "agent",
        readOnly: false,
        runtimeMetadata: [
          runtime({
            intent: "action_authoring",
            recommendedToolIds: ["docs", "workspace_program"],
            risk: "write",
          }),
        ],
        source: "authoring",
      },
    );

    assert.equal(result.passed, true);
  });

  it("flags authoring runtime metadata without workspace_program recommendation", () => {
    const result = evaluateTraceRubric([], {
      chatMode: "agent",
      readOnly: false,
      runtimeMetadata: [
        runtime({
          intent: "action_authoring",
          recommendedToolIds: ["docs"],
          risk: "write",
        }),
      ],
      source: "authoring",
    });

    assert.equal(result.passed, false);
    assert.ok(result.violations.some((v) => v.includes("workspace_program")));
  });

  it("flags read-only runtime metadata with write risk", () => {
    const result = evaluateTraceRubric([], {
      chatMode: "agent",
      readOnly: true,
      runtimeMetadata: [
        runtime({
          intent: "workspace_navigation",
          recommendedToolIds: ["Read"],
          risk: "write",
        }),
      ],
      source: "agent-gui",
    });

    assert.equal(result.passed, false);
    assert.ok(result.violations.some((v) => v.includes("expected read")));
  });

  it("allows patch without diagnostics when recovery recommends diagnostics", () => {
    const result = evaluateTraceRubric(
      [call("workspace_program", { action: "patch" })],
      {
        runtimeMetadata: [
          runtime(
            {
              intent: "action_authoring",
              recommendedToolIds: ["workspace_program"],
              risk: "write",
            },
            {
              kind: "next_action",
              action: {
                tool: "workspace_program",
                input: { action: "diagnostics" },
              },
            },
          ),
        ],
        source: "authoring",
      },
    );

    assert.equal(result.passed, true);
  });

  it("flags patch without diagnostics or recovery diagnostics recommendation", () => {
    const result = evaluateTraceRubric(
      [call("workspace_program", { action: "patch" })],
      {
        runtimeMetadata: [
          runtime({
            intent: "action_authoring",
            recommendedToolIds: ["workspace_program"],
            risk: "write",
          }),
        ],
        source: "authoring",
      },
    );

    assert.equal(result.passed, false);
    assert.ok(result.violations.some((v) => v.includes("recommend diagnostics")));
  });

  it("flags mutation calls when runtime recovery asks the user", () => {
    const result = evaluateTraceRubric(
      [call("qkrpc_action_move", { actionId: "a", x: 1, y: 2 })],
      {
        runtimeMetadata: [
          runtime(null, {
            kind: "ask_user",
            sourceTool: "qkrpc_action_move",
            reason: "Destination slot is occupied.",
          }),
        ],
      },
    );

    assert.equal(result.passed, false);
    assert.ok(result.violations.some((v) => v.includes("asked user")));
  });
});
