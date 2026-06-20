import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  effectiveGeneralWorkspaceFileToolId,
  isWorkspaceGeneralFileTool,
} from "@/lib/workspace-general-file-tool";
import {
  READ_TOOL,
  STR_REPLACE_TOOL,
  WRITE_TOOL,
} from "@/lib/host-tool-constants";
import { WORKSPACE_FILE_TOOL } from "@/lib/workspace-general-file-tool";
import {
  READ_TOOL_DEF,
  STR_REPLACE_TOOL_DEF,
  WRITE_TOOL_DEF,
} from "@/lib/workspace-general-file-tool.server";
import { effectiveWorkspaceToolId, isWorkspaceFileTool } from "@/lib/workspace-program-tool";
import {
  hasWorkspaceFileEditorPreviewInChat,
  isWorkspaceFileReadTool,
  workspaceFileToolDisplayName,
} from "@/lib/workspace-file-tool";

test("Read/Write/StrReplace host tool helpers", () => {
  assert.equal(isWorkspaceGeneralFileTool(READ_TOOL, { path: "a.txt" }), true);
  assert.equal(isWorkspaceGeneralFileTool(WRITE_TOOL, { path: "a.txt", content: "x" }), true);
  assert.equal(
    isWorkspaceGeneralFileTool(STR_REPLACE_TOOL, {
      path: "a.txt",
      oldString: "x",
      newString: "y",
    }),
    true,
  );
  assert.equal(
    isWorkspaceGeneralFileTool(WORKSPACE_FILE_TOOL, { action: "write" }),
    true,
  );
  assert.equal(
    effectiveGeneralWorkspaceFileToolId(READ_TOOL, { path: "a.txt" }),
    "workspace_action_file_read",
  );
  assert.equal(
    effectiveWorkspaceToolId(WRITE_TOOL, { path: "a.txt", content: "x" }),
    "workspace_action_file_write",
  );
  assert.equal(
    effectiveWorkspaceToolId(STR_REPLACE_TOOL, {
      path: "a.txt",
      oldString: "x",
      newString: "y",
    }),
    "workspace_action_file_edit",
  );
  assert.equal(isWorkspaceFileTool(WRITE_TOOL, { path: "a.txt", content: "x" }), true);
  assert.equal(
    workspaceFileToolDisplayName(WRITE_TOOL, { path: "a.txt", content: "x" }),
    "写入工作区文件",
  );
  assert.equal(
    workspaceFileToolDisplayName(STR_REPLACE_TOOL, {
      path: "a.txt",
      oldString: "x",
      newString: "y",
    }),
    "编辑工作区文件",
  );
  assert.equal(
    isWorkspaceFileReadTool(READ_TOOL, { path: "a.txt" }),
    true,
  );
  assert.equal(
    hasWorkspaceFileEditorPreviewInChat(WRITE_TOOL, { path: "a.txt", content: "x" }),
    true,
  );
  assert.equal(
    hasWorkspaceFileEditorPreviewInChat(STR_REPLACE_TOOL, {
      path: "a.txt",
      oldString: "a",
      newString: "b",
    }),
    true,
  );
});

test("Write and Read under .local", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-ws-file-tool-"));
  const prevCwd = process.env.AGENT_GUI_DEFAULT_CWD;
  process.env.AGENT_GUI_DEFAULT_CWD = root;
  try {
    const writeResult = await WRITE_TOOL_DEF.execute!(
      {
        path: ".local/hello.txt",
        content: "hello agent",
      },
      { toolCallId: "test" },
    );
    assert.equal((writeResult as { ok?: boolean }).ok, true);

    const readResult = await READ_TOOL_DEF.execute!(
      { path: ".local/hello.txt" },
      { toolCallId: "test" },
    );
    const data = (readResult as { data?: { content?: string } }).data;
    assert.equal(data?.content, "hello agent");
  } finally {
    if (prevCwd === undefined) delete process.env.AGENT_GUI_DEFAULT_CWD;
    else process.env.AGENT_GUI_DEFAULT_CWD = prevCwd;
    await rm(root, { recursive: true, force: true });
  }
});

test("StrReplace edits file under .local", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-ws-str-replace-"));
  const prevCwd = process.env.AGENT_GUI_DEFAULT_CWD;
  process.env.AGENT_GUI_DEFAULT_CWD = root;
  try {
    await WRITE_TOOL_DEF.execute!(
      { path: ".local/patch.txt", content: "hello world" },
      { toolCallId: "test" },
    );
    const editResult = await STR_REPLACE_TOOL_DEF.execute!(
      {
        path: ".local/patch.txt",
        oldString: "world",
        newString: "agent",
      },
      { toolCallId: "test" },
    );
    assert.equal((editResult as { ok?: boolean }).ok, true);

    const readResult = await READ_TOOL_DEF.execute!(
      { path: ".local/patch.txt" },
      { toolCallId: "test" },
    );
    const data = (readResult as { data?: { content?: string } }).data;
    assert.equal(data?.content, "hello agent");
  } finally {
    if (prevCwd === undefined) delete process.env.AGENT_GUI_DEFAULT_CWD;
    else process.env.AGENT_GUI_DEFAULT_CWD = prevCwd;
    await rm(root, { recursive: true, force: true });
  }
});

test("Read blocks info.json under .quicker/actions", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-ws-file-guard-info-"));
  const prevCwd = process.env.AGENT_GUI_DEFAULT_CWD;
  process.env.AGENT_GUI_DEFAULT_CWD = root;
  try {
    const actionDir = join(root, ".quicker", "actions", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    await mkdir(actionDir, { recursive: true });
    await writeFile(join(actionDir, "info.json"), "{}", "utf8");

    const result = await READ_TOOL_DEF.execute!(
      {
        path: ".quicker/actions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/info.json",
      },
      { toolCallId: "test" },
    );
    assert.equal((result as { ok?: boolean }).ok, false);
  } finally {
    if (prevCwd === undefined) delete process.env.AGENT_GUI_DEFAULT_CWD;
    else process.env.AGENT_GUI_DEFAULT_CWD = prevCwd;
    await rm(root, { recursive: true, force: true });
  }
});

test("Write blocks program body paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-ws-file-guard-"));
  const prevCwd = process.env.AGENT_GUI_DEFAULT_CWD;
  process.env.AGENT_GUI_DEFAULT_CWD = root;
  try {
    const actionDir = join(root, ".quicker", "actions", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    await mkdir(join(actionDir, "files"), { recursive: true });
    await writeFile(join(actionDir, "data.json"), "{}", "utf8");

    const result = await WRITE_TOOL_DEF.execute!(
      {
        path: ".quicker/actions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/data.json",
        content: "{}",
      },
      { toolCallId: "test" },
    );
    assert.equal((result as { ok?: boolean }).ok, false);
  } finally {
    if (prevCwd === undefined) delete process.env.AGENT_GUI_DEFAULT_CWD;
    else process.env.AGENT_GUI_DEFAULT_CWD = prevCwd;
    await rm(root, { recursive: true, force: true });
  }
});
