import assert from "node:assert/strict";
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
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
import { runWithQkrpcCwdAsync } from "@/lib/qkrpc-request-context";
import { runWithAgentRequestContextAsync } from "@/lib/qkrpc-request-context";
import { rememberActionSourceDirectory } from "@/lib/action-source-read-guard.server";
import {
  getCreatedActionIdThisTurn,
  markActionCreatedThisTurn,
  markProgramPatchedThisTurn,
  wasActionCreatedThisTurn,
  wasProgramPatchedThisTurn,
} from "@/lib/program-turn-context";
import { isStructuredToolResult } from "@/lib/tool-result";

test("source YAML/resources use existing file tools while identity and baseline cannot be overwritten", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-source-file-tool-"));
  const dir = ".tmp/quicker/source";
  await mkdir(join(root, dir, ".qkrpc"), { recursive: true });
  await writeFile(join(root, dir, "quicker.source.json"), "fixture identity");
  await writeFile(join(root, dir, ".qkrpc/baseline.json"), "fixture baseline");
  const options = { toolCallId: "source-files", messages: [] };
  try {
    await runWithQkrpcCwdAsync(root, async () => {
      for (const path of [`${dir}/program.source.yaml`, `${dir}/files/source-1.txt`]) {
        const written = await WRITE_TOOL_DEF.execute!({ path, content: "original" }, options);
        assert.ok(isStructuredToolResult(written));
        assert.equal(written.ok, true);
        const edited = await STR_REPLACE_TOOL_DEF.execute!({ path, oldString: "original", newString: "edited" }, options);
        assert.ok(isStructuredToolResult(edited));
        assert.equal(edited.ok, true);
        const read = await READ_TOOL_DEF.execute!({ path }, options);
        assert.ok(isStructuredToolResult(read));
        assert.equal(read.ok, true);
        assert.equal(await readFile(join(root, path), "utf8"), "edited");
      }
      for (const path of [
        `${dir}/quicker.source.json`, `${dir}/.qkrpc/baseline.json`, `${dir}/.qkrpc/./baseline.json`,
        `${dir}/files/../quicker.source.json`, join(root, dir, ".qkrpc/baseline.json"),
      ]) {
        for (const result of [
          await WRITE_TOOL_DEF.execute!({ path, content: "overwrite" }, options),
          await STR_REPLACE_TOOL_DEF.execute!({ path, oldString: "fixture", newString: "overwrite" }, options),
        ]) {
          assert.ok(isStructuredToolResult(result));
          assert.equal(result.ok, false);
          assert.match(result.stderr!, /tool-managed/);
        }
      }
    });
    assert.equal(await readFile(join(root, dir, "quicker.source.json"), "utf8"), "fixture identity");
    assert.equal(await readFile(join(root, dir, ".qkrpc/baseline.json"), "utf8"), "fixture baseline");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Write/StrReplace reject sidecar aliases, hardlinks, ADS and redirected workspace escapes", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "agent-source-write-guard-"));
  const root = join(sandbox, "workspace");
  const bundle = join(root, "source");
  const baseline = join(bundle, ".qkrpc", "baseline.json");
  const identity = join(bundle, "quicker.source.json");
  await mkdir(join(bundle, ".qkrpc"), { recursive: true });
  await mkdir(join(root, ".quicker", "actions", "fixture"), { recursive: true });
  await mkdir(join(sandbox, "outside"));
  await writeFile(baseline, "baseline fixture");
  await writeFile(identity, "identity fixture");
  await writeFile(join(root, ".quicker", "actions", "fixture", "data.json"), "legacy fixture");
  await link(identity, join(root, "identity-alias.json"));
  const linkType = process.platform === "win32" ? "junction" : "dir";
  await symlink(join(bundle, ".qkrpc"), join(root, "checkpoint-alias"), linkType);
  await symlink(join(root, ".quicker", "actions"), join(root, "legacy-alias"), linkType);
  await symlink(join(sandbox, "outside"), join(root, "outside-alias"), linkType);
  const rootAlias = join(sandbox, "workspace-alias");
  await symlink(root, rootAlias, linkType);
  const options = { toolCallId: "source-aliases", messages: [] };
  try {
    await runWithQkrpcCwdAsync(rootAlias, async () => {
      for (const path of [
        "checkpoint-alias/baseline.json", "identity-alias.json",
        "source/.qkrpc/baseline.json::$DATA", "source/quicker.source.json::$DATA",
        "outside-alias/new.txt", "legacy-alias/fixture/data.json",
      ]) {
        for (const output of [
          await WRITE_TOOL_DEF.execute!({ path, content: "changed" }, options),
          await STR_REPLACE_TOOL_DEF.execute!({ path, oldString: "fixture", newString: "changed" }, options),
        ]) {
          assert.ok(isStructuredToolResult(output));
          assert.equal(output.ok, false, path);
        }
      }
      const normal = await WRITE_TOOL_DEF.execute!({ path: "normal.txt", content: "ordinary fixture" }, options);
      assert.ok(isStructuredToolResult(normal));
      assert.equal(normal.ok, true);
      const edited = await STR_REPLACE_TOOL_DEF.execute!({ path: "normal.txt", oldString: "fixture", newString: "edited" }, options);
      assert.ok(isStructuredToolResult(edited));
      assert.equal(edited.ok, true);
    });
    assert.equal(await readFile(baseline, "utf8"), "baseline fixture");
    assert.equal(await readFile(identity, "utf8"), "identity fixture");
    assert.equal(await readFile(join(root, "normal.txt"), "utf8"), "ordinary edited");
  } finally {
    assert.equal(dirname(sandbox), resolve(tmpdir()));
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("mixed authoring reads only a confirmed source bundle without clearing legacy turn facts", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-mixed-source-read-"));
  const dir = ".tmp/quicker/source";
  await mkdir(join(root, dir, "files"), { recursive: true });
  await writeFile(join(root, dir, "program.source.yaml"), "steps: []\n");
  await writeFile(join(root, dir, "files/script.cs"), "fixture resource");
  await writeFile(join(root, "README.md"), "unrelated host content");
  const options = { toolCallId: "mixed-source-read", messages: [] };
  const context = { cwd: root, lastUserText: "帮我修改动作步骤，然后保存" };
  try {
    await runWithAgentRequestContextAsync(context, async () => {
      markActionCreatedThisTurn("fixture-created-action");
      markProgramPatchedThisTurn();
      const initial = await READ_TOOL_DEF.execute!({ path: `${dir}/program.source.yaml` }, options);
      assert.ok(isStructuredToolResult(initial));
      assert.equal(initial.ok, false);
      rememberActionSourceDirectory(join(root, dir));
      for (const path of [`${dir}/program.source.yaml`, `${dir}/files/script.cs`]) {
        const output = await READ_TOOL_DEF.execute!({ path }, options);
        assert.ok(isStructuredToolResult(output));
        assert.equal(output.ok, true);
      }
      const unrelated = await READ_TOOL_DEF.execute!({ path: "README.md" }, options);
      assert.ok(isStructuredToolResult(unrelated));
      assert.equal(unrelated.ok, false);
      assert.match(unrelated.stderr!, /confirmed source bundle/);
      assert.equal(getCreatedActionIdThisTurn(), "fixture-created-action");
      assert.equal(wasActionCreatedThisTurn(), true);
      assert.equal(wasProgramPatchedThisTurn(), true);
    });
    await runWithAgentRequestContextAsync(context, async () => {
      markActionCreatedThisTurn("another-turn-action");
      const output = await READ_TOOL_DEF.execute!({ path: `${dir}/program.source.yaml` }, options);
      assert.ok(isStructuredToolResult(output));
      assert.equal(output.ok, false);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

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
