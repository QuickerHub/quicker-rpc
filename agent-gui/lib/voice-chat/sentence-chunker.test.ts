import assert from "node:assert/strict";
import test from "node:test";
import {
  drainSpeakableChunks,
  flushSpeakableChunk,
} from "@/lib/voice-chat/sentence-chunker";

test("drainSpeakableChunks splits on Chinese sentence end", () => {
  const { chunks, rest } = drainSpeakableChunks("你好，我是助手。今天天气不错！还有");
  assert.deepEqual(chunks, ["你好，我是助手。", "今天天气不错！"]);
  assert.equal(rest, "还有");
});

test("flushSpeakableChunk returns trailing text", () => {
  assert.equal(flushSpeakableChunk(" 收尾 "), "收尾");
  assert.equal(flushSpeakableChunk("   "), null);
});
