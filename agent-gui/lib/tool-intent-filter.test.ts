import assert from "node:assert/strict";
import { test } from "node:test";

import { filterEnabledToolsForTurn } from "./tool-intent-filter.ts";

const emptyScope = {
  pinnedLatest: undefined,
  pinnedLatestAll: [],
};

const allIds = [
  "docs",
  "browser",
  "launcher_resolve",
  "qkrpc_action_float",
  "workspace_program",
  "qkrpc_action_run",
  "dev_frontend_check",
  "web_search",
];

test("filterEnabledToolsForTurn returns enabled tools unchanged", () => {
  const filtered = filterEnabledToolsForTurn({
    chatMode: "agent",
    enabledToolIds: allIds,
    intent: "action_authoring",
    actionScope: emptyScope,
  });

  assert.deepEqual(filtered, allIds);
});

test("filterEnabledToolsForTurn does not filter pinned action scope", () => {
  const filtered = filterEnabledToolsForTurn({
    chatMode: "agent",
    enabledToolIds: allIds,
    intent: "conversation",
    actionScope: {
      pinnedLatest: {
        id: "00000000-0000-0000-0000-000000000001",
        source: "user-tag",
        title: "Demo",
      },
      pinnedLatestAll: [
        {
          id: "00000000-0000-0000-0000-000000000001",
          source: "user-tag",
          title: "Demo",
        },
      ],
    },
  });

  assert.deepEqual(filtered, allIds);
});

test("filterEnabledToolsForTurn does not filter launcher mode", () => {
  const filtered = filterEnabledToolsForTurn({
    chatMode: "launcher",
    enabledToolIds: allIds,
    intent: "action_runtime",
    actionScope: emptyScope,
  });

  assert.deepEqual(filtered, allIds);
});

test("filterEnabledToolsForTurn does not filter ask mode", () => {
  const filtered = filterEnabledToolsForTurn({
    chatMode: "ask",
    enabledToolIds: allIds,
    intent: "action_authoring",
    actionScope: emptyScope,
  });

  assert.deepEqual(filtered, allIds);
});

test("filterEnabledToolsForTurn does not filter actionDesigner context", () => {
  const filtered = filterEnabledToolsForTurn({
    chatMode: "agent",
    enabledToolIds: allIds,
    intent: "conversation",
    actionScope: emptyScope,
    actionDesigner: { entityId: "e0ac442e-6241-4f89-9a20-494dee157b89" },
  });

  assert.deepEqual(filtered, allIds);
});
