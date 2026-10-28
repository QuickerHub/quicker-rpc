import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { mock, test } from "node:test";
import { convertToModelMessages, generateText, type ToolExecutionOptions, type UIMessage } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { applyToolModeGuards } from "./agent-tool-mode-guard";
import { runWithAgentRequestContextAsync } from "./qkrpc-request-context";
import { bindQkrpcTarget, type QkrpcHostBinding } from "./qkrpc-host-binding";
import { selectSubagentTools } from "./task-tool-capabilities";
import { isStructuredToolResult } from "./tool-result";
import { executeWorkspaceProgramReadOnly, executeWorkspaceProgramTool, WORKSPACE_PROGRAM_TOOL_DEF, type WorkspaceProgramToolInput } from "./workspace-program-tool.server";
import { workspaceProgramProjectDir, type WorkspaceProgramTarget } from "./workspace-program-target";
import { programToolOperationFacts } from "./program-tool-operation-facts";

const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const targets: WorkspaceProgramTarget[] = [
  { kind: "action", actionId: id },
  { kind: "global_subprogram", subProgramKey: "FixtureGlobal" },
  { kind: "embedded_subprogram", actionId: id, subProgramId: "fixture-embedded" },
];
const options = { toolCallId: "readonly-workspace", messages: [] } as ToolExecutionOptions;

async function snapshot(root: string, prefix = ""): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await fs.readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert.equal(entry.isSymbolicLink(), false);
    if (entry.isDirectory()) Object.assign(result, await snapshot(root, path));
    else result[path] = await fs.readFile(join(root, path), "utf8");
  }
  return result;
}

