import assert from "node:assert/strict";
import { test } from "node:test";

import { executeTaskTool } from "./task-tool.server.ts";

test("executeTaskTool rejects empty agent and prompt", async () => {
  const result = await executeTaskTool({});
  assert.equal(result.ok, false);
});

test("unbound task runtime fails closed before discovery or model access", async () => {
  const result = await executeTaskTool({
    agent: "nonexistent-subagent-xyz",
    prompt: "hello",
  });
  assert.equal(result.ok, false);
  const data = result.data as Record<string, unknown>;
  assert.equal(data.errorCode, "task_parent_runtime_required");
});

test("task cancellation preserves the caller's abort reason", async () => {
  const controller = new AbortController();
  const reason = new Error("cancelled by parent");
  controller.abort(reason);
  await assert.rejects(executeTaskTool({ agent: "unused", prompt: "unused" }, {
    tools: {}, abortSignal: controller.signal,
  }), (error: unknown) => error === reason);
});
