import assert from "node:assert/strict";
import test from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  finalizeStreamingReasoningParts,
  hasIncompleteToolCalls,
  INTERRUPTED_TOOL_ERROR_TEXT,
  repairInterruptedToolCalls,
} from "./repair-interrupted-tool-calls.ts";

test("repairInterruptedToolCalls marks in-flight tool as output-error", () => {
  const messages: AgentUIMessage[] = [
    {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "create action" }],
    },
    {
      id: "a1",
      role: "assistant",
      parts: [
        {
          type: "tool-qkrpc_action_create",
          toolCallId: "call_00_abc",
          state: "input-available",
          input: { title: "Test" },
        },
      ],
    },
  ];

  assert.equal(hasIncompleteToolCalls(messages), true);
  const repaired = repairInterruptedToolCalls(messages);
  const toolPart = repaired[1]!.parts[0] as {
    state: string;
    errorText?: string;
  };
  assert.equal(toolPart.state, "output-error");
  assert.equal(toolPart.errorText, INTERRUPTED_TOOL_ERROR_TEXT);
  assert.equal(hasIncompleteToolCalls(repaired), false);
});

test("repairInterruptedToolCalls marks approval-requested as output-denied", () => {
  const messages: AgentUIMessage[] = [
    {
      id: "a1",
      role: "assistant",
      parts: [
        {
          type: "tool-qkrpc_action_delete",
          toolCallId: "call_del",
          state: "approval-requested",
          input: { id: "00000000-0000-0000-0000-000000000001" },
          approval: { id: "approval_1" },
        },
      ],
    },
  ];

  const repaired = repairInterruptedToolCalls(messages);
  const toolPart = repaired[0]!.parts[0] as {
    state: string;
    approval?: { approved?: boolean; reason?: string };
  };
  assert.equal(toolPart.state, "output-denied");
  assert.equal(toolPart.approval?.approved, false);
  assert.equal(toolPart.approval?.reason, INTERRUPTED_TOOL_ERROR_TEXT);
});

test("repairInterruptedToolCalls is a no-op when tools already finished", () => {
  const messages: AgentUIMessage[] = [
    {
      id: "a1",
      role: "assistant",
      parts: [
        {
          type: "tool-qkrpc_action_create",
          toolCallId: "call_ok",
          state: "output-available",
          input: { title: "Done" },
          output: { ok: true, exitCode: 0, data: {} },
        },
      ],
    },
  ];

  assert.equal(repairInterruptedToolCalls(messages), messages);
});

test("finalizeStreamingReasoningParts marks streaming reasoning as done", () => {
  const messages: AgentUIMessage[] = [
    {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "thinking…", state: "streaming" },
        { type: "text", text: "partial", state: "streaming" },
      ],
    },
  ];

  const finalized = finalizeStreamingReasoningParts(messages);
  const reasoningPart = finalized[0]!.parts[0] as { state?: string };
  const textPart = finalized[0]!.parts[1] as { state?: string };
  assert.equal(reasoningPart.state, "done");
  assert.equal(textPart.state, "streaming");
});

test("finalizeStreamingReasoningParts is a no-op when reasoning is done", () => {
  const messages: AgentUIMessage[] = [
    {
      id: "a1",
      role: "assistant",
      parts: [{ type: "reasoning", text: "done thinking", state: "done" }],
    },
  ];

  assert.equal(finalizeStreamingReasoningParts(messages), messages);
});

test("repairInterruptedToolCalls also finalizes streaming reasoning", () => {
  const messages: AgentUIMessage[] = [
    {
      id: "a1",
      role: "assistant",
      parts: [{ type: "reasoning", text: "thinking…", state: "streaming" }],
    },
  ];

  const repaired = repairInterruptedToolCalls(messages);
  const reasoningPart = repaired[0]!.parts[0] as { state?: string };
  assert.equal(reasoningPart.state, "done");
});
