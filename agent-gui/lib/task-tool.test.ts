import assert from "node:assert/strict";
import { test } from "node:test";

import { executeTaskTool } from "./task-tool.server.ts";

test("executeTaskTool rejects empty agent and prompt", async () => {
  const result = await executeTaskTool({});
  assert.equal(result.ok, false);
});

test("executeTaskTool rejects unknown subagent without throwing", async () => {
  const result = await executeTaskTool({
    agent: "nonexistent-subagent-xyz",
    prompt: "hello",
  });
  assert.equal(result.ok, false);
  const data = result.data as Record<string, unknown>;
  assert.match(String(data.errorMessage ?? ""), /Unknown subagent/i);
});
