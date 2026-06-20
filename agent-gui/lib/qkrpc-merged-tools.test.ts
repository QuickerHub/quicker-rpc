import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveEnabledToolsFromPrefs } from "./tool-registry.ts";
import {
  QKRPC_DESIGNER_OPEN_TOOL,
  isQkrpcDesignerOpenTool,
} from "./qkrpc-designer-open-tool.ts";
import {
  QKRPC_SUBPROGRAM_TRANSFER_TOOL,
  isQkrpcSubprogramTransferTool,
} from "./qkrpc-subprogram-transfer-tool.ts";

describe("qkrpc designer open tool helpers", () => {
  it("recognizes designer open tool id", () => {
    assert.equal(isQkrpcDesignerOpenTool(QKRPC_DESIGNER_OPEN_TOOL), true);
    assert.equal(isQkrpcDesignerOpenTool("qkrpc_action_edit"), false);
  });
});

describe("qkrpc subprogram transfer tool helpers", () => {
  it("recognizes transfer tool id", () => {
    assert.equal(isQkrpcSubprogramTransferTool(QKRPC_SUBPROGRAM_TRANSFER_TOOL), true);
    assert.equal(isQkrpcSubprogramTransferTool("qkrpc_subprogram_export"), false);
  });
});

describe("resolveEnabledToolsFromPrefs merged tool migration", () => {
  it("migrates enabled qkrpc_action_edit to qkrpc_designer_open", () => {
    const registry = ["docs", "qkrpc_action_edit", "qkrpc_designer_open"];
    const enabled = resolveEnabledToolsFromPrefs(registry, registry);
    assert.equal(enabled.includes("qkrpc_designer_open"), true);
    assert.equal(enabled.includes("qkrpc_action_edit"), false);
  });

  it("migrates disabled qkrpc_action_edit to designer_open off", () => {
    const registry = ["docs", "qkrpc_action_edit", "qkrpc_designer_open"];
    const enabled = resolveEnabledToolsFromPrefs(
      ["docs"],
      registry,
    );
    assert.equal(enabled.includes("qkrpc_designer_open"), false);
  });

  it("migrates legacy qkrpc_subprogram export/import to transfer", () => {
    const registry = [
      "docs",
      "qkrpc_subprogram_export",
      "qkrpc_subprogram_import",
      "qkrpc_subprogram_transfer",
    ];
    const enabled = resolveEnabledToolsFromPrefs(registry, registry);
    assert.equal(enabled.includes("qkrpc_subprogram_transfer"), true);
    assert.equal(enabled.includes("qkrpc_subprogram_export"), false);
    assert.equal(enabled.includes("qkrpc_subprogram_import"), false);
  });

  it("migrates legacy qkrpc_subprogram mega tool to transfer and designer_open", () => {
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
    assert.equal(enabled.includes("qkrpc_subprogram_edit"), false);
    assert.equal(enabled.includes("qkrpc_subprogram_export"), false);
  });
});
