import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildToolTestChatExportPayload,
  buildToolTestThreadStub,
} from "@/lib/tool-test-chat-export";
import type { AgentUIMessage } from "@/lib/chat-types";

test("buildToolTestChatExportPayload uses live messages and thread meta", () => {
  const messages: AgentUIMessage[] = [
    {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "hello" }],
    },
  ];
  const meta = {
    threadId: "tool-test-qb-demo",
    title: "统计用户动作获赞总数",
    workingDirectory: "D:/bench/ws-1",
    startedAt: 1_700_000_000_000,
  };
  const payload = buildToolTestChatExportPayload(meta, messages);
  assert.equal(payload.format, "quicker-agent-chat-export");
  assert.equal(payload.thread.id, meta.threadId);
  assert.equal(payload.thread.title, meta.title);
  assert.equal(payload.thread.workingDirectory, meta.workingDirectory);
  assert.equal(payload.stats.messageCount, 1);
  assert.equal(payload.messages, messages);
});

test("buildToolTestThreadStub seeds empty persisted messages", () => {
  const stub = buildToolTestThreadStub({
    threadId: "x",
    title: "t",
    startedAt: 1,
  });
  assert.deepEqual(stub.messages, []);
  assert.equal(stub.titleGenerated, true);
});
