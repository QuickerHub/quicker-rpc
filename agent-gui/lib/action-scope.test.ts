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
  const scope = extractActionScopeFromMessages(messages, [
    "5d8e2df9-0830-4c8c-a5b1-e9ec5a59a43c",
  ]);
  assert.equal(scope.pinnedLatest?.id, "e0ac442e-6241-4f89-9a20-494dee157b89");
  assert.equal(scope.pinnedLatest?.title, "My Action");
  assert.ok(
    formatActionScopeForSystem(scope).includes("e0ac442e-6241-4f89-9a20-494dee157b89"),
  );
});

test("guardWorkspaceActionId rejects id when single pin differs", () => {
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
    [],
  );
  const guard = guardWorkspaceActionId(
    "c132ca4a-9b1f-4ef4-9b38-105a78b5f5de",
    scope,
  );
  assert.equal(guard.ok, false);
  if (!guard.ok) {
    assert.ok(guard.error.includes("mismatch"));
    assert.ok(guard.error.includes("e0ac442e"));
  }
});

test("guardWorkspaceActionId allows pinned id", () => {
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
    [],
  );
  const guard = guardWorkspaceActionId(
    "e0ac442e-6241-4f89-9a20-494dee157b89",
    scope,
  );
  assert.deepEqual(guard, {
    ok: true,
    id: "e0ac442e-6241-4f89-9a20-494dee157b89",
  });
});
