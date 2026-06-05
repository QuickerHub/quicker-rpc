import assert from "node:assert/strict";
import { test } from "node:test";
import {
  basenamePath,
  countLines,
  formatActionDataJsonPath,
  formatCharCount,
  formatFileDiffSummaryFromToolData,
  formatFileReadLineRangeLabel,
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
  isWorkspaceReadDataSummaryResult,
  shouldFoldFileSnapshotInChat,
  shouldShowFileEditorCodeBlockInChat,
  shouldShowFileSnapshotHeaderDetail,
  splitFileSnapshotHeaderMeta,
  summarizeWorkspaceFileTool,
  workspaceFileToolDisplayName,
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

test("parseWorkspaceFileReadPayload accepts program-data-read", () => {
  const payload = parseWorkspaceFileReadPayload({
    action: "program-data-read",
    success: true,
    path: ".quicker/actions/abc/data.json",
    content: '{"steps":[1]}',
  });
  assert.equal(payload?.content, '{"steps":[1]}');
});

test("getWorkspaceFileEditorPreview read_data summary shows outline", () => {
  const preview = getWorkspaceFileEditorPreview(
    "workspace_action_read_data",
    { id: "7176c17a-0000-0000-0000-000000000001", mode: "summary" },
    {
      action: "program-data-summary",
      success: true,
      stepCount: 3,
      variableCount: 2,
      validated: true,
      stepsOutline: [
        { index: 0, stepRunnerKey: "sys:MsgBox" },
        { index: 1, stepRunnerKey: "sys:clipboard" },
      ],
      variableKeys: ["clip"],
    },
  );
  assert.ok(preview);
  assert.match(preview!.content, /steps: 3/);
  assert.match(preview!.content, /sys:MsgBox/);
  assert.match(preview!.content, /variables: clip/);
});

test("getWorkspaceFileEditorPreview read_data content shows slice", () => {
  const preview = getWorkspaceFileEditorPreview(
    "workspace_action_read_data",
    { id: "7176c17a-0000-0000-0000-000000000001", mode: "content", startLine: 1, maxLines: 5 },
    {
      action: "program-data-read",
      success: true,
      path: ".quicker/actions/7176c17a-0000-0000-0000-000000000001/data.json",
      content: '{\n  "steps": []\n}',
    },
  );
  assert.ok(preview);
  assert.equal(preview!.content, '{\n  "steps": []\n}');
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
  const payload = parseWorkspaceFilePayload("workspace_action_file_read", {
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

test("summarizes program-data-summary read mode", () => {
  const output = formatLocalToolResult({
    action: "program-data-summary",
    success: true,
    stepCount: 4,
    variableCount: 1,
  });
  const summary = summarizeWorkspaceFileTool(
    "workspace_action_read_data",
    output,
    { id: "7176c17a-0000-0000-0000-000000000001", mode: "summary" },
  );
  assert.ok(summary?.includes("4 步"));
  assert.ok(summary?.includes("1 变量"));
});

test("summarizes read result with line range", () => {
  const output = formatLocalToolResult({
    action: "file-read",
    success: true,
    path: ".quicker/actions/foo/files/task.form.json",
    content: "line1\nline2\n...\nline15",
    startLine: 1,
    endLine: 15,
    totalLines: 200,
    truncated: true,
  });
  const summary = summarizeWorkspaceFileTool(
    "workspace_action_file_read",
    output,
    {
      path: ".quicker/actions/foo/files/task.form.json",
      startLine: 1,
      endLine: 15,
    },
  );
  assert.ok(summary?.includes("task.form.json"));
  assert.ok(summary?.includes("L1-15"));
  assert.ok(summary?.includes("截断"));
  assert.ok(summary?.includes("共 200 行"));
  assert.equal(summary?.includes("15 行"), false);
});

test("summarizes read result without startLine as L1-N from content", () => {
  const output = formatLocalToolResult({
    action: "file-read",
    success: true,
    path: ".quicker/actions/foo/info.json",
    content: "line1\nline2",
    totalChars: 11,
  });
  const summary = summarizeWorkspaceFileTool(
    "workspace_action_file_read",
    output,
    { path: ".quicker/actions/foo/info.json" },
  );
  assert.ok(summary?.includes("info.json"));
  assert.ok(summary?.includes("L1-2"));
});

test("formatFileReadLineRangeLabel single line", () => {
  assert.equal(formatFileReadLineRangeLabel(5, 5), "L5");
});

test("formatWorkspacePathLabel keeps parent path segments", () => {
  assert.equal(formatWorkspacePathLabel(".quicker/actions"), ".quicker/actions");
  assert.equal(formatWorkspacePathLabel("."), ".");
});

test("guesses language from extension", () => {
  assert.equal(guessFileLanguage("data.json"), "json");
  assert.equal(guessFileLanguage("script.cs"), "csharp");
  assert.equal(guessFileLanguage("files/clip.eval.cs"), "csharp");
  assert.equal(guessFileLanguage("files/main.js"), "javascript");
  assert.equal(guessFileLanguage("files/main.py"), "python");
  assert.equal(basenamePath("a/b/c.txt"), "c.txt");
  assert.ok(formatCharCount(1500).includes("k"));
});

test("formatFileDiffSummaryFromToolData uses written content not raw input", () => {
  const summary = formatFileDiffSummaryFromToolData(
    {
      previousContent: '{\n  "a": 1\n}\n',
      content: '{\n  "a": 2\n}\n',
    },
    { content: '{\n  "a": 99\n}\n' },
  );
  assert.equal(summary, "+1 -1");
});

test("shouldShowFileSnapshotHeaderDetail hides diff badge duplicate", () => {
  assert.equal(shouldShowFileSnapshotHeaderDetail("+42 -50"), false);
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
  assert.equal(
    isWorkspaceFileReadTool("workspace_program", { action: "file_read" }),
    true,
  );
  assert.equal(
    isWorkspaceFileReadTool("workspace_program", { action: "read_data" }),
    true,
  );
  assert.equal(hasWorkspaceFileEditorPreviewInChat("workspace_action_read_data"), false);
  assert.equal(
    hasWorkspaceFileEditorPreviewInChat("workspace_program", { action: "file_read" }),
    false,
  );
  assert.equal(
    hasWorkspaceFileEditorPreviewInChat("workspace_program", { action: "file_write" }),
    true,
  );
  assert.equal(shouldShowFileEditorCodeBlockInChat("workspace_action_read_data"), true);
  assert.equal(
    shouldShowFileEditorCodeBlockInChat("workspace_program", { action: "file_write" }),
    true,
  );
  assert.equal(hasWorkspaceFileChipInChat("workspace_action_read_data"), false);
  assert.equal(hasWorkspaceFileChipInChat("workspace_action_write_data"), true);
  assert.equal(
    hasWorkspaceFileChipInChat("workspace_program", { action: "file_write" }),
    true,
  );
});

test("workspace_program sub-actions resolve display names", () => {
  assert.equal(
    workspaceFileToolDisplayName("workspace_program", { action: "file_read" }),
    "read",
  );
  assert.equal(
    workspaceFileToolDisplayName("workspace_program", { action: "file_write" }),
    "write",
  );
  assert.equal(
    workspaceFileToolDisplayName("workspace_program", { action: "read_data" }),
    "read-data",
  );
});

test("isWorkspaceReadDataSummaryResult detects summary payloads", () => {
  assert.equal(
    isWorkspaceReadDataSummaryResult({ action: "program-data-summary" }),
    true,
  );
  assert.equal(
    isWorkspaceReadDataSummaryResult({ action: "file-read", path: "x" }),
    false,
  );
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

test("getWorkspaceFileEditorPreview file-write prefers normalized content from tool output", () => {
  const preview = getWorkspaceFileEditorPreview(
    "workspace_action_file_write",
    {
      id: "9f488bbb-348c-4966-8be0-1c362b8c7a93",
      path: "files/task.form.json",
      content: '{"fields":[]}',
    },
    {
      action: "file-write",
      success: true,
      path: "files/task.form.json",
      bytesWritten: 32,
      content: '{\n  "fields": []\n}\n',
      previousContent: "",
    },
  );
  assert.ok(preview);
  assert.equal(preview!.content, '{\n  "fields": []\n}\n');
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

test("getWorkspaceFileEditorPreview file-edit uses full-file snapshot when available", () => {
  const preview = getWorkspaceFileEditorPreview(
    "workspace_action_file_edit",
    {
      id: "9f488bbb-348c-4966-8be0-1c362b8c7a93",
      path: "files/task.form.json",
      oldString: '"default": "中"',
      newString: '"default": "高"',
    },
    {
      action: "file-edit",
      success: true,
      path: "files/task.form.json",
      replacements: 1,
      previousContent: '{\n  "default": "中"\n}\n',
      content: '{\n  "default": "高"\n}\n',
    },
  );
  assert.ok(preview);
  assert.equal(preview!.content, '{\n  "default": "高"\n}\n');
  assert.deepEqual(preview!.diff, {
    removed: '{\n  "default": "中"\n}\n',
    added: '{\n  "default": "高"\n}\n',
  });
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
