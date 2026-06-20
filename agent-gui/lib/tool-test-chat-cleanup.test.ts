import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  collectActionIdsFromChatMessages,
  collectSubprogramKeysFromChatMessages,
} from "@/lib/tool-test-chat-cleanup";

function toolMessage(
  toolName: string,
  input: Record<string, unknown>,
  output?: Record<string, unknown>,
): AgentUIMessage {
  return {
    id: "m1",
    role: "assistant",
    parts: [
      {
        type: `tool-${toolName}`,
        toolCallId: "call-1",
        state: "output-available",
        input,
        output,
      },
    ],
  };
}

test("collectActionIdsFromChatMessages skips workspace_program global_subprogram", () => {
  const messages = [
    toolMessage("workspace_program", {
      action: "read_data",
      target: "global_subprogram",
      id: "demo-sp",
    }),
  ];
  assert.deepEqual(collectActionIdsFromChatMessages(messages), []);
});

test("collectSubprogramKeysFromChatMessages reads create output and designer_open", () => {
  const messages = [
    toolMessage(
      "qkrpc_subprogram_create",
      { name: "tool-test-sp" },
      {
        ok: true,
        exitCode: 0,
        data: { subProgramId: "sp-guid-001" },
      },
    ),
    toolMessage("qkrpc_designer_open", {
      target: "global_subprogram",
      id: "demo-sp",
    }),
  ];
  const keys = collectSubprogramKeysFromChatMessages(messages);
  assert.equal(keys.includes("sp-guid-001"), true);
  assert.equal(keys.includes("demo-sp"), true);
});

test("collectSubprogramKeysFromChatMessages skips list query", () => {
  const messages = [
    toolMessage("qkrpc_subprogram_query", { limit: 5 }),
    toolMessage("workspace_program", { action: "projects_list", target: "all" }),
  ];
  assert.deepEqual(collectSubprogramKeysFromChatMessages(messages), []);
});
