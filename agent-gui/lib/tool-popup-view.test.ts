import assert from "node:assert/strict";
import test from "node:test";
import { toolPopupHasVisualView } from "@/lib/tool-popup-view";

test("toolPopupHasVisualView true for action list output", () => {
  assert.equal(
    toolPopupHasVisualView("qkrpc_action_list", { limit: 5 }, {
      ok: true,
      exitCode: 0,
      data: {
        action: "action-list",
        items: [{ id: "a", title: "Test" }],
      },
    }),
    true,
  );
});

test("toolPopupHasVisualView false for empty ping-only stub", () => {
  assert.equal(
    toolPopupHasVisualView("qkrpc_ping", undefined, {
      ok: true,
      exitCode: 0,
      data: { action: "ping", pong: true },
    }),
    true,
  );
});
