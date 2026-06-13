import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatThread } from "@/lib/chat-store";
import {
  cwdGroupLabel,
  formatThreadRelativeTime,
  groupThreadsByCwd,
  normalizeCwdKey,
} from "@/lib/thread-cwd-groups";

function thread(id: string, cwd: string, updatedAt: number): ChatThread {
  return {
    id,
    title: id,
    messages: [],
    updatedAt,
    workingDirectory: cwd,
    messageCount: 0,
  };
}

test("normalizeCwdKey is case-insensitive and slash-normalized", () => {
  assert.equal(
    normalizeCwdKey("D:\\Projects\\Quicker"),
    normalizeCwdKey("d:/projects/quicker"),
  );
});

test("cwdGroupLabel uses folder basename or default label", () => {
  assert.equal(cwdGroupLabel("D:\\projects\\quicker-rpc", "默认"), "quicker-rpc");
  assert.equal(cwdGroupLabel("", "默认"), "默认");
});

test("groupThreadsByCwd groups and sorts by latest activity", () => {
  const groups = groupThreadsByCwd(
    [
      thread("a", "D:\\projects\\quicker-rpc", 100),
      thread("b", "D:\\projects\\quicker-rpc", 200),
      thread("c", "D:\\other", 300),
    ],
    "默认",
  );
  assert.equal(groups.length, 2);
  assert.equal(groups[0]!.label, "other");
  assert.equal(groups[0]!.threads.length, 1);
  assert.equal(groups[1]!.threads[0]!.id, "b");
});

test("formatThreadRelativeTime renders Chinese relative labels", () => {
  const now = 1_700_000_000_000;
  assert.equal(formatThreadRelativeTime(now - 30_000, now), "刚刚");
  assert.equal(formatThreadRelativeTime(now - 3_600_000, now), "1 小时");
  assert.equal(formatThreadRelativeTime(now - 86_400_000, now), "1 天");
});
