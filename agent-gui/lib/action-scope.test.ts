import assert from "node:assert/strict";
import { test } from "node:test";
import type { UIMessage } from "ai";
import {
  extractActionScopeFromMessages,
  formatActionScopeForSystem,
  guardWorkspaceActionId,
} from "./action-scope";

test("extractActionScopeFromMessages reads latest user qka pin", () => {
  const messages: UIMessage[] = [
    {
      id: "u1",
      role: "user",
      parts: [
        {
          type: "text",
          text: '<qka id="e0ac442e-6241-4f89-9a20-494dee157b89">My Action</qka>\n\nedit steps',
        },
      ],
    },
  ];
  const scope = extractActionScopeFromMessages(messages);
  assert.equal(scope.pinnedLatest?.id, "e0ac442e-6241-4f89-9a20-494dee157b89");
  assert.equal(scope.pinnedLatest?.title, "My Action");
  assert.ok(
    formatActionScopeForSystem(scope).includes("e0ac442e-6241-4f89-9a20-494dee157b89"),
  );
  assert.ok(!formatActionScopeForSystem(scope).includes("binding"));
});

test("formatActionScopeForSystem is empty without user pins", () => {
  const scope = extractActionScopeFromMessages([
    { id: "u1", role: "user", parts: [{ type: "text", text: "edit the action" }] },
  ]);
  assert.equal(formatActionScopeForSystem(scope), "");
});

test("guardWorkspaceActionId allows any GUID (no pin lock)", () => {
  const scope = extractActionScopeFromMessages(
    [
      {
        id: "u1",
        role: "user",
        parts: [
          {
            type: "text",
            text: '<qka id="e0ac442e-6241-4f89-9a20-494dee157b89">A</qka>',
          },
        ],
      },
    ],
  );
  const otherId = "c132ca4a-9b1f-4ef4-9b38-105a78b5f5de";
  const guard = guardWorkspaceActionId(otherId, scope);
  assert.deepEqual(guard, { ok: true, id: otherId });
});

test("guardWorkspaceActionId rejects invalid id", () => {
  const guard = guardWorkspaceActionId("not-a-uuid", undefined);
  assert.equal(guard.ok, false);
});
