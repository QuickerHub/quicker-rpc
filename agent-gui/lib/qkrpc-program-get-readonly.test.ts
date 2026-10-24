import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs/promises";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { mock, test } from "node:test";
import { runQkrpcReadOnlyGetForTool } from "./qkrpc";
import { executeQkrpcActionGetReadOnly, executeQkrpcActionIdTool } from "./qkrpc-action-tool.server";
import { executeQkrpcSubprogramGetReadOnly, executeQkrpcSubprogramIdTool } from "./qkrpc-subprogram-tool.server";
import { bindQkrpcTarget, currentQkrpcTarget, type QkrpcHostBinding } from "./qkrpc-host-binding";
import { runWithAgentRequestContextAsync } from "./qkrpc-request-context";
import { applyToolModeGuards } from "./agent-tool-mode-guard";
import { selectSubagentTools } from "./task-tool-capabilities";
import { QKRPC_ACTION_GET_TOOL_DEF } from "./qkrpc-action-tool.server";
import { QKRPC_SUBPROGRAM_GET_TOOL_DEF } from "./qkrpc-subprogram-tool.server";
import { convertToModelMessages, generateText, type ToolExecutionOptions, type UIMessage } from "ai";
import { MockLanguageModelV3 } from "ai/test";

const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const base = "http://ask-readonly-fixture.invalid:19477";
const binding: QkrpcHostBinding = {
  hostInstanceId: "readonly-fixture", hostSessionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  protocolVersion: 1, schemaVersion: 1, hostKind: "v1", capabilities: {},
};
const payload = { actionId: id, subProgramId: "FixtureSubprogram", callIdentifier: "@@FixtureSubprogram", editVersion: 7,
  compressed: { steps: [{ key: "sys:showText", inputs: { text: "Fixture body" } }], variables: [{ key: "value" }] } };
type Call = { args: string[]; env: NodeJS.ProcessEnv };

