import assert from "node:assert/strict";
import test from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  isLauncherDirectAssistantMessage,
  lastAssistantMessageIsCompleteWithClientResponses,
} from "@/lib/chat-auto-submit";

function assistantWithToolOutput(metadata?: AgentUIMessage["metadata"]): AgentUIMessage {
  return {
    id: "a1",
    role: "assistant",
    metadata,
    parts: [
      {
        type: "tool-qkrpc_action",
        toolCallId: "tc1",
        state: "output-available",
        input: { action: "run", id: "x" },
        output: { ok: true },
      },
    ],
  };
}

test("isLauncherDirectAssistantMessage detects cache/resolve direct metadata", () => {
  assert.equal(
    isLauncherDirectAssistantMessage(
      assistantWithToolOutput({ launcherCacheDirect: true }),
    ),
    true,
  );
  assert.equal(
    isLauncherDirectAssistantMessage(
      assistantWithToolOutput({ launcherResolveDirect: true }),
    ),
    true,
  );
  assert.equal(
    isLauncherDirectAssistantMessage(
      assistantWithToolOutput({ model: "launcher-cache" }),
    ),
    true,
  );
  assert.equal(
    isLauncherDirectAssistantMessage(
      assistantWithToolOutput({ model: "launcher-resolve" }),
    ),
    true,
  );
  assert.equal(
    isLauncherDirectAssistantMessage(
      assistantWithToolOutput({ model: "gpt-4" }),
    ),
    false,
  );
});

test("lastAssistantMessageIsCompleteWithClientResponses skips launcher direct", () => {
  const user: AgentUIMessage = {
    id: "u1",
    role: "user",
    parts: [{ type: "text", text: "打开设置" }],
  };
  const direct = assistantWithToolOutput({ model: "launcher-cache" });
  assert.equal(
    lastAssistantMessageIsCompleteWithClientResponses({
      messages: [user, direct],
    }),
    false,
  );
});

test("lastAssistantMessageIsCompleteWithClientResponses still resumes normal tool chains", () => {
  const user: AgentUIMessage = {
    id: "u1",
    role: "user",
    parts: [{ type: "text", text: "run action" }],
  };
  const llm = assistantWithToolOutput({ model: "gpt-4" });
  assert.equal(
    lastAssistantMessageIsCompleteWithClientResponses({
      messages: [user, llm],
    }),
    true,
  );
});
