import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeToolOutput } from "@/components/chat/tool-output";
import { QKRPC_ACTION_SAVE_TOOL } from "./qkrpc-action-source";
import { formatLocalToolResult } from "./tool-result";

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
