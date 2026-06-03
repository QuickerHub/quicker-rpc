import assert from "node:assert/strict";
import { test } from "node:test";
import {
  basenamePath,
  countLines,
  formatActionDataJsonPath,
  formatCharCount,
  formatWorkspacePathLabel,
  buildWriteDiffFromSnapshot,
  buildWritePreviewDiff,
  getWorkspaceFileEditorPreview,
  guessFileLanguage,
  parseWorkspaceFilePayload,
  parseWorkspaceFileReadPayload,
  hasWorkspaceFileEditorPreviewInChat,
  hasWorkspaceFileChipInChat,
  isWorkspaceFileReadTool,
  shouldFoldFileSnapshotInChat,
  shouldShowFileEditorCodeBlockInChat,
  shouldShowFileSnapshotHeaderDetail,
  splitFileSnapshotHeaderMeta,
  summarizeWorkspaceFileTool,
} from "./workspace-file-tool";
import { formatLocalToolResult } from "./tool-result";
import {
  buildEditStat,
  buildWriteStat,
} from "../components/chat/FileEditorCard";

test("parseWorkspaceFileReadPayload accepts action-data-read", () => {
  const payload = parseWorkspaceFileReadPayload({
    action: "action-data-read",
    success: true,
    actionId: "b0325000-62e5-406f-858b-bf9398da9bb1",
    path: ".quicker/actions/b0325000-62e5-406f-858b-bf9398da9bb1/data.json",
    content: '{"steps":[]}',
    truncated: false,
    totalChars: 12,
  });
  assert.equal(payload?.action, "file-read");
  assert.ok(payload?.path.includes("data.json"));
});

test("buildEditStat uses line-diff insert/delete counts", () => {
  assert.deepEqual(buildEditStat("old", "new"), {
    label: "+1 -1",
    kind: "neutral",
    addLines: 1,
    removeLines: 1,
  });
  assert.deepEqual(buildEditStat("line1\nline2", ""), {
    label: "-2",
    kind: "remove",
    addLines: 0,
    removeLines: 2,
  });
  assert.deepEqual(buildEditStat("", "only"), {
    label: "+1",
    kind: "add",
    addLines: 1,
    removeLines: 0,
  });
  assert.deepEqual(buildEditStat("a\nb\nc", "a\nB\nc"), {
    label: "+1 -1",
    kind: "neutral",
    addLines: 1,
    removeLines: 1,
  });
});

test("buildWriteStat is add-only lines", () => {
  assert.deepEqual(buildWriteStat("a\nb\nc"), {
    label: "3",
    kind: "add",
    addLines: 3,
    removeLines: 0,
  });
});

test("parses file-read payload", () => {
  const payload = parseWorkspaceFilePayload("workspace_file_read", {
    action: "file-read",
    path: ".quicker/actions/foo/info.json",
    content: '{\n  "Id": "abc"\n}',
    truncated: false,
    totalChars: 20,
  });
  assert.equal(payload?.action, "file-read");
  if (payload?.action !== "file-read") return;
  assert.ok(payload.path.includes("info.json"));
  assert.equal(countLines(payload.content), 3);
});

test("summarizes action-data-summary read mode", () => {
  const output = formatLocalToolResult({
    action: "action-data-summary",
    success: true,
    actionId: "b0325000-62e5-406f-858b-bf9398da9bb1",
    stepCount: 5,
    variableCount: 2,
    validated: true,
  });
  const summary = summarizeWorkspaceFileTool(
    "workspace_action_read_data",
    output,
    { id: "b0325000-62e5-406f-858b-bf9398da9bb1" },
  );
  assert.ok(summary?.includes("5 步"));
  assert.ok(summary?.includes("2 变量"));
  assert.ok(summary?.includes("已校验"));
});

test("summarizes read result", () => {
  const output = formatLocalToolResult({
    action: "file-read",
    success: true,
    path: ".quicker/actions/foo/info.json",
    content: "line1\nline2",
    totalChars: 11,
  });
  const summary = summarizeWorkspaceFileTool(
    "workspace_file_read",
    output,
    { path: ".quicker/actions/foo/info.json" },
  );
  assert.ok(summary?.includes("info.json"));
  assert.ok(summary?.includes("2 行"));
});

test("formatWorkspacePathLabel keeps parent path segments", () => {
  assert.equal(formatWorkspacePathLabel(".quicker/actions"), ".quicker/actions");
  assert.equal(formatWorkspacePathLabel("."), ".");
});

test("guesses language from extension", () => {
  assert.equal(guessFileLanguage("data.json"), "json");
  assert.equal(guessFileLanguage("script.cs"), "csharp");
  assert.equal(guessFileLanguage("files/clip.eval.cs"), "csharp");
  assert.equal(basenamePath("a/b/c.txt"), "c.txt");
  assert.ok(formatCharCount(1500).includes("k"));
});

