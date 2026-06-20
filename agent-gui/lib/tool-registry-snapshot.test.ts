import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ALL_QKRPC_TOOL_IDS,
  pickerVisibleTools,
  QKRPC_TOOL_REGISTRY,
  resolveEnabledToolsFromPrefs,
} from "./tool-registry.ts";

const RETIRED_REGISTRY_IDS = [
  "qkrpc_action_edit",
  "qkrpc_subprogram_edit",
  "qkrpc_subprogram_export",
  "qkrpc_subprogram_import",
] as const;

const MERGED_REPLACEMENT_IDS = [
  "qkrpc_designer_open",
  "qkrpc_subprogram_transfer",
] as const;

test("retired tool ids are not in active registry", () => {
  for (const id of RETIRED_REGISTRY_IDS) {
    assert.equal(ALL_QKRPC_TOOL_IDS.includes(id), false, `${id} should not be in registry`);
  }
  for (const id of MERGED_REPLACEMENT_IDS) {
    assert.ok(ALL_QKRPC_TOOL_IDS.includes(id), `${id} should be in registry`);
  }
});

test("picker visible count is below full registry (internal tools hidden)", () => {
  const hidden = QKRPC_TOOL_REGISTRY.filter((t) => t.pickerHidden).length;
  assert.ok(hidden >= 2);
  assert.equal(pickerVisibleTools().length, QKRPC_TOOL_REGISTRY.length - hidden);
});

test("expandLegacyConsolidatedPrefs enables merged tools from saved legacy edit flags", () => {
  const registry = [
    "docs",
    "qkrpc_action_edit",
    "qkrpc_designer_open",
    "qkrpc_subprogram_export",
    "qkrpc_subprogram_transfer",
  ];
  const enabled = resolveEnabledToolsFromPrefs(registry, registry);
  assert.equal(enabled.includes("qkrpc_designer_open"), true);
  assert.equal(enabled.includes("qkrpc_subprogram_transfer"), true);
  assert.equal(enabled.includes("qkrpc_action_edit"), false);
  assert.equal(enabled.includes("qkrpc_subprogram_export"), false);
});
