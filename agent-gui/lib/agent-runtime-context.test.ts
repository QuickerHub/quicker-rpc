import assert from "node:assert/strict";
import { test } from "node:test";

import { formatChatRuntimeContext } from "./agent-runtime-context.ts";

test("formatChatRuntimeContext includes stable operational context", () => {
  const block = formatChatRuntimeContext({
    now: new Date("2026-06-14T02:30:00+08:00"),
    mode: "agent",
    cwd: "D:/repo",
    modelId: "test-model",
    enabledToolIds: ["workspace_file", "docs", "docs"],
  });

  assert.ok(block.includes("## Runtime context"));
  assert.ok(block.includes("2026-06-14"));
  assert.ok(block.includes("Asia/Shanghai"));
  assert.ok(block.includes("Mode: agent"));
  assert.ok(block.includes("Model: test-model"));
  assert.ok(block.includes("Working directory: D:/repo"));
  assert.ok(block.includes("Enabled tools: docs, workspace_file"));
  assert.ok(block.includes("use web_search"));
});

test("formatChatRuntimeContext describes launcher mode", () => {
  const block = formatChatRuntimeContext({
    now: new Date("2026-06-14T02:30:00+08:00"),
    mode: "launcher",
    enabledToolIds: [],
  });

  assert.ok(block.includes("Mode: launcher (quick commands)"));
  assert.ok(block.includes("No user-enabled tools."));
});
