import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  actionListSourceFromTool,
  isActionListTool,
  isQkrpcActionCreateTool,
  isQkrpcActionRunTool,
  QKRPC_ACTION_CREATE_TOOL,
  QKRPC_ACTION_DEBUG_TOOL,
  QKRPC_ACTION_FLOAT_TOOL,
  QKRPC_ACTION_GET_TOOL,
  QKRPC_ACTION_QUERY_TOOL,
  QKRPC_ACTION_RUN_TOOL,
} from "./qkrpc-action-tool.ts";
import {
  resolveEnabledToolsFromPrefs,
} from "./tool-registry.ts";

describe("qkrpc action tool helpers", () => {
  it("treats qkrpc_action_query as action list tool", () => {
    assert.equal(isActionListTool(QKRPC_ACTION_QUERY_TOOL), true);
    assert.equal(actionListSourceFromTool(QKRPC_ACTION_QUERY_TOOL), "list");
  });

  it("treats split run tools as run tools", () => {
    assert.equal(isQkrpcActionRunTool(QKRPC_ACTION_RUN_TOOL), true);
    assert.equal(isQkrpcActionRunTool(QKRPC_ACTION_DEBUG_TOOL), true);
    assert.equal(isQkrpcActionRunTool(QKRPC_ACTION_FLOAT_TOOL), true);
    assert.equal(isQkrpcActionRunTool(QKRPC_ACTION_GET_TOOL), false);
  });

  it("routes create to create tool", () => {
    assert.equal(
      isQkrpcActionCreateTool(QKRPC_ACTION_CREATE_TOOL, { info: { title: "x" } }),
      true,
    );
    assert.equal(
      isQkrpcActionCreateTool(QKRPC_ACTION_GET_TOOL, {
        id: "00000000-0000-0000-0000-000000000001",
      }),
      false,
    );
  });
});

describe("resolveEnabledToolsFromPrefs action split", () => {
  it("migrates disabled legacy qkrpc_action_run to split run tools off", () => {
    const registry = [
      "docs",
      "qkrpc_action_run",
    ];
    const enabled = resolveEnabledToolsFromPrefs(
      registry.filter((id) => id !== "qkrpc_action_run"),
      registry,
    );
    assert.equal(enabled.includes("qkrpc_action_run"), false);
    assert.equal(enabled.includes("qkrpc_action_debug"), false);
    assert.equal(enabled.includes("qkrpc_action_float"), false);
  });

  it("migrates enabled legacy qkrpc_action_run to all run split tools on", () => {
    const registry = ["docs", "qkrpc_action_run"];
    const enabled = resolveEnabledToolsFromPrefs(registry, registry);
    assert.equal(enabled.includes("qkrpc_action_run"), true);
    assert.equal(enabled.includes("qkrpc_action_debug"), true);
    assert.equal(enabled.includes("qkrpc_action_float"), true);
  });
});
