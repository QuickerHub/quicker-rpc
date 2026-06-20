import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveEnabledToolsFromPrefs } from "./tool-registry.ts";
import {
  QKRPC_SUBPROGRAM_CREATE_TOOL,
  QKRPC_SUBPROGRAM_GET_TOOL,
  QKRPC_SUBPROGRAM_QUERY_TOOL,
  isQkrpcSubprogramCreateTool,
  isQkrpcSubprogramGetTool,
  isSubprogramListTool,
} from "./qkrpc-subprogram-tool.ts";

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
    assert.equal(enabled.includes("qkrpc_subprogram_transfer"), false);
    assert.equal(enabled.includes("qkrpc_subprogram"), false);
  });

  it("migrates enabled legacy qkrpc_subprogram to transfer and designer_open", () => {
    const registry = [
      "docs",
      "qkrpc_subprogram",
      "qkrpc_subprogram_transfer",
      "qkrpc_designer_open",
    ];
    const enabled = resolveEnabledToolsFromPrefs(registry, registry);
    assert.equal(enabled.includes("qkrpc_subprogram_get"), true);
    assert.equal(enabled.includes("qkrpc_subprogram_transfer"), true);
    assert.equal(enabled.includes("qkrpc_designer_open"), true);
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
