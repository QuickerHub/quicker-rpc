import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  parseChatThreadExportPayload,
  writeChatThreadExportFile,
} from "@/lib/chat-thread-export.server";
import { resolvePathWithinRevealScope } from "@/lib/reveal-path-in-file-manager.server";
import {
  CHAT_THREAD_EXPORT_FORMAT,
  CHAT_THREAD_EXPORT_VERSION,
} from "@/lib/chat-thread-export";

test("writeChatThreadExportFile writes under exports directory", () => {
  const previous = process.env.APPDATA;
  const root = mkdtempSync(join(tmpdir(), "chat-export-test-"));
  process.env.APPDATA = root;
  try {
    const { path, exportsDirectory } = writeChatThreadExportFile(
      "sample-export.json",
      '{"ok":true}\n',
    );
    assert.equal(readFileSync(path, "utf8"), '{"ok":true}\n');
    assert.ok(exportsDirectory.endsWith("exports"));
    assert.ok(path.includes("exports"));
  } finally {
    if (previous === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previous;
  }
});

test("resolvePathWithinRevealScope accepts written chat export files", () => {
  const previous = process.env.APPDATA;
  const root = mkdtempSync(join(tmpdir(), "chat-export-guard-"));
  process.env.APPDATA = root;
  try {
    const { path } = writeChatThreadExportFile("inside.json", "{}");
    assert.equal(
      resolvePathWithinRevealScope("chat-exports", path, { mustExist: true }),
      path,
    );
  } finally {
    if (previous === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previous;
  }
});

test("parseChatThreadExportPayload validates format and messages", () => {
  assert.throws(
    () => parseChatThreadExportPayload({ format: "other" }),
    /Unsupported export payload format/,
  );
  const payload = parseChatThreadExportPayload({
    format: CHAT_THREAD_EXPORT_FORMAT,
    version: CHAT_THREAD_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    thread: { id: "t1", title: "Test", updatedAt: 1 },
    stats: {
      messageCount: 0,
      userTurnCount: 0,
      sessionUsage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        reasoningTokens: 0,
        assistantTurns: 0,
      },
    },
    messages: [],
  });
  assert.equal(payload.thread.id, "t1");
});
