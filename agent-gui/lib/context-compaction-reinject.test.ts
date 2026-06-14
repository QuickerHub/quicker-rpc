import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  collectRecentPatchPaths,
  renderPostCompactReinjectBlock,
} from "@/lib/context-compaction-reinject";

function user(id: string, text: string): AgentUIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

describe("collectRecentPatchPaths", () => {
  it("collects workspace_program patch paths from recent rounds", () => {
    const messages: AgentUIMessage[] = [
      user("u1", "patch file"),
      {
        id: "a1",
        role: "assistant",
        parts: [{
          type: "tool-workspace_program",
          toolCallId: "c1",
          state: "output-available",
          input: {
            action: "patch",
            path: "actions/demo/data.json",
          },
          output: { ok: true, path: "actions/demo/data.json" },
        }],
      },
      user("u2", "continue"),
    ];

    assert.deepEqual(
      collectRecentPatchPaths(messages),
      ["actions/demo/data.json"],
    );
  });

  it("ignores failed tools and read-only actions", () => {
    const messages: AgentUIMessage[] = [
      user("u1", "read"),
      {
        id: "a1",
        role: "assistant",
        parts: [{
          type: "tool-workspace_program",
          toolCallId: "c1",
          state: "output-available",
          input: { action: "file_read", path: "actions/demo/data.json" },
          output: { ok: true, path: "actions/demo/data.json" },
        }],
      },
      user("u2", "fail"),
      {
        id: "a2",
        role: "assistant",
        parts: [{
          type: "tool-workspace_program",
          toolCallId: "c2",
          state: "output-available",
          input: { action: "patch", path: "actions/demo/steps.json" },
          output: { ok: false, errorMessage: "boom" },
        }],
      },
    ];

    assert.deepEqual(collectRecentPatchPaths(messages), []);
  });
});

describe("renderPostCompactReinjectBlock", () => {
  it("renders file sections", () => {
    const block = renderPostCompactReinjectBlock([
      { path: "a.txt", content: "hello", truncated: false },
    ]);
    assert.match(block ?? "", /Recent workspace files/);
    assert.match(block ?? "", /### a\.txt/);
    assert.match(block ?? "", /hello/);
  });
});
