import assert from "node:assert/strict";
import test from "node:test";
import { NoSuchToolError } from "ai";
import {
  normalizeToolCallName,
  repairCorruptedToolCall,
  resolveKnownToolName,
  stripModelChannelMarkers,
} from "./repair-tool-call.ts";

const TOOLS = {
  launcher_resolve: {},
  quicker_settings: {},
  qkrpc_action_query: {},
  qkrpc_action: {},
};

test("stripModelChannelMarkers removes harmony channel tokens", () => {
  assert.equal(
    stripModelChannelMarkers("quicker_settings<|channel|>commentary"),
    "quicker_settings",
  );
});

test("normalizeToolCallName maps spaced labels to snake_case ids", () => {
  assert.equal(
    normalizeToolCallName("quicker settings<|channel|>commentary"),
    "quicker_settings",
  );
});

test("resolveKnownToolName prefers longer tool ids", () => {
  assert.equal(
    resolveKnownToolName("qkrpc_action_query", Object.keys(TOOLS)),
    "qkrpc_action_query",
  );
  assert.equal(
    resolveKnownToolName("qkrpc_action", Object.keys(TOOLS)),
    "qkrpc_action",
  );
});

test("repairCorruptedToolCall fixes NoSuchToolError names", () => {
  const error = new NoSuchToolError({
    toolName: "quicker_settings<|channel|>commentary",
    availableTools: Object.keys(TOOLS),
  });
  const repaired = repairCorruptedToolCall({
    toolCall: {
      type: "tool-call",
      toolCallId: "call-1",
      toolName: "quicker_settings<|channel|>commentary",
      input: JSON.stringify({ action: "open", preset: "basic" }),
    },
    tools: TOOLS,
    error,
  });
  assert.equal(repaired?.toolName, "quicker_settings");
});