async function fixture(run: (root: string) => Promise<void>) {
  const parent = fileURLToPath(new URL("../../.tmp/ask-workspace-read/", import.meta.url));
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(join(parent, "fixture-"));
  try { await run(root); }
  finally {
    const child = relative(parent, root);
    assert.ok(child.startsWith("fixture-") && !child.includes(".."));
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function assertNoEffects(root: string, run: () => Promise<void>) {
  const before = await snapshot(root);
  const oldFetch = globalThis.fetch;
  let requests = 0, children = 0;
  const mutations: string[] = [];
  globalThis.fetch = async () => { requests++; throw Error("No host HTTP belongs to this fixture"); };
  const spawn = mock.method(childProcess, "spawn", () => { children++; throw Error("No child belongs to this fixture"); });
  const spies = (["mkdir", "writeFile", "appendFile", "rename", "copyFile", "link", "symlink", "unlink", "rm", "open"] as const).map((operation) =>
    mock.method(fs, operation, (() => { mutations.push(operation); throw Error(`Ask workspace mutation: ${operation}`); }) as never));
  syncBuiltinESMExports();
  try {
    await run();
    assert.equal(requests, 0); assert.equal(children, 0); assert.deepEqual(mutations, []);
    assert.deepEqual(await snapshot(root), before);
  } finally {
    for (const spy of spies) spy.mock.restore();
    spawn.mock.restore(); syncBuiltinESMExports(); globalThis.fetch = oldFetch;
  }
}

function inputFor(target: WorkspaceProgramTarget): Pick<WorkspaceProgramToolInput, "target" | "id" | "subProgramId"> {
  return target.kind === "global_subprogram" ? { target: target.kind, id: target.subProgramKey }
    : { target: target.kind, id: target.actionId, subProgramId: target.kind === "embedded_subprogram" ? target.subProgramId : undefined };
}

for (const state of ["missing", "info-only", "complete"] as const) {
  test(`actual Ask workspace port reads only existing local files (${state})`, async () => fixture(async (root) => {
    for (const target of targets) {
      const directory = join(root, workspaceProgramProjectDir(target));
      if (state !== "missing") {
        await fs.mkdir(directory, { recursive: true });
        const info = target.kind === "action" ? { id, title: "Local action" }
          : target.kind === "global_subprogram" ? { Id: "FixtureGlobal", CallIdentifier: "@@FixtureGlobal" }
            : { kind: "embedded-subprogram", id: "fixture-embedded", name: "Local embedded" };
        await fs.writeFile(join(directory, "info.json"), JSON.stringify(info));
      }
      if (state === "complete") {
        await fs.mkdir(join(directory, "files"), { recursive: true });
        await fs.writeFile(join(directory, "data.json"), '{"steps":[{"key":"sys:showText","inputs":{"text":"local body"}}],"variables":[]}');
        await fs.writeFile(join(directory, "files/local.txt"), "local resource\n");
      }
    }
    await assertNoEffects(root, () => runWithAgentRequestContextAsync({ cwd: root, chatMode: "agent" }, async () => {
      const tools = applyToolModeGuards({ workspace_program: WORKSPACE_PROGRAM_TOOL_DEF }, "ask", {
        workspace_program: (input) => executeWorkspaceProgramReadOnly(input as WorkspaceProgramToolInput),
      });
      const child = selectSubagentTools(tools, ["workspace_program"]);
      assert.equal(child.workspace_program, tools.workspace_program);
      for (const target of targets) {
        for (const action of ["read_data", "file_read", "file_info", "file_search"] as const) {
          const input = { ...inputFor(target), action, path: "files/local.txt", query: "local", readOnly: false };
          const result = await child.workspace_program.execute!(input, options);
          assert.ok(isStructuredToolResult(result));
          assert.equal(result.ok, state === "complete", `${target.kind}/${action}`);
          if (state !== "complete") assert.equal((result.data as { errorCode: string }).errorCode, "workspace_program_not_local");
        }
        const summary = await child.workspace_program.execute!({ ...inputFor(target), action: "read_data", mode: "summary" }, options);
        assert.ok(isStructuredToolResult(summary)); assert.equal(summary.ok, state === "complete");
      }
      const projects = await tools.workspace_program.execute!({ action: "projects_list" }, options);
      assert.ok(isStructuredToolResult(projects)); assert.equal(projects.ok, true);
      const programs = (projects.data as { globalSubprograms?: { projects: unknown[] } }).globalSubprograms?.projects ?? [];
      assert.equal(programs.length, state === "missing" ? 0 : 1);
    }));
    await assertNoEffects(root, () => runWithAgentRequestContextAsync({ cwd: root, chatMode: "ask" }, async () => {
      assert.equal((await executeWorkspaceProgramTool({ ...inputFor(targets[0]), action: "read_data" })).ok, state === "complete");
      assert.equal((await executeWorkspaceProgramTool({ action: "projects_list" })).ok, true);
      assert.equal((await executeWorkspaceProgramTool({ ...inputFor(targets[0]), action: "write_data", content: "{}" })).ok, false);
    }));
  }));
}

test("a restored SDK workspace approval cannot create a missing local project", async () => fixture(async (root) => {
  await assertNoEffects(root, () => runWithAgentRequestContextAsync({ cwd: root, chatMode: "agent" }, async () => {
    const tools = applyToolModeGuards({ workspace_program: WORKSPACE_PROGRAM_TOOL_DEF }, "ask", {
      workspace_program: (input) => executeWorkspaceProgramReadOnly(input as WorkspaceProgramToolInput),
    });
    const messages = await convertToModelMessages([{ id: "saved", role: "assistant", parts: [{
      type: "tool-workspace_program", toolCallId: "saved-read", state: "approval-responded",
      input: { action: "read_data", target: "action", id }, approval: { id: "approved", approved: true },
    }] }] as UIMessage[], { tools });
    let prompt = "";
    await generateText({ tools, messages, model: new MockLanguageModelV3({ doGenerate: async (input) => {
      prompt = JSON.stringify(input.prompt);
      return { content: [{ type: "text", text: "offline" }], finishReason: { unified: "stop", raw: "stop" },
        usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }, warnings: [] };
    } }) });
    assert.match(prompt, /workspace_program_not_local/);
  }));
}));

test("Agent retains lazy empty-body creation and subprogram metadata repair", async () => fixture(async (root) => {
  const actionDir = join(root, workspaceProgramProjectDir(targets[0]));
  const subDir = join(root, workspaceProgramProjectDir(targets[1]));
  await fs.mkdir(actionDir, { recursive: true }); await fs.mkdir(subDir, { recursive: true });
  await fs.writeFile(join(actionDir, "info.json"), JSON.stringify({ id, title: "Local action" }));
  await fs.writeFile(join(subDir, "info.json"), '{"Id":"FixtureGlobal","CallIdentifier":"@@FixtureGlobal"}');
  const oldFetch = globalThis.fetch;
  const spawn = mock.method(childProcess, "spawn", () => { throw Error("Agent compatibility fixture must use its fake HTTP host"); });
  syncBuiltinESMExports();
  let requests = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/health")) return Response.json({ service: "qkrpc", ok: true });
    const request = JSON.parse(String(init?.body)) as { op: string };
    assert.equal(request.op, "subprogram.get"); requests++;
    return Response.json({ ok: true, data: { ok: true, payload: { subProgramId: "FixtureGlobal", name: "Repaired name", compressed: { title: "Repaired name" } } } });
  };
  const keys = ["QKRPC_HTTP_URL", "QKRPC_TRANSPORT"];
  const previous = keys.map((key) => process.env[key]);
  const base = "http://workspace-read-fixture.invalid:19477";
  process.env.QKRPC_HTTP_URL = base;
  process.env.QKRPC_TRANSPORT = "http";
  try {
    await runWithAgentRequestContextAsync({ cwd: root, chatMode: "agent" }, async () => {
      const binding: QkrpcHostBinding = { hostInstanceId: "workspace-fixture", hostSessionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", protocolVersion: 1, schemaVersion: 1, hostKind: "v1", capabilities: {} };
      bindQkrpcTarget({ gateway: base, binding });
      assert.equal((await executeWorkspaceProgramTool({ action: "read_data", target: "action", id })).ok, true);
      assert.ok(await fs.readFile(join(actionDir, "data.json"), "utf8"));
      assert.equal(programToolOperationFacts("workspace_program", { action: "read_data" }, "workspace").implicitRepair, "possible");
      assert.equal((await executeWorkspaceProgramTool({ action: "projects_list", target: "global_subprogram" })).ok, true);
      assert.match(await fs.readFile(join(subDir, "info.json"), "utf8"), /Repaired name/);
      assert.equal(programToolOperationFacts("workspace_program", { action: "projects_list", target: "global_subprogram" }, "workspace").localPersistence, "possible");
      assert.equal(requests, 1);
    });
  } finally {
    globalThis.fetch = oldFetch;
    spawn.mock.restore(); syncBuiltinESMExports();
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
  }
}));
