import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  effectiveGeneralWorkspaceFileToolId,
  isWorkspaceGeneralFileTool,
} from "@/lib/workspace-general-file-tool";
import { WORKSPACE_FILE_TOOL } from "@/lib/workspace-general-file-tool.server";
import { effectiveWorkspaceToolId, isWorkspaceFileTool } from "@/lib/workspace-program-tool";
import {
  hasWorkspaceFileEditorPreviewInChat,
  isWorkspaceFileReadTool,
  workspaceFileToolDisplayName,
} from "@/lib/workspace-file-tool";

test("workspace_file action helpers", () => {
  assert.equal(
    isWorkspaceGeneralFileTool(WORKSPACE_FILE_TOOL, { action: "write" }),
    true,
  );
  assert.equal(
    effectiveGeneralWorkspaceFileToolId(WORKSPACE_FILE_TOOL, { action: "read" }),
    "workspace_action_file_read",
  );
  assert.equal(
    effectiveWorkspaceToolId(WORKSPACE_FILE_TOOL, { action: "edit" }),
    "workspace_action_file_edit",
  );
  assert.equal(isWorkspaceFileTool(WORKSPACE_FILE_TOOL, { action: "write" }), true);
  assert.equal(
    workspaceFileToolDisplayName(WORKSPACE_FILE_TOOL, { action: "write" }),
    "写入工作区文件",
  );
  assert.equal(
    isWorkspaceFileReadTool(WORKSPACE_FILE_TOOL, { action: "read" }),
    true,
  );
  assert.equal(
    hasWorkspaceFileEditorPreviewInChat(WORKSPACE_FILE_TOOL, { action: "write" }),
    true,
  );
});

test("workspace_file write and read under .local", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-ws-file-tool-"));
  const prevCwd = process.env.AGENT_GUI_DEFAULT_CWD;
  process.env.AGENT_GUI_DEFAULT_CWD = root;
  try {
    const { WORKSPACE_FILE_TOOL_DEF } = await import(
      "@/lib/workspace-general-file-tool.server"
    );
    const writeResult = await WORKSPACE_FILE_TOOL_DEF.execute!(
      {
        action: "write",
        path: ".local/hello.txt",
        content: "hello agent",
      },
      { toolCallId: "test" },
    );
    assert.equal((writeResult as { ok?: boolean }).ok, true);

    const readResult = await WORKSPACE_FILE_TOOL_DEF.execute!(
      { action: "read", path: ".local/hello.txt" },
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

test("workspace_file blocks program body paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-ws-file-guard-"));
  const prevCwd = process.env.AGENT_GUI_DEFAULT_CWD;
  process.env.AGENT_GUI_DEFAULT_CWD = root;
  try {
    const actionDir = join(root, ".quicker", "actions", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    await mkdir(join(actionDir, "files"), { recursive: true });
    await writeFile(join(actionDir, "data.json"), "{}", "utf8");

    const { WORKSPACE_FILE_TOOL_DEF } = await import(
      "@/lib/workspace-general-file-tool.server"
    );
    const result = await WORKSPACE_FILE_TOOL_DEF.execute!(
      {
        action: "write",
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
