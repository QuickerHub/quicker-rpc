import assert from "node:assert/strict";
import test from "node:test";
import { sliceToolModelPayload } from "@/lib/tool-model-payload-view";

test("sliceToolModelPayload splits data and model output", () => {
  const output = {
    ok: true,
    exitCode: 0,
    data: { eventCount: 4, durationMs: 5777 },
    displayData: { events: [{ kind: "step_begin" }] },
    summary: "debug ok",
  };
  const slices = sliceToolModelPayload({ id: "x" }, output);
  assert.ok(slices);
  assert.equal(slices.kind, "structured");
  assert.deepEqual(slices.data, { eventCount: 4, durationMs: 5777 });
  assert.ok(slices.hasDisplayDataSlice);
  assert.equal(
    (slices.modelOutput as { displayData?: unknown }).displayData,
    undefined,
  );
  assert.deepEqual(
    (slices.modelOutput as { data: unknown }).data,
    { eventCount: 4, durationMs: 5777 },
  );
  assert.ok(slices.modelChars < JSON.stringify(output).length);
});

test("sliceToolModelPayload handles plain output", () => {
  const slices = sliceToolModelPayload(undefined, { text: "ok" });
  assert.ok(slices);
  assert.equal(slices.kind, "plain");
  assert.deepEqual(slices.modelOutput, { text: "ok" });
});
