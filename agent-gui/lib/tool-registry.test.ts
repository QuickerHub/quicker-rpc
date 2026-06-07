import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALL_QKRPC_TOOL_IDS,
  QKRPC_TOOL_REGISTRY,
  resolveEnabledToolsFromPrefs,
} from "./tool-registry.ts";

test("every registry entry has id", () => {
  for (const entry of QKRPC_TOOL_REGISTRY) {
    assert.ok(entry.id?.trim(), `missing id on tool label: ${entry.label}`);
  }
});

test("consolidated workspace/action/subprogram tools are registered and default-on", () => {
  for (const id of [
    "workspace_program",
    "qkrpc_action_query",
    "qkrpc_action",
    "qkrpc_action_create",
    "qkrpc_action_manage",
    "qkrpc_subprogram_query",
    "qkrpc_subprogram",
    "qkrpc_subprogram_manage",
  ]) {
    assert.ok(ALL_QKRPC_TOOL_IDS.includes(id), `${id} missing from registry`);
  }
  const enabled = resolveEnabledToolsFromPrefs([], []);
  assert.ok(enabled.includes("workspace_program"));
  assert.ok(enabled.includes("qkrpc_action_query"));
  assert.ok(enabled.includes("qkrpc_subprogram_query"));
});
