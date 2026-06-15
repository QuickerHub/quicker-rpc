import assert from "node:assert/strict";
import { test } from "node:test";

import {
  chooseRecoveryDecision,
  formatRecoveryDecisionForPrompt,
} from "./agent-recovery-policy.ts";

test("chooseRecoveryDecision prefers required next action", () => {
  const decision = chooseRecoveryDecision([
    {
      toolName: "workspace_program",
      nextActions: [
        {
          tool: "workspace_program",
          reason: "Optional follow-up",
          priority: "optional",
        },
        {
          tool: "workspace_program",
          reason: "Fix diagnostics",
          priority: "required",
          input: { action: "read_data" },
        },
      ],
    },
  ]);

  assert.equal(decision.kind, "next_action");
  assert.equal(decision.kind === "next_action" && decision.action.priority, "required");
  assert.equal(
    decision.kind === "next_action" && decision.action.input?.action,
    "read_data",
  );
});

test("chooseRecoveryDecision asks user when feedback requires decision", () => {
  const decision = chooseRecoveryDecision([
    {
      toolName: "qkrpc_action_move",
      summary: "Destination slot is occupied.",
      userDecisionRequired: true,
      nextActions: [
        {
          tool: "qkrpc_action_move",
          reason: "Swap with occupant",
          priority: "recommended",
        },
      ],
    },
  ]);

  assert.deepEqual(decision, {
    kind: "ask_user",
    sourceTool: "qkrpc_action_move",
    reason: "Destination slot is occupied.",
  });
});

test("formatRecoveryDecisionForPrompt renders next action", () => {
  const block = formatRecoveryDecisionForPrompt({
    kind: "next_action",
    sourceTool: "workspace_program",
    action: {
      tool: "workspace_program",
      reason: "Run diagnostics",
      priority: "recommended",
      input: { action: "diagnostics", waitMs: 30000 },
    },
  });

  assert.ok(block.includes("## Recovery decision"));
  assert.ok(block.includes("Prefer next tool: workspace_program"));
  assert.ok(block.includes("\"waitMs\":30000"));
});

test("formatRecoveryDecisionForPrompt omits empty decision", () => {
  assert.equal(formatRecoveryDecisionForPrompt({ kind: "none" }), "");
});
