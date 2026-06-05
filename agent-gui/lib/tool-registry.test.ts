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

test("workspace write/edit data tools are registered and default-on", () => {
  for (const id of [
    "workspace_action_write_data",
    "workspace_action_edit_data",
    "workspace_action_read_data",
  ]) {
    assert.ok(ALL_QKRPC_TOOL_IDS.includes(id), `${id} missing from registry`);
  }
  const enabled = resolveEnabledToolsFromPrefs([], []);
  assert.ok(enabled.includes("workspace_action_write_data"));
});
