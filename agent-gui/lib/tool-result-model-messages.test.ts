import assert from "node:assert/strict";
import test from "node:test";
import { buildModelFacingToolOutput } from "@/lib/tool-result-model-messages";
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
