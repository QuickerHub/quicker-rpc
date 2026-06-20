import assert from "node:assert/strict";
import test from "node:test";
import {
  clearThreadNeedsAttention,
  getThreadAttentionVersion,
  isThreadNeedsAttention,
  markThreadNeedsAttention,
} from "@/lib/thread-attention";

test("thread-attention: mark, query, and clear", () => {
  const before = getThreadAttentionVersion();
  markThreadNeedsAttention("thread-a");
  assert.equal(isThreadNeedsAttention("thread-a"), true);
  assert.equal(isThreadNeedsAttention("thread-b"), false);
  assert.ok(getThreadAttentionVersion() > before);

  clearThreadNeedsAttention("thread-a");
  assert.equal(isThreadNeedsAttention("thread-a"), false);
});

test("thread-attention: mark is idempotent", () => {
  markThreadNeedsAttention("thread-x");
  const version = getThreadAttentionVersion();
  markThreadNeedsAttention("thread-x");
  assert.equal(getThreadAttentionVersion(), version);
  clearThreadNeedsAttention("thread-x");
});