test("shouldShowFileSnapshotHeaderDetail hides byte, char, and replacement counts", () => {
  assert.equal(shouldShowFileSnapshotHeaderDetail("写入 1789 字节"), false);
  assert.equal(shouldShowFileSnapshotHeaderDetail("2 行 · 11 字符"), false);
  assert.equal(shouldShowFileSnapshotHeaderDetail("3 处替换"), false);
  assert.equal(shouldShowFileSnapshotHeaderDetail("2 行"), true);
});

test("splitFileSnapshotHeaderMeta strips basename prefix", () => {
  assert.deepEqual(
    splitFileSnapshotHeaderMeta("data.json · 写入 1789 字节", "data.json"),
    { detail: "写入 1789 字节" },
  );
  assert.deepEqual(
    splitFileSnapshotHeaderMeta("info.json · 2 行 · 11 字符", "info.json"),
    { detail: "2 行 · 11 字符" },
  );
  assert.deepEqual(splitFileSnapshotHeaderMeta("完成", "data.json"), {
    detail: null,
  });
});

test("read tools use collapsible tool summary with expandable code body", () => {
  assert.equal(isWorkspaceFileReadTool("workspace_action_read_data"), true);
  assert.equal(hasWorkspaceFileEditorPreviewInChat("workspace_action_read_data"), false);
  assert.equal(hasWorkspaceFileChipInChat("workspace_action_read_data"), false);
  assert.equal(hasWorkspaceFileChipInChat("workspace_action_write_data"), true);
  assert.equal(shouldShowFileEditorCodeBlockInChat("workspace_action_read_data"), true);
});

test("shouldFoldFileSnapshotInChat only for read", () => {
  assert.equal(shouldFoldFileSnapshotInChat("workspace_action_read_data"), true);
  assert.equal(shouldFoldFileSnapshotInChat("workspace_action_write_data"), false);
});

test("formatActionDataJsonPath", () => {
  assert.equal(
    formatActionDataJsonPath("a2adb839-673d-44c5-a725-854700cedb50"),
    ".quicker/actions/a2adb839-673d-44c5-a725-854700cedb50/data.json",
  );
});

test("buildWritePreviewDiff is add-only", () => {
  assert.deepEqual(buildWritePreviewDiff("hello"), {
    removed: "",
    added: "hello",
  });
  assert.equal(buildWritePreviewDiff(""), undefined);
});

test("buildWriteDiffFromSnapshot shows removed and added blocks", () => {
  assert.deepEqual(buildWriteDiffFromSnapshot('{"a":1}', '{"b":2}'), {
    removed: '{"a":1}',
    added: '{"b":2}',
  });
  assert.deepEqual(buildWriteDiffFromSnapshot("", '{"steps":[]}'), {
    removed: "",
    added: '{"steps":[]}',
  });
});

test("getWorkspaceFileEditorPreview snapshots write-data from input", () => {
  const preview = getWorkspaceFileEditorPreview(
    "workspace_action_write_data",
    { id: "a2adb839-673d-44c5-a725-854700cedb50", content: '{"steps":[]}' },
    undefined,
  );
  assert.ok(preview);
  assert.equal(preview!.content, '{"steps":[]}');
  assert.deepEqual(preview!.diff, { removed: "", added: '{"steps":[]}' });
  assert.ok(preview!.path.includes("data.json"));
});

test("getWorkspaceFileEditorPreview write-data uses pre-write snapshot", () => {
  const preview = getWorkspaceFileEditorPreview(
    "workspace_action_write_data",
    { id: "a2adb839-673d-44c5-a725-854700cedb50", content: '{"steps":[1]}' },
    {
      action: "action-data-write",
      success: true,
      path: ".quicker/actions/a2adb839-673d-44c5-a725-854700cedb50/data.json",
      previousContent: '{"steps":[]}',
      bytesWritten: 14,
    },
  );
  assert.ok(preview);
  assert.deepEqual(preview!.diff, {
    removed: '{"steps":[]}',
    added: '{"steps":[1]}',
  });
});

test("parses action-data-write payload", () => {
  const payload = parseWorkspaceFilePayload("workspace_action_write_data", {
    action: "action-data-write",
    success: true,
    path: ".quicker/actions/abc/data.json",
    bytesWritten: 128,
  });
  assert.equal(payload?.action, "file-write");
  if (payload?.action !== "file-write") return;
  assert.ok(payload.path.endsWith("data.json"));
  assert.equal(payload.bytesWritten, 128);
});
