import test from "node:test";
import assert from "node:assert/strict";
import {
  extractJsonObjectsAfterMarker,
  extractJsonPayloadFromOffset,
} from "./legacy-leveldb-json.ts";

function toUtf16Le(text: string): Buffer {
  const out = Buffer.alloc(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    out.writeUInt16LE(text.charCodeAt(i), i * 2);
  }
  return out;
}

test("extracts UTF-8 JSON after marker", () => {
  const blob = Buffer.from(
    'prefix agent-gui-chats\x00{"version":2,"threads":[{"id":"a","messages":[{"role":"user","content":"hi"}]}]}',
    "utf8",
  );
  const jsons = extractJsonObjectsAfterMarker(blob, "agent-gui-chats");
  assert.equal(jsons.length, 1);
  assert.equal(JSON.parse(jsons[0]!).version, 2);
});

test("extracts UTF-16 LE JSON after marker", () => {
  const payload =
    '{"version":2,"threads":[{"id":"b","title":"t","messages":[{"role":"user","content":"hello"}],"updatedAt":1}]}';
  const blob = Buffer.concat([
    Buffer.from("prefix "),
    toUtf16Le("agent-gui-chats"),
    Buffer.from([0x00, 0x00]),
    toUtf16Le(payload),
  ]);
  const jsons = extractJsonObjectsAfterMarker(blob, "agent-gui-chats");
  assert.equal(jsons.length, 1);
  const parsed = JSON.parse(jsons[0]!) as { threads: Array<{ messages: unknown[] }> };
  assert.equal(parsed.threads[0]!.messages.length, 1);
});

test("extractJsonPayloadFromOffset prefers UTF-16 when framed", () => {
  const payload = '{"ok":true}';
  const bytes = toUtf16Le(payload);
  const json = extractJsonPayloadFromOffset(bytes, 0);
  assert.equal(json, payload);
});
