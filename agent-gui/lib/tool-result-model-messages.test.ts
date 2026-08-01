import assert from "node:assert/strict";
import test from "node:test";
import {
  buildModelFacingToolOutput,
  TOOL_OUTPUT_MAX_INLINE_CHARS,
} from "@/lib/tool-result-model-messages";
import { formatToolModelPayloadJson } from "@/lib/tool-result-agent-view-display";

test("buildModelFacingToolOutput strips displayData", () => {
  const output = {
    ok: true,
    exitCode: 0,
    data: { eventCount: 4 },
    displayData: { events: [{ kind: "step_begin" }] },
    summary: "debug ok · 4 events",
  };
  const facing = buildModelFacingToolOutput(output);
  assert.equal((facing as { displayData?: unknown }).displayData, undefined);
  assert.equal((facing as { summary?: string }).summary, "debug ok · 4 events");
});

test("formatToolModelPayloadJson matches model-facing object", () => {
  const output = {
    ok: true,
    exitCode: 0,
    data: { matches: [] },
    summary: "grep foo · 0/0 matches",
  };
  const json = formatToolModelPayloadJson(output);
  assert.ok(json);
  assert.match(json!, /grep foo/);
});

test("buildModelFacingToolOutput deterministically projects oversized payloads", () => {
  const output = {
    ok: true,
    exitCode: 0,
    data: { text: "x".repeat(TOOL_OUTPUT_MAX_INLINE_CHARS * 2) },
    stderr: "e".repeat(TOOL_OUTPUT_MAX_INLINE_CHARS),
  };
  const facing = buildModelFacingToolOutput(output) as {
    truncated: boolean;
    data: { kind: string; originalChars: number; head: string; tail: string };
  };
  assert.equal(facing.truncated, true);
  assert.equal(facing.data.kind, "tool_output_projection");
  assert.ok(facing.data.originalChars > TOOL_OUTPUT_MAX_INLINE_CHARS);
  assert.ok(facing.data.head.length > facing.data.tail.length);
  assert.ok(JSON.stringify(facing).length < TOOL_OUTPUT_MAX_INLINE_CHARS);
});
