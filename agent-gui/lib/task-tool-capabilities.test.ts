import assert from "node:assert/strict";
import { test } from "node:test";
import { tool, type ToolExecutionOptions } from "ai";
import { z } from "zod";
import { selectSubagentTools } from "./task-tool-capabilities";
import { applyToolCallPolicies } from "./agent-tool-policy";
import { isStructuredToolResult } from "./tool-result";

const options = { toolCallId: "test-call", messages: [] } as ToolExecutionOptions;

test("subagent can only narrow effective parent capabilities and cannot recurse", () => {
  const parent = { Read: tool({ inputSchema: z.object({}), execute: async () => "read" }), task: tool({ inputSchema: z.object({}) }) };
  assert.deepEqual(Object.keys(selectSubagentTools(parent, undefined)), ["Read"]);
  assert.deepEqual(selectSubagentTools(parent, []), {});
  assert.deepEqual(selectSubagentTools(parent, ["Write", "dev_frontend_check", "task"]), {});
  const child = selectSubagentTools(parent, ["Read", "Write"]);
  assert.equal(child.Read, parent.Read);
  assert.deepEqual(Object.keys(child), ["Read"]);
});

test("children and parent share the same policy counters", async () => {
  let calls = 0;
  const parent = applyToolCallPolicies({ Read: tool({
    inputSchema: z.object({ value: z.number() }),
    execute: async () => ++calls,
  }) }, { Read: { maxCallsPerTurn: 2, maxIdenticalCallsPerTurn: 1 } });
  const firstChild = selectSubagentTools(parent, ["Read"]);
  const secondChild = selectSubagentTools(parent, undefined);
  assert.equal(await firstChild.Read.execute!({ value: 1 }, options), 1);
  const repeated = await secondChild.Read.execute!({ value: 1 }, options);
  assert.ok(isStructuredToolResult(repeated));
  assert.equal(repeated.ok, false);
  const exhausted = await parent.Read.execute!({ value: 2 }, options);
  assert.ok(isStructuredToolResult(exhausted));
  assert.equal(exhausted.ok, false);
  assert.equal(calls, 1);
});

test("delegation retains approval and model-output policy on inherited definitions", () => {
  const definition = tool({
    inputSchema: z.object({}), needsApproval: true,
    execute: async () => "secret",
    toModelOutput: () => ({ type: "text", value: "redacted" }),
  });
  const child = selectSubagentTools({ guarded: definition }, undefined);
  assert.equal(child.guarded, definition);
  assert.equal(child.guarded.needsApproval, true);
  assert.equal(child.guarded.toModelOutput, definition.toModelOutput);
});
