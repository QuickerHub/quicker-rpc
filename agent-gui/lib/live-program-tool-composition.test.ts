import assert from "node:assert/strict";
import { test } from "node:test";
import { tool, type ToolExecutionOptions } from "ai";
import { z } from "zod";
import { composeLiveProgramTools } from "./live-program-tool-composition";
import type { LiveProgramDocumentSelection } from "./live-program-document";
import { restrictComposedTools } from "./chat-tool-selection";
import { applyToolModeGuards } from "./agent-tool-mode-guard";
import { selectSubagentTools } from "./task-tool-capabilities";

const client = tool({ inputSchema: z.object({ action: z.enum(["read_live", "edit_live", "edit_step_inputs_live", "edit_variable_live"]) }) });
const server = tool({ inputSchema: z.object({}), execute: async () => "server" });
const unavailable: LiveProgramDocumentSelection = { state: "unavailable", code: "OWNER_CLOSED", error: "Owner closed", retryable: false };
const ready = (mode: "read" | "edit"): LiveProgramDocumentSelection => ({ state: "ready", scope: {
  version: 1, scopeId: "scope", threadId: "thread", userMessageId: "manual-user", cwd: "D:/fixture", mode,
  target: { owner: { key: "owner", instanceId: 1, cwd: "D:/fixture", tabId: "data", path: ".quicker/actions/fixture/data.json" },
    sessionId: "session", identity: { documentKey: "data", projectBinding: null } },
} });

test("ready and unavailable live intent both exclude disk/native aliases, Shell and MCP capabilities", () => {
  const selected = Object.fromEntries(["workspace_program", "docs", "Read", "task", "Write", "StrReplace", "Shell",
    "qkrpc_action_get", "qkrpc_subprogram_get", "qkrpc_action_open", "qkrpc_action_save", "qkrpc_action_set_metadata",
    "workspace_program_patch", "workspace_action_write_data", "qkrpc_action", "mcp__fixture__write", "future_tool"].map((id) => [id, server]));
  for (const selection of [ready("edit"), unavailable]) {
    const result = composeLiveProgramTools(selected, selection, client);
    assert.deepEqual(Object.keys(result.tools).sort(), ["Read", "docs", "task", "workspace_program"]);
    assert.equal(result.tools.workspace_program, client);
    assert.equal(result.tools.workspace_program.execute, undefined);
    assert.deepEqual(result.clientReadonlyTools, ["workspace_program"]);
    assert.deepEqual(result.operationConstraints.workspace_program?.allowedActions, selection.state === "ready" ? ["read_live", "edit_live", "edit_step_inputs_live", "edit_variable_live"] : ["read_live"]);
  }
  assert.equal(selected.workspace_program, server, "composition cannot mutate the legacy registry");
});

test("composition never enables a disabled live tool or widens an explicit command intersection", () => {
  for (const selection of [ready("edit"), unavailable]) {
    const omitted = composeLiveProgramTools({ docs: server, qkrpc_action_save: server }, selection, client);
    assert.deepEqual(Object.keys(omitted.tools), ["docs"]);
    assert.deepEqual(omitted.clientReadonlyTools, []); assert.deepEqual(omitted.operationConstraints, {});
    const composed = composeLiveProgramTools({ docs: server, workspace_program: server }, selection, client);
    assert.deepEqual(restrictComposedTools(composed.tools, []), {});
    assert.deepEqual(restrictComposedTools(composed.tools, ["qkrpc_action_save", "unknown_alias"]), {});
    assert.equal(restrictComposedTools(composed.tools, ["workspace_program"]).workspace_program, client);
  }
});

test("legacy none preserves original executors; read scopes stay client-only in Ask and nested task composition", async () => {
  const selected = { workspace_program: server, docs: server, Shell: server };
  assert.equal(composeLiveProgramTools(selected, { state: "none" }, client).tools, selected);
  const result = composeLiveProgramTools(selected, ready("read"), client);
  assert.deepEqual(result.operationConstraints.workspace_program?.allowedActions, ["read_live"]);
  let diskCalls = 0;
  const guarded = applyToolModeGuards(result.tools, "ask", { workspace_program: async () => { diskCalls++; return "disk"; } }, result);
  assert.equal(guarded.workspace_program, client); assert.equal(guarded.workspace_program.execute, undefined);
  const nested = selectSubagentTools(guarded, undefined);
  assert.deepEqual(Object.keys(nested), ["docs"]);
  assert.equal(await nested.docs.execute!({}, { toolCallId: "nested", messages: [] } as ToolExecutionOptions), "server");
  assert.equal(diskCalls, 0);
  assert.throws(() => composeLiveProgramTools(selected, ready("edit"), server), /renderer execution port/);
});
