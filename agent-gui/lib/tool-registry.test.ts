import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  ALL_QKRPC_TOOL_IDS,
  loadStoredEnabledTools,
  QKRPC_TOOL_REGISTRY,
  resolveEnabledToolsFromPrefs,
  TOOL_APPROVAL_STORAGE_KEY,
  TOOL_CATEGORY_ORDER_BY_GROUP,
  toolsInCategory,
  type ToolGroupId,
} from "./tool-registry.ts";

const storage = new Map<string, string>();

function installBrowserStorage(): void {
  (globalThis as { window?: typeof globalThis }).window = globalThis;
  (globalThis as { localStorage?: Storage }).localStorage = {
    get length() {
      return storage.size;
    },
    clear() {
      storage.clear();
    },
    getItem(key: string) {
      return storage.get(key) ?? null;
    },
    key(index: number) {
      return [...storage.keys()][index] ?? null;
    },
    removeItem(key: string) {
      storage.delete(key);
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
  } as Storage;
}

function uninstallBrowserStorage(): void {
  delete (globalThis as { window?: typeof globalThis }).window;
  delete (globalThis as { localStorage?: Storage }).localStorage;
}

afterEach(() => {
  storage.clear();
  uninstallBrowserStorage();
});



test("internal chat tools are registered but hidden from picker", () => {
  assert.ok(ALL_QKRPC_TOOL_IDS.includes("set_thread_title"));
  assert.ok(ALL_QKRPC_TOOL_IDS.includes("launcher_command_cache"));
  const title = QKRPC_TOOL_REGISTRY.find((t) => t.id === "set_thread_title");
  assert.ok(title?.pickerHidden);
});

test("Grep host tool is registered in picker", () => {
  assert.ok(ALL_QKRPC_TOOL_IDS.includes("Grep"));
  const grep = QKRPC_TOOL_REGISTRY.find((t) => t.id === "Grep");
  assert.ok(grep);
  assert.equal(grep!.group, "read");
  assert.equal(grep!.category, "workspace");
});

test("every registry entry has id", () => {

  for (const entry of QKRPC_TOOL_REGISTRY) {

    assert.ok(entry.id?.trim(), `missing id on tool label: ${entry.label}`);

  }

});

test("every picker-visible registry tool appears in tool picker categories", () => {
  const shown = new Set<string>();
  for (const group of ["read", "write", "destructive"] as ToolGroupId[]) {
    for (const category of TOOL_CATEGORY_ORDER_BY_GROUP[group]) {
      for (const tool of toolsInCategory(group, category)) {
        shown.add(tool.id);
      }
    }
  }
  for (const entry of QKRPC_TOOL_REGISTRY) {
    if (entry.pickerHidden) continue;
    assert.ok(shown.has(entry.id), `${entry.id} missing from tool picker categories`);
  }
});



test("split action tools are registered and default-on", () => {

  for (const id of [

    "workspace_program",

    "qkrpc_action_query",

    "qkrpc_action_get",

    "qkrpc_action_run",

    "qkrpc_action_debug",

    "qkrpc_action_create",

    "qkrpc_profile_create",

    "qkrpc_subprogram_query",

    "qkrpc_subprogram_get",

    "qkrpc_designer_open",
    "qkrpc_subprogram_transfer",
    "qkrpc_subprogram_create",

  ]) {

    assert.ok(ALL_QKRPC_TOOL_IDS.includes(id), `${id} missing from registry`);

  }

  const enabled = resolveEnabledToolsFromPrefs([], []);

  assert.ok(enabled.includes("workspace_program"));

  assert.ok(enabled.includes("qkrpc_action_get"));

  assert.ok(enabled.includes("qkrpc_action_debug"));

  assert.ok(enabled.includes("qkrpc_subprogram_get"));

});



test("migrates legacy mega qkrpc_action to split tools", () => {

  const registry = ["docs", "qkrpc_action"];

  const enabled = resolveEnabledToolsFromPrefs(registry, registry);

  assert.equal(enabled.includes("qkrpc_action_get"), true);

  assert.equal(enabled.includes("qkrpc_action_publish"), true);
  assert.equal(enabled.includes("qkrpc_designer_open"), true);

  assert.equal(enabled.includes("qkrpc_action"), false);

});

test("loadStoredEnabledTools enables full registry after refresh", () => {
  installBrowserStorage();
  localStorage.setItem(
    TOOL_APPROVAL_STORAGE_KEY,
    JSON.stringify({
      v: 1,
      enabled: ["docs"],
      registryIds: ["docs", "qkrpc_action_query"],
    }),
  );

  const enabled = loadStoredEnabledTools();

  assert.deepEqual(enabled, ALL_QKRPC_TOOL_IDS);
  const stored = JSON.parse(
    localStorage.getItem(TOOL_APPROVAL_STORAGE_KEY) ?? "{}",
  ) as { enabled: string[]; registryIds: string[] };
  assert.deepEqual(stored.enabled, ALL_QKRPC_TOOL_IDS);
  assert.deepEqual(stored.registryIds, ALL_QKRPC_TOOL_IDS);
});


