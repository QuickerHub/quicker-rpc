import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  actionListSourceFromTool,
  isActionListTool,
  isQkrpcActionCreateTool,
  QKRPC_ACTION_MANAGE_TOOL,
  QKRPC_ACTION_QUERY_TOOL,
  QKRPC_ACTION_TOOL,
} from "./qkrpc-action-tool.ts";
import {
  resolveEnabledToolsFromPrefs,
} from "./tool-registry.ts";

describe("qkrpc action tool helpers", () => {
  it("treats qkrpc_action_query as action list tool", () => {
    assert.equal(isActionListTool(QKRPC_ACTION_QUERY_TOOL), true);
    assert.equal(actionListSourceFromTool(QKRPC_ACTION_QUERY_TOOL), "list");
  });

  it("routes create to manage tool", () => {
    assert.equal(
      isQkrpcActionCreateTool(QKRPC_ACTION_MANAGE_TOOL, { action: "create" }),
      true,
    );
    assert.equal(
      isQkrpcActionCreateTool(QKRPC_ACTION_TOOL, { action: "get", id: "x" }),
      false,
    );
  });
});

describe("resolveEnabledToolsFromPrefs action split", () => {
  it("migrates disabled legacy qkrpc_action to all three off", () => {
    const registry = [
      "docs",
      "qkrpc_action",
      "qkrpc_subprogram",
    ];
    const enabled = resolveEnabledToolsFromPrefs(
      registry.filter((id) => id !== "qkrpc_action"),
      registry,
    );
    assert.equal(enabled.includes("qkrpc_action_query"), false);
    assert.equal(enabled.includes("qkrpc_action"), false);
    assert.equal(enabled.includes("qkrpc_action_manage"), false);
  });

  it("migrates enabled legacy qkrpc_action to all three on", () => {
    const registry = ["docs", "qkrpc_action"];
    const enabled = resolveEnabledToolsFromPrefs(registry, registry);
    assert.equal(enabled.includes("qkrpc_action_query"), true);
    assert.equal(enabled.includes("qkrpc_action"), true);
    assert.equal(enabled.includes("qkrpc_action_manage"), true);
  });
});
