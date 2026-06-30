import assert from "node:assert/strict";
import { test } from "node:test";
import type { UIMessage } from "ai";

import {
  buildMockToolRegistry,
  resolveChatToolIdsFromRegistry,
  resolveFullSchemaToolIdsForTurn,
  resolveToolBundleContext,
  selectChatToolsFromRegistry,
} from "./chat-tool-selection.ts";
import { LIST_TOOLS_TOOL } from "./list-tools-tool.ts";
import { SET_THREAD_TITLE_TOOL } from "./thread-title-tool-messages.ts";
import { LAUNCHER_TOOL_IDS } from "./chat-mode.ts";
import { defaultEnabledToolIds } from "./tool-registry.ts";
import { TOOL_INTENT_SCENARIOS } from "./tool-intent-scenarios.ts";

const enabledPool = defaultEnabledToolIds();
const mockTools = buildMockToolRegistry(enabledPool);

test("resolveToolBundleContext loads action_authoring full schemas for write intent", () => {
  const ctx = resolveToolBundleContext({
    chatMode: "agent",
    enabledToolIds: enabledPool,
    userText: "创建动作并编辑步骤",
    actionScope: { pinnedLatest: undefined, pinnedLatestAll: [] },
  });
  assert.equal(ctx.turnPlan.intent, "quicker_authoring");
  assert.deepEqual(ctx.activeBundles, ctx.turnPlan.activeToolBundles);
  assert.deepEqual([...ctx.fullSchemaToolIds].sort(), ctx.turnPlan.fullSchemaToolIds.sort());
  assert.ok(ctx.activeBundles.includes("action_authoring"));
  assert.ok(ctx.fullSchemaToolIds.has("workspace_program"));
  assert.equal(ctx.fullSchemaToolIds.has("qkrpc_profile_create"), false);
  assert.equal(ctx.fullSchemaToolIds.has("Shell"), false);
});

test("resolveFullSchemaToolIdsForTurn matches bundle context", () => {
  const ids = resolveFullSchemaToolIdsForTurn({
    chatMode: "agent",
    enabledToolIds: enabledPool,
    titleTest: false,
    userText: "你好",
    actionScope: { pinnedLatest: undefined, pinnedLatestAll: [] },
  });
  assert.ok(ids.has("list_tools"));
  assert.ok(ids.has("Read"));
});

test("selectChatToolsFromRegistry titleTest exposes only set_thread_title", () => {
  const tools = selectChatToolsFromRegistry(mockTools, {
    chatMode: "agent",
    enabledToolIds: enabledPool,
    titleTest: true,
  });
  assert.deepEqual(Object.keys(tools), [SET_THREAD_TITLE_TOOL]);
});

test("selectChatToolsFromRegistry agent mode always-on list_tools and set_thread_title", () => {
  const ids = resolveChatToolIdsFromRegistry(mockTools, {
    chatMode: "agent",
    enabledToolIds: enabledPool,
    userText: "你好",
  });
  assert.ok(ids.includes(SET_THREAD_TITLE_TOOL));
  assert.ok(ids.includes(LIST_TOOLS_TOOL));
});

test("selectChatToolsFromRegistry launcher mode omits set_thread_title", () => {
  const launcherPool = [...LAUNCHER_TOOL_IDS];
  const launcherTools = buildMockToolRegistry(launcherPool);
  const ids = resolveChatToolIdsFromRegistry(launcherTools, {
    chatMode: "launcher",
    enabledToolIds: launcherPool,
    userText: "打开设置",
  });
  assert.equal(ids.includes(SET_THREAD_TITLE_TOOL), false);
});

test("resolveChatToolIdsFromRegistry authoring text keeps all enabled tools", () => {
  const ids = resolveChatToolIdsFromRegistry(mockTools, {
    chatMode: "agent",
    enabledToolIds: enabledPool,
    userText: "修改动作步骤并 patch",
  });
  assert.ok(ids.includes("browser"));
  assert.ok(ids.includes("web_search"));
  assert.ok(ids.includes("launcher_resolve"));
  assert.ok(ids.includes("workspace_program"));
});

test("resolveChatToolIdsFromRegistry from @-pinned user message applies authoring filter", () => {
  const messages: UIMessage[] = [
    {
      id: "u1",
      role: "user",
      parts: [
        {
          type: "text",
          text: '<qka id="e0ac442e-6241-4f89-9a20-494dee157b89">Demo</qka>\n\n继续',
        },
      ],
    },
  ];
  const ids = resolveChatToolIdsFromRegistry(mockTools, {
    chatMode: "agent",
    enabledToolIds: enabledPool,
    userText: "继续",
    messages,
  });
  assert.ok(ids.includes("browser"));
  assert.ok(ids.includes("qkrpc_action_run"));
});

test("resolveChatToolIdsFromRegistry web intent keeps browser tools", () => {
  const ids = resolveChatToolIdsFromRegistry(mockTools, {
    chatMode: "agent",
    enabledToolIds: enabledPool,
    userText: "用浏览器打开 https://example.com",
  });
  assert.ok(ids.includes("browser"));
  assert.ok(ids.includes("web_search"));
});

for (const scenario of TOOL_INTENT_SCENARIOS) {
  test(`resolveChatToolIdsFromRegistry scenario: ${scenario.id}`, () => {
    const ids = resolveChatToolIdsFromRegistry(mockTools, {
      chatMode: scenario.chatMode,
      enabledToolIds: enabledPool,
      userText: scenario.userText,
      actionScope: scenario.actionScope,
      actionDesigner: scenario.actionDesigner,
    });
    const idSet = new Set(ids);

    for (const toolId of scenario.mustExclude) {
      assert.equal(idSet.has(toolId), false, `${scenario.id}: ${toolId} should be excluded`);
    }
    for (const toolId of scenario.mustInclude) {
      assert.ok(idSet.has(toolId), `${scenario.id}: ${toolId} should be included`);
    }
  });
}

test("resolveChatToolIdsFromRegistry registered count is stable across intents", () => {
  const openIds = resolveChatToolIdsFromRegistry(mockTools, {
    chatMode: "agent",
    enabledToolIds: enabledPool,
    userText: "你好",
  });
  const authoringIds = resolveChatToolIdsFromRegistry(mockTools, {
    chatMode: "agent",
    enabledToolIds: enabledPool,
    userText: "创建动作并编辑步骤",
  });
  assert.equal(authoringIds.length, openIds.length);
});
