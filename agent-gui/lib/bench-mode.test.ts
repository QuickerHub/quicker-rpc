import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildMockToolRegistry,
  selectChatToolsFromRegistry,
} from "@/lib/chat-tool-selection";
import { defaultEnabledToolIds } from "@/lib/tool-registry";
import {
  BENCH_MODE_EXCLUDED_TOOL_IDS,
  filterToolIdsForBenchMode,
  isBenchModeExcludedTool,
} from "@/lib/bench-mode";

test("bench mode excludes web exploration tools", () => {
  assert.ok(BENCH_MODE_EXCLUDED_TOOL_IDS.includes("web_search"));
  assert.ok(BENCH_MODE_EXCLUDED_TOOL_IDS.includes("browser"));
  assert.equal(isBenchModeExcludedTool("browser"), true);
  assert.equal(isBenchModeExcludedTool("workspace_program"), false);
});

test("filterToolIdsForBenchMode removes exploration tools", () => {
  const input = ["docs", "qkrpc_action_query", "browser", "workspace_program"];
  assert.deepEqual(filterToolIdsForBenchMode(input), [
    "docs",
    "qkrpc_action_query",
    "workspace_program",
  ]);
});

test("selectChatToolsFromRegistry benchMode hides web_search and browser", () => {
  const pool = defaultEnabledToolIds();
  const tools = selectChatToolsFromRegistry(buildMockToolRegistry(pool), {
    chatMode: "agent",
    enabledToolIds: pool,
    titleTest: false,
    benchMode: true,
    userText: "做一个 Quicker 动作",
  });
  assert.equal("qkrpc_action_query" in tools, true);
  assert.equal("browser" in tools, false);
  assert.equal("web_search" in tools, false);
  assert.equal("workspace_program" in tools, true);
});
