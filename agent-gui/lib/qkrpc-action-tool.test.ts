import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import {
  actionListSourceFromTool,
  isActionListTool,
  isQkrpcActionCreateTool,
  QKRPC_ACTION_MANAGE_TOOL,
  QKRPC_ACTION_QUERY_TOOL,
  QKRPC_ACTION_TOOL,
} from "./qkrpc-action-tool.ts";
import {
  QKRPC_ACTION_MANAGE_TOOL_DEF,
  QKRPC_ACTION_TOOL_DEF,
} from "@/lib/qkrpc-action-tool.server";
import {
  resolveEnabledToolsFromPrefs,
} from "./tool-registry.ts";

describe("qkrpc action tool JSON Schema", () => {
  it("qkrpc_action tool schema is a flat ZodObject (LLM providers require type object)", () => {
    assert.ok(QKRPC_ACTION_TOOL_DEF.inputSchema instanceof z.ZodObject);
    assert.notEqual(
      QKRPC_ACTION_TOOL_DEF.inputSchema.constructor.name,
      "ZodDiscriminatedUnion",
    );
  });

  it("qkrpc_action_manage tool schema is a flat ZodObject", () => {
    assert.ok(QKRPC_ACTION_MANAGE_TOOL_DEF.inputSchema instanceof z.ZodObject);
    assert.notEqual(
      QKRPC_ACTION_MANAGE_TOOL_DEF.inputSchema.constructor.name,
      "ZodDiscriminatedUnion",
    );
  });
});

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
