import assert from "node:assert/strict";
import test from "node:test";
import { tool, type ToolExecutionOptions } from "ai";
import { z } from "zod";

import { applyToolCallPolicies, createToolCallPolicyGate, resolveToolCallPolicy } from "@/lib/agent-tool-policy";
import { isStructuredToolResult } from "@/lib/tool-result";

const executionOptions = {
  toolCallId: "call-1",
  messages: [],
} as unknown as ToolExecutionOptions;

test("applyToolCallPolicies rejects repeated identical calls per turn", async () => {
  let executions = 0;
  const tools = applyToolCallPolicies({
    sample: tool({
      description: "sample",
      inputSchema: z.object({ value: z.number() }),
      execute: async () => ({ value: ++executions }),
    }),
  }, {
    sample: { maxCallsPerTurn: 5, maxIdenticalCallsPerTurn: 1 },
  });

  const first = await tools.sample.execute!({ value: 1 }, executionOptions);
  const second = await tools.sample.execute!({ value: 1 }, executionOptions);
  assert.deepEqual(first, { value: 1 });
  assert.ok(isStructuredToolResult(second));
  assert.equal(second.ok, false);
  assert.equal((second.data as { errorCode: string }).errorCode, "tool_call_limit");
  assert.equal(executions, 1);
});

test("call counters are isolated by wrapper instance", async () => {
  const definition = tool({
    description: "sample",
    inputSchema: z.object({}),
    execute: async () => "ok",
  });
  const policy = { sample: { maxCallsPerTurn: 1, maxIdenticalCallsPerTurn: 1 } };
  const firstTurn = applyToolCallPolicies({ sample: definition }, policy);
  const secondTurn = applyToolCallPolicies({ sample: definition }, policy);
  assert.equal(await firstTurn.sample.execute!({}, executionOptions), "ok");
  assert.equal(await secondTurn.sample.execute!({}, executionOptions), "ok");
});

test("client gates share the server thresholds and stable input counters across reads and edits", () => {
  const gate = createToolCallPolicyGate();
  const policy = resolveToolCallPolicy("workspace_program");
  for (let index = 0; index < policy.maxIdenticalCallsPerTurn; index++) {
    assert.equal(gate.consume("workspace_program", index % 2 ? { extra: 1, action: "read_live" } : { action: "read_live", extra: 1 }), undefined);
  }
  const repeated = gate.consume("workspace_program", { action: "read_live", extra: 1 })!;
  assert.equal(repeated.ok, false);
  assert.equal((repeated.data as { limitKind: string }).limitKind, "identical");
  for (let index = policy.maxIdenticalCallsPerTurn + 1; index < policy.maxCallsPerTurn; index++) {
    assert.equal(gate.consume("workspace_program", { action: "edit_live", note: String(index) }), undefined);
  }
  const exhausted = gate.consume("workspace_program", { action: "edit_live", note: "final" })!;
  assert.equal((exhausted.data as { limitKind: string }).limitKind, "total");
  assert.equal(createToolCallPolicyGate().consume("workspace_program", { action: "read_live" }), undefined);
});

test("client gates capture overrides without sharing budgets between tools", () => {
  const overrides = { sample: { maxCallsPerTurn: 1, maxIdenticalCallsPerTurn: 1 } };
  const gate = createToolCallPolicyGate(overrides);
  overrides.sample.maxCallsPerTurn = 10;
  assert.equal(gate.consume("sample", {}), undefined);
  assert.equal(gate.consume("other", {}), undefined);
  assert.equal(gate.consume("sample", { changed: true })?.ok, false);
});

