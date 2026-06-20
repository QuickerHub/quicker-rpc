import assert from "node:assert/strict";
import test from "node:test";
import {
  applyModelFacingToolOutputToToolMap,
  toolOutputToModelJson,
  withModelFacingToolOutput,
} from "@/lib/tool-model-output";
import { tool } from "ai";
import { z } from "zod";

test("toolOutputToModelJson strips displayData", () => {
  const result = toolOutputToModelJson({
    ok: true,
    exitCode: 0,
    data: { eventCount: 4 },
    displayData: { events: [1, 2, 3] },
  });
  assert.equal(result.type, "json");
  const value = result.value as Record<string, unknown>;
  assert.equal(value.displayData, undefined);
  assert.deepEqual(value.data, { eventCount: 4 });
});

test("withModelFacingToolOutput wires toModelOutput on tool()", async () => {
  const wrapped = withModelFacingToolOutput(
    tool({
      description: "test",
      inputSchema: z.object({ x: z.number() }),
      execute: async () => ({
        ok: true,
        exitCode: 0,
        data: { a: 1 },
        displayData: { big: true },
      }),
    }),
  );
  assert.ok(wrapped.toModelOutput);
  const model = await wrapped.toModelOutput!({
    toolCallId: "tc1",
    input: { x: 1 },
    output: {
      ok: true,
      exitCode: 0,
      data: { a: 1 },
      displayData: { big: true },
    },
  });
  assert.equal(model.type, "json");
  assert.equal((model.value as Record<string, unknown>).displayData, undefined);
});

test("applyModelFacingToolOutputToToolMap wraps every entry", () => {
  const bag = applyModelFacingToolOutputToToolMap({
    a: tool({
      description: "a",
      inputSchema: z.object({}),
      execute: async () => ({ ok: true }),
    }),
  });
  assert.ok(bag.a.toModelOutput);
});
