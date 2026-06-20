import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateSessionRules } from "./session-rules.ts";
import type { SessionToolCall } from "./types.ts";

function call(
  toolName: string,
  input?: Record<string, unknown>,
): SessionToolCall {
  return {
    toolName,
    input,
    state: "output-available",
  };
}

test("duplicate-action-create detected in session rules", () => {
  const toolCalls = [
    {
      ...call("qkrpc_action_create"),
      output: { ok: true, data: { ok: true, actionId: "abc-123" } },
    },
    call("qkrpc_action_create"),
  ];
  const findings = evaluateSessionRules(toolCalls, {
    userTurnCount: 1,
    toolCallCount: toolCalls.length,
  });
  assert.ok(findings.some((f) => f.ruleId === "duplicate-action-create"));
});

test("duplicate-action-create ignored when first create failed", () => {
  const toolCalls = [
    {
      ...call("qkrpc_action_create"),
      output: { ok: true, data: { ok: false, message: "Unknown icon" } },
    },
    {
      ...call("qkrpc_action_create"),
      output: { ok: true, data: { ok: true, actionId: "abc-456" } },
    },
  ];
  const findings = evaluateSessionRules(toolCalls, {
    userTurnCount: 1,
    toolCallCount: toolCalls.length,
  });
  assert.equal(findings.some((f) => f.ruleId === "duplicate-action-create"), false);
});

test("create-then-read-data skips when patch follows create first", () => {
  const toolCalls = [
    call("qkrpc_action_create"),
    call("workspace_program", { action: "patch" }),
    call("workspace_program", { action: "read_data" }),
  ];
  const findings = evaluateSessionRules(toolCalls, {
    userTurnCount: 1,
    toolCallCount: toolCalls.length,
  });
  assert.equal(
    findings.some((f) => f.ruleId === "create-then-read-data"),
    false,
  );
});

test("create-then-read-data fires on direct read after create", () => {
  const toolCalls = [
    call("qkrpc_action_create"),
    call("workspace_program", { action: "read_data" }),
  ];
  const findings = evaluateSessionRules(toolCalls, {
    userTurnCount: 1,
    toolCallCount: toolCalls.length,
  });
  assert.ok(findings.some((f) => f.ruleId === "create-then-read-data"));
});
