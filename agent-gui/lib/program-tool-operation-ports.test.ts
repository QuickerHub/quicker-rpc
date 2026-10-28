import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { mock, test } from "node:test";
import type { ToolExecutionOptions } from "ai";
import { runWithAgentRequestContextAsync } from "./qkrpc-request-context";
import { bindQkrpcTarget, type QkrpcHostBinding } from "./qkrpc-host-binding";
import { executeQkrpcActionIdTool } from "./qkrpc-action-tool.server";
import { executeQkrpcSubprogramIdTool } from "./qkrpc-subprogram-tool.server";
import { QKRPC_ACTION_OPEN_TOOL_DEF } from "./qkrpc-action-source-tool.server";
import { runQkrpcProgramToolPort } from "./qkrpc";
import { programToolOperationFacts } from "./program-tool-operation-facts";
import { applyToolModeGuards } from "./agent-tool-mode-guard";
import { executeWorkspaceProgramReadOnly, WORKSPACE_PROGRAM_TOOL_DEF, type WorkspaceProgramToolInput } from "./workspace-program-tool.server";

const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const binding: QkrpcHostBinding = { hostInstanceId: "program-facts-fixture", hostSessionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", protocolVersion: 1, schemaVersion: 1, hostKind: "v1", capabilities: {} };
const options = { toolCallId: "ports", messages: [] } as ToolExecutionOptions;

// Production wrappers, argv, CLI runner, filesystem and source owner are real.
// Only the child CLI/host boundary is simulated; this is not physical-host evidence.
async function fixture(run: (root: string, calls: string[][], failOpen: () => void, httpOps: string[]) => Promise<void>) {
  const parent = fileURLToPath(new URL("../../.tmp/program-operation-ports/", import.meta.url));
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(join(parent, "fixture-"));
  const keys = ["QKRPC_BIN", "QKRPC_TRANSPORT", "QKRPC_HTTP_URL", "AGENT_GUI_DEFAULT_CWD", "QKRPC_HOST_BINDING", "QKRPC_HOST_SESSION"];
  const before = keys.map(key => process.env[key]), oldFetch = globalThis.fetch;
  process.env.QKRPC_BIN = process.execPath; process.env.QKRPC_TRANSPORT = "cli"; process.env.AGENT_GUI_DEFAULT_CWD = root;
  delete process.env.QKRPC_HTTP_URL; delete process.env.QKRPC_HOST_BINDING; delete process.env.QKRPC_HOST_SESSION;
  const calls: string[][] = [], httpOps: string[] = []; let fail = false;
  globalThis.fetch = async (_url, init) => {
    const op = (JSON.parse(String(init?.body)) as { op: string }).op;
    httpOps.push(op); assert.equal(op, "project.lint.schedule", "Only background syntax lint belongs to this fixture");
    return Response.json({ ok: true, data: {} });
  };
  const spawn = mock.method(childProcess, "spawn", (_bin: unknown, raw: unknown) => {
    const args = raw as string[]; calls.push([...args]);
    assert.ok(["action", "subprogram"].includes(args[0]) && ["get", "extract", "export", "open", "validate", "apply"].includes(args[1]), "No unlisted CLI operation belongs to this fixture");
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill() { throw Error("No real process exists"); } });
    setImmediate(async () => {
      try {
        child.emit("spawn");
        let payload: Record<string, unknown> = { actionId: id, subProgramId: "FixtureSubprogram", editVersion: 7,
          compressed: { steps: [{ key: "sys:showText", inputs: { text: "Fixture" } }], variables: [] } };
        if (args[1] === "validate" || args[1] === "apply") payload = { success: true, editVersion: args[1] === "apply" ? 8 : 7 };
        else if (args[1] !== "get") {
          const directory = args[args.indexOf("--dir") + 1];
          await fs.mkdir(directory, { recursive: true });
          if (args[1] === "open") {
            await fs.writeFile(join(directory, "program.source.yaml"), "steps: []\n");
            payload = fail ? { errorCode: "WRITE_RESULT_UNKNOWN", error: "Receipt lost after export" }
              : { ok: true, actionId: id, sourcePath: join(directory, "program.source.yaml") };
          } else {
            await fs.writeFile(join(directory, "data.json"), JSON.stringify({ steps: [], variables: [] }));
            await fs.writeFile(join(directory, "info.json"), JSON.stringify(args[0] === "action" ? { id, title: "Fixture", editVersion: 7 }
              : { Id: "FixtureSubprogram", Name: "FixtureSubprogram", CallIdentifier: "@@FixtureSubprogram", EditVersion: 7 }));
            payload = { projectDirectory: relative(root, directory) };
          }
        }
        const ok = !(fail && args[1] === "open");
        child.stdout.write(JSON.stringify({ ok, payload, hostBinding: binding }));
        child.emit("close", ok ? 0 : 1);
      } catch (error) { child.emit("error", error); }
    });
    return child as unknown as ReturnType<typeof childProcess.spawn>;
  });
  syncBuiltinESMExports();
  try { await run(root, calls, () => { fail = true; }, httpOps); }
  finally {
    spawn.mock.restore(); syncBuiltinESMExports(); globalThis.fetch = oldFetch;
    keys.forEach((key, index) => { if (before[index] === undefined) delete process.env[key]; else process.env[key] = before[index]; });
    const child = relative(parent, root); assert.ok(child.startsWith("fixture-") && !child.includes(".."));
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("real get wrappers retain Agent implicit export and Ask no-bootstrap/no-files semantics", async () => fixture(async (root, calls) => {
  for (const mode of ["ask", "agent"] as const) {
    await runWithAgentRequestContextAsync({ cwd: root, chatMode: mode }, async () => {
      bindQkrpcTarget({ gateway: "cli", binding });
      const action = await executeQkrpcActionIdTool({ action: "get", id });
      const subprogram = await executeQkrpcSubprogramIdTool({ action: "get", id: "FixtureSubprogram" });
      assert.equal(action.ok, true); assert.equal(subprogram.ok, true);
      const facts = programToolOperationFacts("qkrpc_action_get", {}, mode === "ask" ? "connected-host" : "compatibility-get");
      assert.equal(facts.implicitExport, mode === "ask" ? "none" : "possible");
      if (mode === "ask") { assert.deepEqual(await fs.readdir(root), []); assert.equal(calls.length, 2); }
    });
  }
  assert.deepEqual(calls.map(args => args.slice(0, 2)), [["action", "get"], ["subprogram", "get"], ["action", "get"], ["action", "extract"], ["subprogram", "get"], ["subprogram", "export"]]);
  assert.equal(calls.slice(0, 2).every(args => args.includes("--no-bootstrap")), true);
  assert.equal(calls.slice(2).some(args => args.includes("--no-bootstrap")), false);
  assert.ok((await fs.readFile(join(root, ".quicker/actions", id, "data.json"), "utf8")).includes("steps"));
  assert.ok((await fs.readFile(join(root, ".quicker/subprograms/FixtureSubprogram/data.json"), "utf8")).includes("steps"));
}));

test("real source-open port writes once and preserves an unknown receipt without retry", async () => fixture(async (root, calls, failOpen) => {
  await runWithAgentRequestContextAsync({ cwd: root, chatMode: "agent" }, async () => {
    bindQkrpcTarget({ gateway: "cli", binding });
    failOpen();
    const result = await QKRPC_ACTION_OPEN_TOOL_DEF.execute!({ id, dir: ".tmp/bundle" }, options) as { ok: boolean };
    assert.equal(result.ok, false);
    assert.match(JSON.stringify(result), /WRITE_RESULT_UNKNOWN/);
    assert.equal(calls.length, 1); assert.deepEqual(calls[0].slice(0, 2), ["action", "open"]);
    assert.equal(await fs.readFile(join(root, ".tmp/bundle/program.source.yaml"), "utf8"), "steps: []\n");
    assert.equal(programToolOperationFacts("qkrpc_action_open", {}, "source-bundle").replayAfterUnknown, "unsafe");
    const rejected = await runQkrpcProgramToolPort(["action", "open", "--id", id, "--dir", root], "connected-host");
    assert.equal(rejected.ok, false); assert.equal(calls.length, 1, "a mismatched port cannot dispatch");
  });
}));

test("workspace patch denies Ask before IO; Agent applies content and checkpoints without moving CLI-bound lint to HTTP", async () => fixture(async (root, calls, _fail, httpOps) => {
  const directory = join(root, ".quicker/subprograms/FixtureSubprogram");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(join(directory, "info.json"), JSON.stringify({ Id: "FixtureSubprogram", Name: "FixtureSubprogram", EditVersion: 7 }));
  await fs.writeFile(join(directory, "data.json"), '{"steps":[],"variables":[]}');
  for (const mode of ["ask", "agent"] as const) {
    await runWithAgentRequestContextAsync({ cwd: root, chatMode: mode }, async () => {
      bindQkrpcTarget({ gateway: "cli", binding });
      const tools = applyToolModeGuards({ workspace_program: WORKSPACE_PROGRAM_TOOL_DEF }, mode, {
        workspace_program: input => executeWorkspaceProgramReadOnly(input as WorkspaceProgramToolInput),
      });
      const input = { action: "patch", target: "global_subprogram", id: "FixtureSubprogram" } as const;
      const result = await tools.workspace_program.execute!(input, options) as { ok: boolean };
      assert.equal(result.ok, mode === "agent");
      if (mode === "ask") { assert.equal(calls.length, 0); assert.equal(httpOps.length, 0); }
      else {
        assert.equal(programToolOperationFacts("workspace_program", input, "workspace").hostMutation, "possible");
        assert.deepEqual(calls.map(args => args.slice(0, 2)), [["subprogram", "validate"], ["subprogram", "apply"]]);
        assert.match(await fs.readFile(join(directory, "info.json"), "utf8"), /8/);
        assert.equal(programToolOperationFacts("workspace_program", input, "workspace").backgroundDiagnostics, "possible");
        assert.deepEqual(httpOps, [], "the existing host binding blocks a CLI-to-HTTP switch for background lint");
      }
    });
  }
}));
