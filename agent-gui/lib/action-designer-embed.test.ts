import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isActionDesignerEmbedClient,
  parseActionDesignerEmbedFromSearchParams,
  resolveDesignerEmbedChatStorageKey,
} from "@/lib/action-designer-embed";
import {
  actionDesignerRefFromEmbed,
  groupThreadsByActionDesigner,
} from "@/lib/action-designer-thread";

test("parseActionDesignerEmbedFromSearchParams scoped when entityId present", () => {
  const params = parseActionDesignerEmbedFromSearchParams(
    new URLSearchParams("embed=action-designer&entityId=abc&isSubProgram=1"),
  );
  assert.equal(params.enabled, true);
  assert.equal(params.scoped, true);
  assert.equal(params.debugMode, false);
  assert.equal(params.entityId, "abc");
  assert.equal(params.isSubProgram, true);
});

test("parseActionDesignerEmbedFromSearchParams debug when entityId omitted", () => {
  const params = parseActionDesignerEmbedFromSearchParams(
    new URLSearchParams("embed=action-designer"),
  );
  assert.equal(params.enabled, true);
  assert.equal(params.scoped, false);
  assert.equal(params.debugMode, true);
});

test("actionDesignerRefFromEmbed only returns ref when scoped", () => {
  assert.equal(
    actionDesignerRefFromEmbed({
      enabled: true,
      scoped: false,
      debugMode: true,
      entityId: "",
      isSubProgram: false,
    }),
    undefined,
  );
  assert.deepEqual(
    actionDesignerRefFromEmbed({
      enabled: true,
      scoped: true,
      debugMode: false,
      entityId: "guid",
      isSubProgram: false,
    }),
    { entityId: "guid", isSubProgram: false },
  );
});

test("groupThreadsByActionDesigner groups tagged threads only", () => {
  const groups = groupThreadsByActionDesigner([
    {
      id: "1",
      title: "A",
      messages: [],
      updatedAt: 10,
      actionDesigner: { entityId: "x", isSubProgram: false },
    },
    {
      id: "2",
      title: "B",
      messages: [],
      updatedAt: 20,
      actionDesigner: { entityId: "y", isSubProgram: true },
    },
    {
      id: "3",
      title: "C",
      messages: [],
      updatedAt: 30,
    },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0]!.threads[0]!.id, "2");
});

test("isActionDesignerEmbedClient is true for debug embed URL", () => {
  const prev = globalThis.window;
  globalThis.window = {
    location: { search: "?embed=action-designer" },
  } as Window & typeof globalThis;
  try {
    assert.equal(isActionDesignerEmbedClient(), true);
  } finally {
    globalThis.window = prev;
  }
});

test("resolveDesignerEmbedChatStorageKey scopes storage per entity", () => {
  const prev = globalThis.window;
  globalThis.window = {
    location: {
      search: "?embed=action-designer&entityId=ABC-GUID&isSubProgram=1",
    },
  } as Window & typeof globalThis;
  try {
    assert.equal(
      resolveDesignerEmbedChatStorageKey(),
      "agent-gui-chats-designer-sub-abc-guid",
    );
  } finally {
    globalThis.window = prev;
  }
});
