import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildActivityBatchSummary,
  buildToolBatchSummary,
  segmentMessageParts,
} from "./tool-part-layout.ts";

test("segmentMessageParts groups consecutive reasoning and tools into activity-batch", () => {
  const parts = [
    { type: "reasoning", text: "plan", state: "done" },
    {
      type: "tool-qkrpc_guide_get",
      toolCallId: "t1",
      state: "output-available",
      input: { topic: "authoring-workflow" },
      output: { ok: true },
    },
    { type: "reasoning", text: "icons", state: "done" },
    {
      type: "tool-qkrpc_fa_search",
      toolCallId: "t2",
      state: "output-available",
      input: { query: "file" },
      output: { ok: true },
    },
    { type: "text", text: "Done.", state: "done" },
  ] as Parameters<typeof segmentMessageParts>[0];

  const segments = segmentMessageParts(parts);

  assert.equal(segments.length, 2);
  assert.equal(segments[0]?.kind, "activity-batch");
  assert.equal(
    segments[0]?.kind === "activity-batch" ? segments[0].items.length : 0,
    4,
  );
  assert.equal(segments[1]?.kind, "text");
});

test("segmentMessageParts keeps reasoning-only runs as reasoning segment", () => {
  const parts = [
    { type: "reasoning", text: "a", state: "done" },
    { type: "reasoning", text: "b", state: "done" },
    { type: "text", text: "hi", state: "done" },
  ] as Parameters<typeof segmentMessageParts>[0];

  const segments = segmentMessageParts(parts);
  assert.equal(segments.length, 2);
  assert.equal(segments[0]?.kind, "reasoning");
  assert.equal(
    segments[0]?.kind === "reasoning" ? segments[0].items.length : 0,
    2,
  );
});

test("segmentMessageParts keeps multi-tool runs as tool-batch", () => {
  const parts = [
    {
      type: "tool-qkrpc_fa_search",
      toolCallId: "t1",
      state: "output-available",
      input: { query: "a" },
      output: { ok: true },
    },
    {
      type: "tool-qkrpc_fa_search",
      toolCallId: "t2",
      state: "output-available",
      input: { query: "b" },
      output: { ok: true },
    },
    { type: "text", text: "ok", state: "done" },
  ] as Parameters<typeof segmentMessageParts>[0];

  const segments = segmentMessageParts(parts);
  assert.equal(segments.length, 2);
  assert.equal(segments[0]?.kind, "tool-batch");
});

test("buildActivityBatchSummary uses tool title for mixed runs", () => {
  const summary = buildActivityBatchSummary([
    { kind: "reasoning", part: { type: "reasoning", text: "plan", state: "done" }, index: 0 },
    {
      kind: "tool",
      part: {
        type: "tool-qkrpc_fa_search",
        toolCallId: "t1",
        state: "output-available",
        input: { query: "file" },
        output: { ok: true },
      },
      index: 1,
      name: "qkrpc_fa_search",
      displayName: "图标",
      state: "output-available",
      meta: "20 个图标",
      isRunning: false,
      needsAttention: false,
    },
  ] as Parameters<typeof buildActivityBatchSummary>[0]);

  assert.equal(summary.title, "图标");
  assert.equal(summary.meta, "2 步 · 完成");
});

test("buildActivityBatchSummary aggregates write line diff when collapsed", () => {
  const summary = buildActivityBatchSummary([
    { kind: "reasoning", part: { type: "reasoning", text: "plan", state: "done" }, index: 0 },
    {
      kind: "tool",
      part: {
        type: "tool-workspace_action_write_data",
        toolCallId: "t1",
        state: "output-available",
        input: { id: "a", content: '{\n  "a": 2\n}\n' },
        output: {
          ok: true,
          exitCode: 0,
          data: {
            action: "program-data-write",
            previousContent: '{\n  "a": 1\n}\n',
            content: '{\n  "a": 2\n}\n',
          },
        },
      },
      index: 1,
      name: "workspace_action_write_data",
      displayName: "write-data",
      state: "output-available",
      meta: "data.json · +1 -1",
      isRunning: false,
      needsAttention: false,
    },
    {
      kind: "tool",
      part: {
        type: "tool-workspace_program",
        toolCallId: "t2",
        state: "output-available",
        input: {
          action: "file_write",
          path: "notes.txt",
          content: "b\n",
        },
        output: {
          ok: true,
          exitCode: 0,
          data: {
            action: "file-write",
            previousContent: "a\n",
            content: "b\n",
          },
        },
      },
      index: 2,
      name: "workspace_program",
      displayName: "write",
      state: "output-available",
      meta: "notes.txt · +1 -1",
      isRunning: false,
      needsAttention: false,
    },
  ] as Parameters<typeof buildActivityBatchSummary>[0]);

  assert.equal(summary.title, "write-data、write");
  assert.equal(summary.meta, "+2 -2 · 完成");
});

