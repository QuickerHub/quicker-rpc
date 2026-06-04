import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import { buildThreadTitleAgentInstruction } from "@/lib/set-thread-title-tool.ts";
import {
  extractThreadTitleFromMessages,
  isFirstChatUserTurn,
  SET_THREAD_TITLE_TOOL,
} from "@/lib/thread-title-tool-messages.ts";
import { formatLocalToolResult } from "@/lib/tool-result.ts";

test("isFirstChatUserTurn is true only for a single user message", () => {
  const first: AgentUIMessage[] = [
    { id: "u1", role: "user", parts: [{ type: "text", text: "写个动作" }] },
  ];
  const second: AgentUIMessage[] = [
    ...first,
    { id: "a1", role: "assistant", parts: [{ type: "text", text: "好的" }] },
    { id: "u2", role: "user", parts: [{ type: "text", text: "继续" }] },
  ];
  assert.equal(isFirstChatUserTurn(first), true);
  assert.equal(isFirstChatUserTurn(second), false);
});

test("buildThreadTitleAgentInstruction injects only on first user turn", () => {
  const first: AgentUIMessage[] = [
    { id: "u1", role: "user", parts: [{ type: "text", text: "新建剪贴板动作" }] },
  ];
  const second: AgentUIMessage[] = [
    ...first,
    { id: "a1", role: "assistant", parts: [{ type: "text", text: "好的" }] },
    { id: "u2", role: "user", parts: [{ type: "text", text: "再加一步" }] },
  ];

  const onFirst = buildThreadTitleAgentInstruction({ messages: first });
  const onSecond = buildThreadTitleAgentInstruction({ messages: second });

  assert.ok(onFirst?.includes("set_thread_title"));
  assert.equal(onSecond, null);
});

test("extractThreadTitleFromMessages reads set_thread_title tool output", () => {
  const messages: AgentUIMessage[] = [
    {
      id: "a1",
      role: "assistant",
      parts: [
        {
          type: `tool-${SET_THREAD_TITLE_TOOL}`,
          toolCallId: "tc-1",
          state: "output-available",
          input: { title: "剪贴板去重" },
          output: formatLocalToolResult({
            action: SET_THREAD_TITLE_TOOL,
            success: true,
            title: "剪贴板去重",
          }),
        },
      ],
    },
  ];

  assert.equal(extractThreadTitleFromMessages(messages), "剪贴板去重");
});
