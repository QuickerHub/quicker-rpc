import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildMockToolRegistry,
  resolveChatToolIdsFromRegistry,
  resolveFullSchemaToolIdsForTurn,
  resolveToolBundleContext,
  selectChatToolsFromRegistry,
  restrictComposedTools,
} from "./chat-tool-selection.ts";
import { LIST_TOOLS_TOOL } from "./list-tools-tool.ts";
import { SET_THREAD_TITLE_TOOL } from "./thread-title-tool-messages.ts";
import { LAUNCHER_TOOL_IDS } from "./chat-mode.ts";
import { defaultEnabledToolIds } from "./tool-registry.ts";

const enabledPool = defaultEnabledToolIds();
const mockTools = buildMockToolRegistry(enabledPool);
const emptyScope = { pinnedLatest: undefined, pinnedLatestAll: [] };

test("empty user selection never restores the registry beyond internal tools", () => {
  const tools = selectChatToolsFromRegistry(mockTools, {
    chatMode: "agent", enabledToolIds: [], titleTest: false,
  });
  assert.deepEqual(Object.keys(tools).sort(), ["list_tools", "set_thread_title", "skill_load"]);
});

test("command allowlist is final over static, MCP and internal tools", () => {
  const composed = { Read: {}, list_tools: {}, mcp__demo__read: {}, mcp__demo__write: {} };
  assert.deepEqual(restrictComposedTools(composed, []), {});
  assert.deepEqual(Object.keys(restrictComposedTools(composed, ["mcp__demo__read"])), ["mcp__demo__read"]);
  assert.deepEqual(Object.keys(restrictComposedTools(composed, undefined)), Object.keys(composed));
});

test("resolveToolBundleContext derives full schemas from TurnPlan", () => {
  const ctx = resolveToolBundleContext({
    chatMode: "agent",
    enabledToolIds: enabledPool,
    userText: "创建动作并编辑步骤",
    actionScope: emptyScope,
  });
  assert.equal(ctx.turnPlan.intent, "quicker_authoring");
  assert.deepEqual(ctx.activeBundles, ctx.turnPlan.activeToolBundles);
  assert.deepEqual(
    [...ctx.fullSchemaToolIds].sort(),
    ctx.turnPlan.fullSchemaToolIds.sort(),
  );
  assert.ok(ctx.activeBundles.includes("action_authoring"));
  assert.ok(ctx.fullSchemaToolIds.has("workspace_program"));
  assert.equal(ctx.fullSchemaToolIds.has("qkrpc_profile_create"), false);
  assert.equal(ctx.fullSchemaToolIds.has("Shell"), false);
});

test("resolveFullSchemaToolIdsForTurn matches bundle context", () => {
  const ids = resolveFullSchemaToolIdsForTurn({
    chatMode: "agent",
    enabledToolIds: enabledPool,
    userText: "你好",
    actionScope: emptyScope,
  });
  assert.ok(ids.has("list_tools"));
  assert.ok(ids.has("Read"));
});

test("title test exposes only set_thread_title", () => {
  const tools = selectChatToolsFromRegistry(mockTools, {
    chatMode: "agent",
    enabledToolIds: enabledPool,
    titleTest: true,
  });
  assert.deepEqual(Object.keys(tools), [SET_THREAD_TITLE_TOOL]);
});

test("agent mode adds stable internal tools", () => {
  const ids = resolveChatToolIdsFromRegistry(mockTools, {
    chatMode: "agent",
    enabledToolIds: ["docs"],
  });
  assert.deepEqual(
    ids,
    ["docs", LIST_TOOLS_TOOL, SET_THREAD_TITLE_TOOL, "skill_load"].sort(),
  );
});

test("launcher mode omits set_thread_title", () => {
  const launcherPool = [...LAUNCHER_TOOL_IDS];
  const launcherTools = buildMockToolRegistry(launcherPool);
  const ids = resolveChatToolIdsFromRegistry(launcherTools, {
    chatMode: "launcher",
    enabledToolIds: launcherPool,
  });
  assert.equal(ids.includes(SET_THREAD_TITLE_TOOL), false);
  assert.ok(ids.includes(LIST_TOOLS_TOOL));
});

test("selection keeps enabled capabilities without a second intent filter", () => {
  const enabledToolIds = ["docs", "browser", "workspace_program"];
  const ids = resolveChatToolIdsFromRegistry(mockTools, {
    chatMode: "agent",
    enabledToolIds,
  });
  for (const id of enabledToolIds) assert.ok(ids.includes(id));
  assert.equal(ids.includes("web_search"), false);
});
