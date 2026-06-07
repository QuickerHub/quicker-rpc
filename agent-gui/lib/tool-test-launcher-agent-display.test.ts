import assert from "node:assert/strict";
import test from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  planLauncherAgentDisplay,
} from "./tool-test-launcher-agent-display.ts";
import { stripModelChannelMarkers } from "./repair-tool-call.ts";

test("stripModelChannelMarkers removes channel tokens", () => {
  assert.equal(
    stripModelChannelMarkers("foo<|channel|>commentary bar"),
    "foo bar",
  );
});

test("planLauncherAgentDisplay flattens tools and truncates after execution", () => {
  const messages = [
    {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "打开基本选项" }],
    },
    {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "long thought", state: "done" },
        {
          type: "tool-launcher_resolve",
          toolCallId: "t1",
          state: "output-error",
          input: { query: "x" },
          output: { ok: false },
        },
        { type: "text", text: "noise<|channel|>commentary" },
        {
          type: "tool-quicker_settings",
          toolCallId: "t2",
          state: "input-available",
          input: { action: "open", page: "basic" },
        },
        {
          type: "tool-qkrpc_action",
          toolCallId: "t3",
          state: "input-available",
          input: { action: "run" },
        },
      ],
    },
  ] as AgentUIMessage[];

  const plan = planLauncherAgentDisplay(messages, {
    responseCompletionKind: "execution",
  });

  assert.equal(plan.userPrompt, "打开基本选项");
  assert.equal(plan.visibleTools.length, 2);
  assert.equal(plan.visibleTools[0]?.name, "launcher_resolve");
  assert.equal(plan.visibleTools[1]?.name, "quicker_settings");
  assert.equal(plan.hidden.reasoningBlocks, 1);
  assert.equal(plan.hidden.assistantTextParts, 1);
  assert.equal(plan.hidden.toolsAfterExecution, 1);
});
