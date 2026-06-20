import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  resolveActiveToolBundles,
  resolveFullSchemaToolIds,
} from "@/lib/tool-bundles";

describe("tool-bundles", () => {
  test("core bundle is always active", () => {
    const bundles = resolveActiveToolBundles({
      chatMode: "agent",
      intent: "conversation",
      actionScope: { pinnedLatest: undefined, pinnedLatestAll: [] },
    });
    assert.ok(bundles.includes("core"));
    assert.equal(bundles.includes("action_authoring"), false);
  });

  test("authoring intent loads action_authoring pack", () => {
    const bundles = resolveActiveToolBundles({
      chatMode: "agent",
      intent: "action_authoring",
      actionScope: { pinnedLatest: undefined, pinnedLatestAll: [] },
    });
    assert.ok(bundles.includes("action_authoring"));
    const full = resolveFullSchemaToolIds({
      chatMode: "agent",
      intent: "action_authoring",
      actionScope: { pinnedLatest: undefined, pinnedLatestAll: [] },
    });
    assert.ok(full.has("workspace_program"));
    assert.ok(full.has("qkrpc_step_runner_get"));
    assert.equal(full.has("qkrpc_profile_create"), false);
    assert.equal(full.has("qkrpc_action_publish"), false);
    assert.equal(full.has("Shell"), false);
    assert.equal(full.has("Read"), false);
    assert.equal(full.has("docs"), false);
    assert.equal(full.has("qkrpc_action_query"), false);
    assert.equal(full.has("qkrpc_action_debug"), false);
    assert.equal(bundles.includes("action_authoring_extended"), false);
  });

  test("@ pin loads action_authoring without explicit authoring keywords", () => {
    const bundles = resolveActiveToolBundles({
      chatMode: "agent",
      intent: "conversation",
      actionScope: {
        pinnedLatest: { id: "abc", source: "user-tag" },
        pinnedLatestAll: [{ id: "abc", source: "user-tag" }],
      },
    });
    assert.ok(bundles.includes("action_authoring"));
  });

  test("web intent loads browser pack", () => {
    const bundles = resolveActiveToolBundles({
      chatMode: "agent",
      intent: "web",
      actionScope: { pinnedLatest: undefined, pinnedLatestAll: [] },
    });
    assert.ok(bundles.includes("browser"));
  });
});
