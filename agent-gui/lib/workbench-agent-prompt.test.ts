import assert from "node:assert/strict";
import { test } from "node:test";

import { WORKBENCH_AGENT_PROMPT } from "./workbench-agent-prompt.ts";

test("WORKBENCH_AGENT_PROMPT covers changed-files view and agent review behavior", () => {
  assert.ok(WORKBENCH_AGENT_PROMPT.includes("已改动"));
  assert.ok(WORKBENCH_AGENT_PROMPT.includes("StrReplace"));
  assert.ok(WORKBENCH_AGENT_PROMPT.includes("git status"));
  assert.ok(WORKBENCH_AGENT_PROMPT.includes("Diff"));
});
