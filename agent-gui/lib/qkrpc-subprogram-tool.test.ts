import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isQkrpcSubprogramCreateTool,
  isSubprogramListTool,
  QKRPC_SUBPROGRAM_MANAGE_TOOL,
  QKRPC_SUBPROGRAM_QUERY_TOOL,
  QKRPC_SUBPROGRAM_TOOL,
} from "./qkrpc-subprogram-tool.ts";
import { resolveEnabledToolsFromPrefs } from "./tool-registry.ts";

describe("qkrpc subprogram tool helpers", () => {
  it("treats qkrpc_subprogram_query as list tool", () => {
    assert.equal(isSubprogramListTool(QKRPC_SUBPROGRAM_QUERY_TOOL), true);
  });

  it("routes create to manage tool", () => {
    assert.equal(
      isQkrpcSubprogramCreateTool(QKRPC_SUBPROGRAM_MANAGE_TOOL, {
        action: "create",
        name: "Test",
      }),
      true,
    );
    assert.equal(
      isQkrpcSubprogramCreateTool(QKRPC_SUBPROGRAM_TOOL, {
        action: "get",
        id: "x",
      }),
      false,
    );
  });
});

describe("resolveEnabledToolsFromPrefs subprogram split", () => {
  it("migrates disabled legacy qkrpc_subprogram to all three off", () => {
    const registry = ["docs", "qkrpc_subprogram"];
    const enabled = resolveEnabledToolsFromPrefs(
      registry.filter((id) => id !== "qkrpc_subprogram"),
      registry,
    );
    assert.equal(enabled.includes("qkrpc_subprogram_query"), false);
    assert.equal(enabled.includes("qkrpc_subprogram"), false);
    assert.equal(enabled.includes("qkrpc_subprogram_manage"), false);
  });

  it("migrates enabled legacy qkrpc_subprogram to all three on", () => {
    const registry = ["docs", "qkrpc_subprogram"];
    const enabled = resolveEnabledToolsFromPrefs(registry, registry);
    assert.equal(enabled.includes("qkrpc_subprogram_query"), true);
    assert.equal(enabled.includes("qkrpc_subprogram"), true);
    assert.equal(enabled.includes("qkrpc_subprogram_manage"), true);
  });
});
