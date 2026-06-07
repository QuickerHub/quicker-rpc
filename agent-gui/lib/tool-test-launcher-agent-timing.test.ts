import assert from "node:assert/strict";
import test from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  computeLauncherAgentResponseDurationMs,
  computeLauncherAgentStartupDurationMs,
  findFirstExecutionToolName,
  formatLauncherAgentTimingMs,
  hasAssistantResponseStarted,
  isLauncherExecutionToolName,
} from "./tool-test-launcher-agent-timing.ts";

test("isLauncherExecutionToolName excludes resolve/cache only", () => {
  assert.equal(isLauncherExecutionToolName("launcher_resolve"), false);
  assert.equal(isLauncherExecutionToolName("launcher_command_cache"), false);
  assert.equal(isLauncherExecutionToolName("quicker_settings"), true);
  assert.equal(isLauncherExecutionToolName("qkrpc_action"), true);
});

test("hasAssistantResponseStarted detects first assistant parts", () => {
  assert.equal(hasAssistantResponseStarted([]), false);
  assert.equal(
    hasAssistantResponseStarted([
      { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
    ] as AgentUIMessage[]),
    false,
  );
  assert.equal(
    hasAssistantResponseStarted([
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "ok" }] },
    ] as AgentUIMessage[]),
    true,
  );
});

test("findFirstExecutionToolName skips resolve then returns execution tool", () => {
  const messages = [
    {
      id: "a1",
      role: "assistant",
      parts: [
        {
          type: "tool-launcher_resolve",
          toolCallId: "t1",
          state: "output-available",
          input: { query: "x" },
          output: { ok: true },
        },
        {
          type: "tool-quicker_settings",
          toolCallId: "t2",
          state: "input-available",
          input: { action: "open", page: "hotkeys" },
        },
      ],
    },
  ] as AgentUIMessage[];

  assert.equal(findFirstExecutionToolName(messages), "quicker_settings");
});

test("compute durations and format", () => {
  assert.equal(
    computeLauncherAgentResponseDurationMs({
      responseStartedAt: 1000,
      responseCompletedAt: 1450,
    }),
    450,
  );
  assert.equal(
    computeLauncherAgentStartupDurationMs({
      runStartedAt: 800,
      responseCompletedAt: 1450,
    }),
    650,
  );
  assert.equal(formatLauncherAgentTimingMs(450), "450ms");
  assert.equal(formatLauncherAgentTimingMs(2500), "2.50s");
});
