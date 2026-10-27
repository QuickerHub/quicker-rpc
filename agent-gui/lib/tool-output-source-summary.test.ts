import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeToolOutput } from "./tool-output-summary";
import { QKRPC_ACTION_SAVE_TOOL } from "./qkrpc-action-source";
import { formatLocalToolResult } from "./tool-result";

const metadataInput = Object.freeze({ id: "11111111-1111-4111-8111-111111111111", title: "New requested title" });

test("failed metadata output retains its failure instead of the requested title", () => {
  const data = Object.freeze({ error: "EDIT_VERSION_CONFLICT" });
  const displayData = Object.freeze({ error: "EDIT_VERSION_CONFLICT", detail: "Full UI-only failure detail" });
  const output = Object.freeze({ ...formatLocalToolResult(data, false, "The action version changed"), displayData });
  const before = JSON.stringify({ input: metadataInput, output });
  assert.equal(summarizeToolOutput("qkrpc_action_set_metadata", output, metadataInput), "失败 · EDIT_VERSION_CONFLICT");
  assert.equal(JSON.stringify({ input: metadataInput, output }), before);
  assert.equal(output.data, data); assert.equal(output.displayData, displayData);
});

test("successful metadata output still uses the requested title without changing its receipt", () => {
  const data = Object.freeze({ actionId: metadataInput.id });
  const output = Object.freeze(formatLocalToolResult(data));
  const before = JSON.stringify({ input: metadataInput, output });
  assert.equal(summarizeToolOutput("qkrpc_action_set_metadata", output, metadataInput), metadataInput.title);
  assert.equal(JSON.stringify({ input: metadataInput, output }), before); assert.equal(output.data, data);
});

test("unknown failed tools with title or name inputs retain the generic failure fallback", () => {
  for (const input of [Object.freeze({ title: "Requested title" }), Object.freeze({ name: "Requested name" })]) {
    const output = Object.freeze(formatLocalToolResult(Object.freeze({ detail: "Original failure body" }), false, "Extension unavailable"));
    const before = JSON.stringify({ input, output });
    assert.equal(summarizeToolOutput("unknown_extension_tool", output, input), "失败 · Extension unavailable");
    assert.equal(JSON.stringify({ input, output }), before);
  }
});

test("actual chat summary retains partial persistence and conflicts before the generic failure branch", () => {
  const input = { dir: ".tmp/quicker/source", dryRun: false };
  const native = { ok: true, dryRun: false, persisted: true, editVersion: 9 };
  const partial = formatLocalToolResult(native, false, "CLI exited after payload");
  assert.match(summarizeToolOutput(QKRPC_ACTION_SAVE_TOOL, partial, input)!, /已写入动作.*需核对.*勿重试/);
  assert.equal(partial.data, native);
  assert.match(summarizeToolOutput(QKRPC_ACTION_SAVE_TOOL, formatLocalToolResult({
    ok: false, error: "EDIT_VERSION_CONFLICT", data: { versionConflict: true },
  }, false), input)!, /版本冲突.*未保存/);
  assert.match(summarizeToolOutput(QKRPC_ACTION_SAVE_TOOL, formatLocalToolResult({
    ok: false, error: "SOURCE_CHECKPOINT_FAILED", data: { persisted: true },
  }, false), input)!, /已写入动作.*基线更新失败.*勿重试/);
});