async function fixture(run: (root: string, calls: Call[], setResult: (value: { code: number; stdout: string; stderr?: string }) => void) => Promise<void>) {
  const parent = fileURLToPath(new URL("../../.tmp/ask-program-get/", import.meta.url));
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(join(parent, "fixture-"));
  await fs.writeFile(join(root, "sentinel.json"), '{"keep":"unchanged"}\n');
  const oldFetch = globalThis.fetch;
  const keys = ["QKRPC_BIN", "QKRPC_HTTP_URL", "QKRPC_TRANSPORT", "QKRPC_HOST_BINDING", "QKRPC_HOST_SESSION", "AGENT_GUI_DEFAULT_CWD"];
  const previous = keys.map((key) => process.env[key]);
  process.env.QKRPC_BIN = process.execPath; // Only the intercepted spawn can run.
  process.env.QKRPC_HTTP_URL = base;
  process.env.QKRPC_TRANSPORT = "http";
  process.env.AGENT_GUI_DEFAULT_CWD = root;
  delete process.env.QKRPC_HOST_BINDING; delete process.env.QKRPC_HOST_SESSION;
  let httpCalls = 0;
  globalThis.fetch = async () => { httpCalls += 1; return Response.json({ ok: true, data: { ok: true, payload } }); };
  const calls: Call[] = [];
  let result = { code: 0, stdout: JSON.stringify({ ok: true, payload }), stderr: "" };
  const spawn = mock.method(childProcess, "spawn", (_bin: unknown, args: unknown, options: unknown) => {
    const argv = args as string[];
    calls.push({ args: [...argv], env: { ...(options as { env: NodeJS.ProcessEnv }).env } });
    assert.ok(argv[0] === "host" && argv[1] === "list" || ["action", "subprogram"].includes(argv[0]) && argv[1] === "get", "No export/bootstrap/repair child is permitted");
    if (argv[0] !== "host") assert.deepEqual(argv.filter((arg) => /^--no-bootstrap(?:=|$)/.test(arg)), ["--no-bootstrap"]);
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill() { throw new Error("No real process exists"); } });
    setImmediate(() => {
      child.emit("spawn");
      child.stdout.write(argv[0] === "host" ? JSON.stringify({ candidates: [binding] }) : result.stdout);
      if (argv[0] !== "host" && result.stderr) child.stderr.write(result.stderr);
      child.emit("close", argv[0] === "host" ? 0 : result.code);
    });
    return child as unknown as ReturnType<typeof childProcess.spawn>;
  });
  const mutations: string[] = [];
  const spies = (["mkdir", "writeFile", "appendFile", "rename", "copyFile", "link", "symlink", "unlink", "rm", "open"] as const).map((operation) =>
    mock.method(fs, operation, (() => { mutations.push(operation); throw new Error(`Workspace mutation: ${operation}`); }) as never));
  syncBuiltinESMExports();
  try {
    await run(root, calls, (next) => { result = { ...next, stderr: next.stderr ?? "" }; });
    assert.equal(httpCalls, 0, "Read-only get must bypass even an available HTTP gateway");
    assert.deepEqual(mutations, []);
    assert.deepEqual(await fs.readdir(root), ["sentinel.json"]);
    assert.equal(await fs.readFile(join(root, "sentinel.json"), "utf8"), '{"keep":"unchanged"}\n');
  } finally {
    spies.forEach((spy) => spy.mock.restore()); spawn.mock.restore(); syncBuiltinESMExports();
    globalThis.fetch = oldFetch;
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    const relative = root.slice(parent.length);
    assert.ok(root.startsWith(parent) && relative.startsWith("fixture-"));
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("production readonly selector bypasses available HTTP and rebuilds only non-bootstrapping get commands", async () => {
  await fixture((root, calls) => runWithAgentRequestContextAsync({ cwd: root }, async () => {
    const read = await runQkrpcReadOnlyGetForTool(["action", "get", "--id", id, "--return-mode", "full", "--no-bootstrap=false"]);
    assert.equal(read.ok, true); assert.deepEqual((read.parsed as { payload: unknown }).payload, payload);
    assert.deepEqual(calls.map((call) => call.args.slice(0, 2)), [["host", "list"], ["action", "get"]]);
    assert.equal(calls[1].env.QKRPC_HOST_SESSION, binding.hostSessionId);
    assert.equal(currentQkrpcTarget()?.binding.hostSessionId, binding.hostSessionId);
    assert.equal((await runQkrpcReadOnlyGetForTool(["action", "extract", "--id", id])).ok, false);
    assert.equal(calls.length, 2);
  }));
});

test("direct Ask getters and current approval/child wrappers return bodies with zero exports or workspace writes", async () => {
  await fixture((root, calls) => runWithAgentRequestContextAsync({ cwd: root, chatMode: "ask" }, async () => {
    bindQkrpcTarget({ gateway: base, binding });
    for (const result of [
      await executeQkrpcActionIdTool({ action: "get", id, returnMode: "full" }),
      await executeQkrpcSubprogramIdTool({ action: "get", id: "FixtureSubprogram", returnMode: "full" }),
    ]) {
      assert.equal(result.ok, true);
      assert.deepEqual((result.data as { payload: unknown }).payload, payload);
      assert.equal(JSON.stringify(result).includes("workspaceSynced"), false);
    }
    // The explicit wrapper must win even if the ambient compatibility context says Agent.
    await runWithAgentRequestContextAsync({ cwd: root, chatMode: "agent" }, async () => {
      const tools = applyToolModeGuards({ qkrpc_action_get: QKRPC_ACTION_GET_TOOL_DEF, qkrpc_subprogram_get: QKRPC_SUBPROGRAM_GET_TOOL_DEF }, "ask", {
        qkrpc_action_get: (input, options) => executeQkrpcActionGetReadOnly(input as { id: string }, { abortSignal: options.abortSignal }),
        qkrpc_subprogram_get: (input, options) => executeQkrpcSubprogramGetReadOnly(input as { id: string }, { abortSignal: options.abortSignal }),
      });
      const child = selectSubagentTools(tools, undefined);
      const options = { toolCallId: "saved-approval", messages: [] } as ToolExecutionOptions;
      for (const definition of Object.values(child)) assert.equal((await definition.execute!({ id, action: "export", readOnly: false }, options) as { ok: boolean }).ok, true);
    });
    assert.equal(calls.length, 4);
    assert.equal(calls.every((call) => call.env.QKRPC_HOST_SESSION === binding.hostSessionId), true);
  }));
});

test("read failure and the existing connectivity gate never start repair, fall back, or export", async () => {
  await fixture((root, calls, setResult) => runWithAgentRequestContextAsync({ cwd: root, chatMode: "ask" }, async () => {
    bindQkrpcTarget({ gateway: base, binding });
    setResult({ code: 1, stdout: '{"ok":false,"error":"FIXTURE_READ_FAILED"}', stderr: "fixture read denied" });
    const failed = await executeQkrpcActionIdTool({ action: "get", id });
    assert.equal(failed.ok, false); assert.match(String(failed.stderr), /fixture read denied/);
    assert.equal(calls.length, 1);
    setResult({ code: 1, stdout: '{"ok":false,"error":"PLUGIN_NOT_RUNNING"}', stderr: "fixture plugin disconnected" });
    assert.equal((await executeQkrpcActionIdTool({ action: "get", id })).ok, false);
    assert.equal(calls.length, 2);
    const blocked = await executeQkrpcSubprogramIdTool({ action: "get", id: "FixtureSubprogram" });
    assert.equal(blocked.ok, false); assert.equal(calls.length, 2);
    const reason = new Error("stop before any connection");
    const cancel = new AbortController(); cancel.abort(reason);
    await assert.rejects(executeQkrpcActionGetReadOnly({ id }, { abortSignal: cancel.signal }), (error) => error === reason);
    assert.equal(calls.length, 2);
  }));
});

test("a saved SDK approval resumes through the current Ask read port instead of the old exporter", async () => {
  await fixture((root, calls) => runWithAgentRequestContextAsync({ cwd: root, chatMode: "agent" }, async () => {
    bindQkrpcTarget({ gateway: base, binding });
    const tools = applyToolModeGuards({ qkrpc_action_get: QKRPC_ACTION_GET_TOOL_DEF }, "ask", {
      qkrpc_action_get: (input, options) => executeQkrpcActionGetReadOnly(input as { id: string }, { abortSignal: options.abortSignal }),
    });
    const messages = await convertToModelMessages([{ id: "saved", role: "assistant", parts: [{
      type: "tool-qkrpc_action_get", toolCallId: "saved-get", state: "approval-responded",
      input: { id, returnMode: "full" }, approval: { id: "saved-approval", approved: true },
    }] }] as UIMessage[], { tools });
    const result = await generateText({ tools, messages, model: new MockLanguageModelV3({ doGenerate: {
      content: [{ type: "text", text: "offline read complete" }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }, warnings: [],
    } }) });
    assert.equal(result.text, "offline read complete");
    assert.deepEqual(calls.map((call) => call.args.slice(0, 2)), [["action", "get"]]);
  }));
});

test("Agent getters retain their existing HTTP read and automatic export behavior", async () => {
  await fixture((root, calls) => runWithAgentRequestContextAsync({ cwd: root, chatMode: "agent" }, async () => {
    bindQkrpcTarget({ gateway: base, binding });
    const operations: string[] = [];
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith("/health")) return Response.json({ service: "qkrpc", ok: true });
      const request = JSON.parse(String(init?.body)) as { op: string };
      operations.push(request.op);
      if (request.op === "action.get" || request.op === "subprogram.get") return Response.json({ ok: true, data: { ok: true, payload } });
      assert.ok(request.op === "action.extract" || request.op === "subprogram.export");
      return Response.json({ ok: false, error: "FIXTURE_EXPORT_DENIED", message: "fixture stops before export" });
    };
    assert.equal((await executeQkrpcActionIdTool({ action: "get", id })).ok, true);
    assert.equal((await executeQkrpcSubprogramIdTool({ action: "get", id: "FixtureSubprogram" })).ok, true);
    assert.deepEqual(operations, ["action.get", "action.extract", "subprogram.get", "subprogram.export"]);
    assert.equal(calls.length, 0);
  }));
});