test("buildToolBatchSummary aggregates write line diff for pure tool batches", () => {
  const summary = buildToolBatchSummary([
    {
      part: {
        type: "tool-workspace_action_write_data",
        toolCallId: "t1",
        state: "output-available",
        input: { id: "a", content: "x\ny\n" },
        output: {
          ok: true,
          exitCode: 0,
          data: {
            action: "program-data-write",
            previousContent: "x\n",
            content: "x\ny\n",
          },
        },
      },
      index: 0,
      name: "workspace_action_write_data",
      displayName: "write-data",
      state: "output-available",
      meta: "+1 -0",
      isRunning: false,
      needsAttention: false,
    },
    {
      part: {
        type: "tool-workspace_action_write_data",
        toolCallId: "t2",
        state: "output-available",
        input: { id: "b", content: "a\n" },
        output: {
          ok: true,
          exitCode: 0,
          data: {
            action: "program-data-write",
            previousContent: "a\nb\n",
            content: "a\n",
          },
        },
      },
      index: 1,
      name: "workspace_action_write_data",
      displayName: "write-data",
      state: "output-available",
      meta: "+0 -1",
      isRunning: false,
      needsAttention: false,
    },
  ] as Parameters<typeof buildToolBatchSummary>[0]);

  assert.equal(summary.meta, "+1 -1 · 完成");
});

test("segmentMessageParts ignores whitespace text between activity parts", () => {
  const parts = [
    { type: "reasoning", text: "icons-a", state: "done" },
    {
      type: "tool-qkrpc_fa_search",
      toolCallId: "t1",
      state: "output-available",
      input: { query: "file" },
      output: { ok: true },
    },
    { type: "text", text: "   ", state: "done" },
    { type: "reasoning", text: "icons-b", state: "done" },
    {
      type: "tool-qkrpc_fa_search",
      toolCallId: "t2",
      state: "output-available",
      input: { query: "file text" },
      output: { ok: true },
    },
  ] as Parameters<typeof segmentMessageParts>[0];

  const segments = segmentMessageParts(parts);
  assert.equal(segments.length, 1);
  assert.equal(segments[0]?.kind, "activity-batch");
  assert.equal(
    segments[0]?.kind === "activity-batch" ? segments[0].items.length : 0,
    4,
  );
});

test("segmentMessageParts merges consecutive activity-batches after split", () => {
  const segments = segmentMessageParts([
    { type: "reasoning", text: "a", state: "done" },
    {
      type: "tool-qkrpc_fa_search",
      toolCallId: "t1",
      state: "output-available",
      input: { query: "file" },
      output: { ok: true },
    },
    { type: "text", text: " ", state: "done" },
    { type: "reasoning", text: "b", state: "done" },
    {
      type: "tool-qkrpc_fa_search",
      toolCallId: "t2",
      state: "output-available",
      input: { query: "file" },
      output: { ok: true },
    },
    { type: "reasoning", text: "c", state: "done" },
    {
      type: "tool-qkrpc_fa_search",
      toolCallId: "t3",
      state: "output-available",
      input: { query: "file" },
      output: { ok: true },
    },
    {
      type: "tool-qkrpc_fa_search",
      toolCallId: "t4",
      state: "output-available",
      input: { query: "file text" },
      output: { ok: true },
    },
  ] as Parameters<typeof segmentMessageParts>[0]);

  assert.equal(segments.length, 1);
  assert.equal(segments[0]?.kind, "activity-batch");
  assert.equal(
    segments[0]?.kind === "activity-batch" ? segments[0].items.length : 0,
    7,
  );
});

test("segmentMessageParts still splits on substantive assistant text", () => {
  const segments = segmentMessageParts([
    { type: "reasoning", text: "a", state: "done" },
    {
      type: "tool-qkrpc_fa_search",
      toolCallId: "t1",
      state: "output-available",
      input: { query: "file" },
      output: { ok: true },
    },
    { type: "text", text: "已选好图标。", state: "done" },
    { type: "reasoning", text: "b", state: "done" },
    {
      type: "tool-qkrpc_fa_search",
      toolCallId: "t2",
      state: "output-available",
      input: { query: "folder" },
      output: { ok: true },
    },
  ] as Parameters<typeof segmentMessageParts>[0]);

  assert.equal(segments.length, 3);
  assert.equal(segments[0]?.kind, "activity-batch");
  assert.equal(segments[1]?.kind, "text");
  assert.equal(segments[2]?.kind, "activity-batch");
});

test("segmentMessageParts flushes activity before shell tool", () => {
  const parts = [
    { type: "reasoning", text: "run", state: "done" },
    {
      type: "tool-qkrpc_guide_get",
      toolCallId: "t1",
      state: "output-available",
      input: {},
      output: { ok: true },
    },
    {
      type: "tool-shell_exec",
      toolCallId: "s1",
      state: "output-available",
      input: { command: "echo hi" },
      output: { ok: true },
    },
  ] as Parameters<typeof segmentMessageParts>[0];

  const segments = segmentMessageParts(parts);
  assert.equal(segments.length, 2);
  assert.equal(segments[0]?.kind, "activity-batch");
  assert.equal(segments[1]?.kind, "tool");
});
