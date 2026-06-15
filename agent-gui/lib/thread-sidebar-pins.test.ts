import assert from "node:assert/strict";
import test from "node:test";
import {
  pinThreadId,
  resolvePinnedThreads,
  unpinThreadId,
} from "./thread-sidebar-pins.ts";
import type { ChatThread } from "./chat-store.ts";

function thread(id: string): ChatThread {
  return {
    id,
    title: id,
    messages: [],
    updatedAt: 0,
  };
}

test("pinThreadId prepends and dedupes", () => {
  assert.deepEqual(pinThreadId(["b"], "a"), ["a", "b"]);
  assert.deepEqual(pinThreadId(["a", "b"], "a"), ["a", "b"]);
});

test("unpinThreadId removes id", () => {
  assert.deepEqual(unpinThreadId(["a", "b"], "a"), ["b"]);
});

test("resolvePinnedThreads preserves pin order and drops missing", () => {
  const threads = [thread("a"), thread("b"), thread("c")];
  assert.deepEqual(
    resolvePinnedThreads(threads, ["c", "missing", "a"]).map((t) => t.id),
    ["c", "a"],
  );
});
