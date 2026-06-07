import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isQkrpcSubprogramCreateTool,
  isQkrpcSubprogramGetTool,
  isSubprogramListTool,
  QKRPC_SUBPROGRAM_CREATE_TOOL,
  QKRPC_SUBPROGRAM_GET_TOOL,
  QKRPC_SUBPROGRAM_QUERY_TOOL,
} from "./qkrpc-subprogram-tool.ts";
import { resolveEnabledToolsFromPrefs } from "./tool-registry.ts";

describe("qkrpc subprogram tool helpers", () => {
  it("treats qkrpc_subprogram_query as list tool", () => {
    assert.equal(isSubprogramListTool(QKRPC_SUBPROGRAM_QUERY_TOOL), true);
  });

  it("treats split get/create tools", () => {
    assert.equal(isQkrpcSubprogramGetTool(QKRPC_SUBPROGRAM_GET_TOOL), true);
    assert.equal(isQkrpcSubprogramCreateTool(QKRPC_SUBPROGRAM_CREATE_TOOL), true);
    assert.equal(
      isQkrpcSubprogramCreateTool(QKRPC_SUBPROGRAM_GET_TOOL, { id: "x" }),
      false,
    );
  });
});

describe("resolveEnabledToolsFromPrefs subprogram split", () => {
  it("migrates disabled legacy qkrpc_subprogram to split ops off", () => {
    const registry = ["docs", "qkrpc_subprogram"];
    const enabled = resolveEnabledToolsFromPrefs(
      registry.filter((id) => id !== "qkrpc_subprogram"),
      registry,
    );
    assert.equal(enabled.includes("qkrpc_subprogram_get"), false);
    assert.equal(enabled.includes("qkrpc_subprogram_export"), false);
    assert.equal(enabled.includes("qkrpc_subprogram"), false);
  });

  it("migrates enabled legacy qkrpc_subprogram to split ops on", () => {
    const registry = ["docs", "qkrpc_subprogram"];
    const enabled = resolveEnabledToolsFromPrefs(registry, registry);
    assert.equal(enabled.includes("qkrpc_subprogram_get"), true);
    assert.equal(enabled.includes("qkrpc_subprogram_edit"), true);
    assert.equal(enabled.includes("qkrpc_subprogram_edit_var"), false);
    assert.equal(enabled.includes("qkrpc_subprogram"), false);
  });

  it("migrates legacy qkrpc_subprogram_manage to create", () => {
    const registry = ["docs", "qkrpc_subprogram_manage"];
    const enabled = resolveEnabledToolsFromPrefs(registry, registry);
    assert.equal(enabled.includes("qkrpc_subprogram_create"), true);
    assert.equal(enabled.includes("qkrpc_subprogram_manage"), false);
  });
});
