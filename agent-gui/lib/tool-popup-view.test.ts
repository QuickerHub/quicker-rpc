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

test("toolPopupHasVisualView true for ping response", () => {
  assert.equal(
    toolPopupHasVisualView("qkrpc_ping", undefined, {
      ok: true,
      exitCode: 0,
      data: { action: "ping", pong: true },
    }),
    true,
  );
});

test("toolPopupHasVisualView true for workspace file write diff", () => {
  assert.equal(
    toolPopupHasVisualView(
      "workspace_program",
      { action: "write_data", path: "data.json", content: "{}" },
      {
        ok: true,
        exitCode: 0,
        data: {
          action: "program-data-write",
          path: "data.json",
          bytesWritten: 2,
          previousContent: "{}",
          content: "{\n  \"x\": 1\n}",
        },
      },
    ),
    true,
  );
});

test("toolPopupHasVisualView true for shell_exec", () => {
  assert.equal(
    toolPopupHasVisualView("shell_exec", { command: "echo hi" }, undefined),
    true,
  );
});
