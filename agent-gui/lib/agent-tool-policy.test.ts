import assert from "node:assert/strict";
import test from "node:test";
import { tool, type ToolExecutionOptions } from "ai";
import { z } from "zod";

import { applyToolCallPolicies } from "@/lib/agent-tool-policy";
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

