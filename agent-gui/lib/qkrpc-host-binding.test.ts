import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { syncBuiltinESMExports } from "node:module";
import { mock, test } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { invokeQkrpcHttp } from "./qkrpc-http";
import { currentQkrpcTarget, readHostBinding, isQkrpcReadOnlyInvoke, type QkrpcHostBinding } from "./qkrpc-host-binding";
import { runWithAgentRequestContextAsync } from "./qkrpc-request-context";
import { formatQkrpcResultForAgent, runQkrpcForTool, runQkrpcWithPatchFileForTool } from "./qkrpc";
import { isQkrpcBinMissingFailure, isQkrpcConnectivityFailure } from "./qkrpc-connectivity";
import { saveActionFromWorkspace } from "./action-project-workflow";
import { getActionProjectSyncStatus } from "./action-project-sync";
import { parseQkrpcJson } from "./qkrpc-json";
import { argvToInvoke } from "./qkrpc-argv";
import { compareActionEditVersions } from "./action-project-sync-types";
import { hasImpreciseEditVersionFromGetPayload, normalizeEditVersion, readEditVersionFromGetPayload } from "./action-project-info-from-get";
import { actionProjectInfoFromCreateResponse, actionProjectInfoFromMetadataGet, editVersionToNumber, parseActionProjectInfoProto } from "./action-project-info";
import { buildInSyncStatusAfterPush } from "./action-project-sync-events";

const base = "http://binding-fixture.invalid:19477";

test("FA paging is an explicit read while unknown FA operations keep no-replay policy", () => {
  assert.equal(isQkrpcReadOnlyInvoke({ op: "fa.page", args: {} }), true);
  assert.equal(isQkrpcReadOnlyInvoke({ op: "fa.unknown", args: {} }), false);
});
const a: QkrpcHostBinding = {
  hostInstanceId: "instance-a", hostSessionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "fixture",
  capabilities: { "action.source.read": true, "action.source.write": true },
};
const b: QkrpcHostBinding = { ...a, hostInstanceId: "instance-b", hostSessionId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", hostKind: "v2",
  capabilities: { "action.source.read": false } };

test("a CLI process that never starts preserves its known launch failure", async () => {
  const keys = ["QKRPC_TRANSPORT", "QKRPC_BIN", "QKRPC_HOST_BINDING"];
  const previous = keys.map((key) => process.env[key]);
  process.env.QKRPC_TRANSPORT = "cli";
  process.env.QKRPC_BIN = process.execPath;
  process.env.QKRPC_HOST_BINDING = JSON.stringify(a);
  let calls = 0;
  const spawn = mock.method(childProcess, "spawn", () => {
    calls += 1;
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill() {} });
    setImmediate(() => child.emit("error", Object.assign(new Error("spawn fixture.exe ENOENT"), { code: "ENOENT" })));
    return child as unknown as ReturnType<typeof childProcess.spawn>;
  });
  syncBuiltinESMExports();
  try {
    for (const operation of ["open", "save"]) {
      const result = await runWithAgentRequestContextAsync({}, () => runQkrpcForTool(["action", operation, "--id", "fixture-only", "--dir", ".tmp/fixture-only"]));
      assert.equal(result.parsed, null);
      assert.equal(isQkrpcBinMissingFailure(result), true);
      assert.equal((formatQkrpcResultForAgent(result).data as { status?: string }).status, "bin_missing");
    }
    assert.equal(calls, 2);
  } finally {
    spawn.mock.restore(); syncBuiltinESMExports();
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
  }
});

test("a successful CLI exit without its requested JSON acknowledgement cannot certify a local export", async () => {
  const keys = ["QKRPC_TRANSPORT", "QKRPC_BIN", "QKRPC_HOST_BINDING"];
  const previous = keys.map((key) => process.env[key]);
  process.env.QKRPC_TRANSPORT = "cli";
  process.env.QKRPC_BIN = process.execPath;
  process.env.QKRPC_HOST_BINDING = JSON.stringify(a);
  let calls = 0;
  const spawn = mock.method(childProcess, "spawn", () => {
    calls += 1;
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill() {} });
    setImmediate(() => { child.emit("spawn"); child.stdout.write("fixture incomplete acknowledgement"); child.emit("close", 0); });
    return child as unknown as ReturnType<typeof childProcess.spawn>;
  });
  syncBuiltinESMExports();
  try {
    const argv = ["action", "extract", "--id", "fixture-only", "--dir", ".tmp/fixture-only"];
    const machine = await runWithAgentRequestContextAsync({}, () => runQkrpcForTool(argv));
    assert.equal(machine.ok, false);
    assert.equal((machine.parsed as { error?: string })?.error, "WRITE_RESULT_UNKNOWN");
    const text = await runWithAgentRequestContextAsync({}, () => runQkrpcForTool(argv, { json: false }));
    assert.equal(text.ok, true, "explicit text mode still accepts the process success receipt");
    assert.equal(text.stdout, "fixture incomplete acknowledgement");
    assert.equal(calls, 2);
  } finally {
    spawn.mock.restore(); syncBuiltinESMExports();
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
  }
});

test("a CLI timeout before a spawn event remains uncertain rather than claiming the process never started", async () => {
  const keys = ["QKRPC_TRANSPORT", "QKRPC_BIN", "QKRPC_HOST_BINDING"];
  const previous = keys.map((key) => process.env[key]);
  process.env.QKRPC_TRANSPORT = "cli";
  process.env.QKRPC_BIN = process.execPath;
  process.env.QKRPC_HOST_BINDING = JSON.stringify(a);
  let calls = 0, kills = 0;
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => { entered = resolve; });
  const spawn = mock.method(childProcess, "spawn", () => {
    calls += 1; entered();
    return Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill() { kills += 1; } }) as unknown as ReturnType<typeof childProcess.spawn>;
  });
  syncBuiltinESMExports();
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const pending = runWithAgentRequestContextAsync({}, () => runQkrpcForTool(["action", "extract", "--id", "fixture-only", "--dir", ".tmp/fixture-only"], { timeoutMs: 1 }));
    await ready;
    mock.timers.tick(1);
    const result = await pending;
    assert.equal((result.parsed as { error?: string })?.error, "WRITE_RESULT_UNKNOWN");
    assert.equal(calls, 1); assert.equal(kills, 1);
  } finally {
    mock.timers.reset(); spawn.mock.restore(); syncBuiltinESMExports();
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
  }
});

async function isolated(fetch: typeof globalThis.fetch, run: () => Promise<void>) {
  const oldFetch = globalThis.fetch;
  const keys = ["QKRPC_HTTP_URL", "QKRPC_TRANSPORT", "QKRPC_HOST_BINDING", "QKRPC_HOST_SESSION", "QKRPC_BIN"];
  const oldEnv = keys.map((key) => process.env[key]);
  globalThis.fetch = fetch;
  process.env.QKRPC_HTTP_URL = base;
  delete process.env.QKRPC_TRANSPORT;
  delete process.env.QKRPC_HOST_BINDING;
  delete process.env.QKRPC_HOST_SESSION;
  try { await run(); }
  finally {
    globalThis.fetch = oldFetch;
    keys.forEach((key, index) => { if (oldEnv[index] === undefined) delete process.env[key]; else process.env[key] = oldEnv[index]; });
  }
}

function request(init?: RequestInit) { return JSON.parse(String(init?.body)) as { op: string; hostBinding?: QkrpcHostBinding }; }

test("generic HTTP exports preserve unknown receipts through turn gating and Agent formatting", async () => {
  let spawns = 0;
  const posts: string[] = [];
  const spawn = mock.method(childProcess, "spawn", () => { spawns += 1; throw new Error("Unexpected CLI fallback"); });
  syncBuiltinESMExports();
  try {
    for (const response of [() => new Response(""), () => new Response("{invalid"), () => { throw new Error("fetch failed after local export"); }]) {
      await isolated(async (url, init) => {
        if (String(url).endsWith("/health")) return Response.json({ service: "qkrpc", ok: true });
        const operation = request(init).op;
        // Older hosts have no verified identity. Test the result itself, rather than relying on the turn binding to block fallback.
        if (operation === "host.list") return Response.json({ ok: true, data: { candidates: [] } });
        posts.push(operation);
        return response();
      }, () => runWithAgentRequestContextAsync({}, async () => {
        const result = await runQkrpcForTool(["action", "extract", "--id", "fixture-only", "--dir", ".tmp/fixture-only"]);
        assert.equal(currentQkrpcTarget(), undefined);
        assert.equal((result.parsed as { error?: string })?.error, "WRITE_RESULT_UNKNOWN");
        assert.equal(isQkrpcConnectivityFailure(result), false);
        const formatted = formatQkrpcResultForAgent(result);
        assert.equal(formatted.ok, false);
        assert.equal((formatted.data as { error?: string }).error, "WRITE_RESULT_UNKNOWN");
        assert.equal((formatted.data as { retryable?: boolean }).retryable, false);
        assert.equal((formatted.data as { guidance?: unknown }).guidance, undefined);
        assert.equal(JSON.stringify(formatted).includes("qkrpc_wait"), false);
        assert.equal(isQkrpcBinMissingFailure({ ...result, stderr: "fixture ENOENT after dispatch" }), false);
        // A diagnostic read in the same turn remains possible: the unknown receipt must not become a connectivity-blocked recovery instruction.
        assert.equal((await runQkrpcForTool(["fa", "search", "--query", "fixture-only"])).ok, false);
      }));
    }
    assert.equal(spawns, 0);
    assert.equal(posts.filter((op) => op === "action.extract").length, 3);
    assert.equal(posts.filter((op) => op === "fa.search").length, 3, "no connectivity gate replaces the subsequent read");
  } finally { spawn.mock.restore(); syncBuiltinESMExports(); }
});

test("multiple hosts require selection; source capability filters and binding is immutable", async () => {
  let writes = 0;
  await isolated(async (url, init) => {
    if (String(url).endsWith("/health")) return Response.json({ service: "qkrpc", ok: true });
    if (request(init).op === "host.list") return Response.json({ ok: true, data: { candidates: [a, b] } });
    writes += 1;
    return Response.json({ ok: true, data: { ok: true } });
  }, async () => {
    const ambiguous = await invokeQkrpcHttp({ op: "action.run", args: {} });
    assert.equal((ambiguous?.parsed as { error: string }).error, "HOST_SELECTION_REQUIRED");
    assert.equal(writes, 0);
    await runWithAgentRequestContextAsync({}, async () => {
      assert.equal((await invokeQkrpcHttp({ op: "action.open", args: {} }))?.ok, true);
      assert.equal(currentQkrpcTarget()?.binding.hostSessionId, a.hostSessionId);
      assert.equal(Object.isFrozen(currentQkrpcTarget()?.binding.capabilities), true);
    });
    assert.equal(writes, 1);
  });
  assert.equal(readHostBinding({ ...a, endpoint: b.endpoint }), undefined);
});

test("a bound write never scans a replacement gateway, falls back, or repeats after disconnect", async () => {
  const posts: string[] = [];
  let offline = false;
  let spawns = 0;
  const spawn = mock.method(childProcess, "spawn", () => { spawns += 1; throw new Error("Unexpected fallback"); });
  syncBuiltinESMExports();
  try {
    await isolated(async (url, init) => {
      assert.ok(String(url).startsWith(base), "A replacement gateway was contacted");
      if (String(url).endsWith("/health")) return Response.json({ service: "qkrpc", ok: true });
      const req = request(init);
      if (req.op === "host.list") return Response.json({ ok: true, data: { candidates: [a] } });
      posts.push(req.op);
      assert.equal(req.hostBinding?.hostSessionId, a.hostSessionId);
      if (offline) throw new Error("fetch failed after write was sent");
      return Response.json({ ok: true, data: { ok: true } });
    }, () => runWithAgentRequestContextAsync({}, async () => {
      await invokeQkrpcHttp({ op: "action.get", args: {} });
      offline = true;
      process.env.QKRPC_HTTP_URL = "http://replacement.invalid:19478";
      const result = await runQkrpcWithPatchFileForTool(["action", "patch", "--id", "fixture"], {});
      assert.equal((result.parsed as { error: string }).error, "WRITE_RESULT_UNKNOWN");
      assert.equal(spawns, 0);
      assert.deepEqual(posts, ["action.get", "action.patch"]);
    }));
  } finally { spawn.mock.restore(); syncBuiltinESMExports(); }
});

test("parallel turns cancel independently and never share target state", async () => {
  const cancel = new AbortController();
  let started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  await isolated(async (_url, init) => {
    const req = request(init);
    if (req.hostBinding?.hostSessionId === a.hostSessionId) {
      started();
      return new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true }));
    }
    assert.equal(req.hostBinding?.hostSessionId, b.hostSessionId);
    return Response.json({ ok: true, data: { ok: true } });
  }, async () => {
    const first = runWithAgentRequestContextAsync({ abortSignal: cancel.signal }, () =>
      invokeQkrpcHttp({ op: "action.run", args: {} }, { hostBinding: a }));
    const rejected = assert.rejects(first, /cancel A/);
    await ready;
    const survivor = await runWithAgentRequestContextAsync({}, async () => {
      const result = await invokeQkrpcHttp({ op: "action.run", args: {} }, { hostBinding: b });
      assert.equal(currentQkrpcTarget()?.binding.hostSessionId, b.hostSessionId);
      return result;
    });
    cancel.abort(new Error("cancel A"));
    await rejected;
    assert.equal(survivor?.ok, true);
    assert.equal(currentQkrpcTarget(), undefined);
  });
});

test("invalid explicit bindings fail before HTTP or CLI discovery", async () => {
  await isolated(async () => { throw new Error("Unexpected request"); }, async () => {
    process.env.QKRPC_HOST_BINDING = "{broken";
    const http = await invokeQkrpcHttp({ op: "action.run", args: {} });
    assert.equal((http?.parsed as { error: string }).error, "HOST_HANDSHAKE_INVALID");
    process.env.QKRPC_TRANSPORT = "cli";
    const cli = await runQkrpcForTool(["action", "run", "--id", "fixture"]);
    assert.equal((cli.parsed as { error: string }).error, "HOST_HANDSHAKE_INVALID");
  });
});

test("CLI debug transport pins the first verified host and passes it to every subprocess", async () => {
  const calls: Array<{ args: string[]; binding?: QkrpcHostBinding }> = [];
  const spawn = mock.method(childProcess, "spawn", (_bin: unknown, args: unknown, options: unknown) => {
    const env = (options as { env: NodeJS.ProcessEnv }).env;
    const argv = args as string[];
    calls.push({ args: argv, binding: env.QKRPC_HOST_BINDING ? JSON.parse(env.QKRPC_HOST_BINDING) : undefined });
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill() {} });
    setImmediate(() => {
      child.emit("spawn");
      child.stdout.write(argv[0] === "host" ? JSON.stringify({ candidates: [a] }) : '{"ok":true,"editVersion":9007199254740993}');
      child.emit("close", 0);
    });
    return child as unknown as ReturnType<typeof childProcess.spawn>;
  });
  syncBuiltinESMExports();
  try {
    await isolated(async () => { throw new Error("CLI must not contact HTTP"); }, () => runWithAgentRequestContextAsync({}, async () => {
      process.env.QKRPC_TRANSPORT = "cli";
      process.env.QKRPC_BIN = process.execPath;
      const read = await runQkrpcForTool(["action", "get", "--id", "fixture"]);
      assert.equal(read.ok, true);
      assert.equal((read.parsed as { editVersion: string }).editVersion, "9007199254740993");
      process.env.QKRPC_HOST_SESSION = b.hostSessionId;
      assert.equal((await runQkrpcForTool(["action", "run", "--id", "fixture"]))?.ok, true);
      assert.equal(currentQkrpcTarget()?.binding.hostSessionId, a.hostSessionId);
      assert.equal(calls.length, 3);
      assert.equal(calls[1].binding?.hostSessionId, a.hostSessionId);
      assert.equal(calls[2].binding?.hostSessionId, a.hostSessionId);
      process.env.QKRPC_TRANSPORT = "http";
      assert.equal((await runQkrpcWithPatchFileForTool(["action", "patch", "--id", "fixture"], {})).ok, true);
      assert.equal(calls.at(-1)?.binding?.hostSessionId, a.hostSessionId);
    }));
  } finally { spawn.mock.restore(); syncBuiltinESMExports(); }
});

test("Agent trace sends the current host binding and parent cancellation signal", async () => {
  const { runActionTraceForAgentTool } = await import("./action-trace-stream.server");
  await isolated(async (url, init) => {
    if (String(url).endsWith("/health")) return Response.json({ service: "qkrpc", ok: true });
    const req = request(init);
    assert.equal(req.hostBinding?.hostSessionId, b.hostSessionId);
    if (String(url).endsWith("/v1/invoke")) return Response.json({ ok: true, data: {} });
    assert.equal(String(url), `${base}/v1/action/trace/stream`);
    assert.ok(init?.signal);
    return new Response('event: done\ndata: {"ok":true}\n\n', { headers: { "Content-Type": "text/event-stream" } });
  }, () => runWithAgentRequestContextAsync({ cwd: process.cwd(), threadId: "trace-binding",
    traceExecution: { executionId: "trace-binding", createRunId: () => "trace-binding-run", emit() {} } }, async () => {
    await invokeQkrpcHttp({ op: "action.get", args: {} }, { hostBinding: b });
    assert.equal((await runActionTraceForAgentTool({ id: "trace-fixture" })).ok, true);
  }));
});

test("concurrent first source saves bind before dispatch and cannot write two hosts", async () => {
  const writes: string[] = [];
  await isolated(async (_url, init) => {
    const req = JSON.parse(String(init?.body)) as { op: string; args: { dir: string }; hostBinding?: QkrpcHostBinding };
    if (req.op === "action.binding")
      return Response.json({ ok: true, data: { hostBinding: req.args.dir === "bundleA" ? a : b } });
    assert.equal(req.op, "action.save");
    writes.push(req.hostBinding!.hostSessionId);
    throw new Error("write response lost");
  }, () => runWithAgentRequestContextAsync({}, async () => {
    const results = await Promise.all(["bundleA", "bundleB"].map((dir) => invokeQkrpcHttp({ op: "action.save", args: { dir } })));
    assert.equal(writes.length, 1);
    assert.equal(currentQkrpcTarget()?.binding.hostSessionId, writes[0]);
    assert.deepEqual(results.map((r) => (r?.parsed as { error: string }).error).sort(), ["HOST_BINDING_MISMATCH", "WRITE_RESULT_UNKNOWN"]);
  }));
});

test("first trace honors configured binding and execution-time abort preserves the parent reason", async () => {
  const { runActionTraceForAgentTool } = await import("./action-trace-stream.server");
  const cancel = new AbortController();
  const reason = new Error("stop trace fixture");
  await isolated(async (url, init) => {
    assert.equal(String(url), `${base}/v1/action/trace/stream`);
    assert.equal(request(init).hostBinding?.hostSessionId, a.hostSessionId);
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        init!.signal!.addEventListener("abort", () => controller.error(init!.signal!.reason), { once: true });
        setImmediate(() => cancel.abort(reason));
      },
    }));
  }, () => runWithAgentRequestContextAsync({ abortSignal: cancel.signal, cwd: process.cwd(), threadId: "trace-abort",
    traceExecution: { executionId: "trace-abort", createRunId: () => "trace-abort-run", emit() {} } }, async () => {
    process.env.QKRPC_HOST_BINDING = JSON.stringify(a);
    await assert.rejects(runActionTraceForAgentTool({ id: "trace-cancel-fixture" }), (error) => error === reason);
  }));
});

test("an unavailable explicit session never falls back to an unbound HTTP or CLI read", async () => {
  const spawns: string[][] = [];
  const spawn = mock.method(childProcess, "spawn", (_bin: unknown, args: unknown) => {
    const argv = args as string[];
    spawns.push(argv);
    assert.deepEqual(argv, ["host", "list", "--json"]);
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill() {} });
    setImmediate(() => { child.emit("spawn"); child.stdout.write(JSON.stringify({ candidates: [a] })); child.emit("close", 0); });
    return child as unknown as ReturnType<typeof childProcess.spawn>;
  });
  syncBuiltinESMExports();
  try {
    await isolated(async (url, init) => {
      if (String(url).endsWith("/health")) return Response.json({ service: "qkrpc", ok: true });
      assert.equal(request(init).op, "host.list", "No unbound action request may be sent");
      return Response.json({ ok: true, data: { candidates: [a] } });
    }, async () => {
      process.env.QKRPC_HOST_SESSION = ` ${b.hostSessionId} `;
      for (const args of [["action", "get", "--id", "fixture"], ["action", "open", "--id", "fixture", "--dir", "fixture"]]) {
        const http = await runWithAgentRequestContextAsync({}, () => runQkrpcForTool(args));
        assert.equal((http.parsed as { error: string }).error, "HOST_UNAVAILABLE");
      }
      process.env.QKRPC_TRANSPORT = "cli";
      process.env.QKRPC_BIN = process.execPath;
      const cli = await runWithAgentRequestContextAsync({}, () => runQkrpcForTool(["action", "get", "--id", "fixture"]));
      assert.equal((cli.parsed as { error: string }).error, "HOST_UNAVAILABLE");
      assert.equal(spawns.length, 1);
    });
  } finally { spawn.mock.restore(); syncBuiltinESMExports(); }
});

test("CAS version parsing preserves only unsafe version integers and never certifies rounded status", () => {
  const parsed = parseQkrpcJson('{"editVersion":9007199254740993,"nested":{"EditVersion":9223372036854775807},"small":{"editVersion":42},"other":9007199254740993,"literal":"\\\"editVersion\\\":9007199254740993"}') as Record<string, unknown>;
  assert.equal(parsed.editVersion, "9007199254740993");
  assert.deepEqual(parsed.nested, { EditVersion: "9223372036854775807" });
  assert.deepEqual(parsed.small, { editVersion: 42 });
  assert.equal(typeof parsed.other, "number");
  assert.equal(parsed.literal, '"editVersion":9007199254740993');
  assert.throws(() => parseQkrpcJson('{"editVersion":9007199254740993 invalid}'));
  assert.throws(() => parseQkrpcJson('{"editVersion":09007199254740993}'));
  for (const verb of ["set-metadata", "apply", "patch"]) {
    assert.equal(argvToInvoke(["action", verb, "--expected-edit-version", "9007199254740993"])?.args.expectedEditVersion, "9007199254740993");
    assert.equal(argvToInvoke(["action", verb, "--expected-edit-version", "42"])?.args.expectedEditVersion, 42);
    assert.equal(argvToInvoke(["action", verb, "--expected-edit-version", " +9007199254740993 "])?.args.expectedEditVersion, "+9007199254740993");
  }
  assert.equal(actionProjectInfoFromCreateResponse(parsed).editVersion, 9007199254740993n);
  assert.equal(actionProjectInfoFromMetadataGet("fixture", parsed).editVersion, 9007199254740993n);
  const info = parseActionProjectInfoProto('{"ID":"fixture","Title":"Native","EditVersion":9007199254740993}');
  assert.equal(info.ok && info.data.editVersion, 9007199254740993n);
  assert.equal(editVersionToNumber(9007199254740993n), undefined);
  assert.equal(normalizeEditVersion(9007199254740992), undefined);
  assert.equal(readEditVersionFromGetPayload({ editVersion: "9007199254740993", compressed: { editVersion: 42 } }), "9007199254740993");
  assert.equal(hasImpreciseEditVersionFromGetPayload({ compressed: '{"EditVersion":9007199254740993}' }), false);
  assert.equal(compareActionEditVersions("9007199254740992", "9007199254740993"), "quicker_ahead");
  assert.equal(compareActionEditVersions("9007199254740993", "9007199254740992"), "disk_ahead");
  assert.equal(compareActionEditVersions(9007199254740992, 9007199254740992), "unknown_remote");
  assert.equal(compareActionEditVersions(42, 9007199254740992, { trustedRemoteEditVersion: 42 }), "unknown_remote");
  assert.equal(buildInSyncStatusAfterPush(9007199254740992).state, "unknown_remote");
});

async function localSyncFixture(run: (root: string, actionId: string, directory: string) => Promise<void>) {
  const parent = fileURLToPath(new URL("../../.tmp/host-binding/", import.meta.url));
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "sync-"));
  const actionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const directory = join(root, ".quicker", "actions", actionId);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "data.json"), '{"steps":[],"variables":[]}');
  await writeFile(join(directory, "info.json"), `{"id":"${actionId}","title":"Local","description":"","icon":"","editVersion":"42","opaque":9007199254740993}`);
  await mkdir(join(directory, ".qkrpc"), { recursive: true });
  await writeFile(join(directory, ".qkrpc", "project-binding.json"), JSON.stringify({ schemaVersion: 1, kind: "action", actionId, hostBinding: a }));
  try { await runWithAgentRequestContextAsync({ cwd: root }, () => run(root, actionId, directory)); }
  finally { assert.ok(root.startsWith(join(parent, "sync-"))); await rm(root, { recursive: true, force: true }); }
}

test("production local Sync pins read/body/metadata to one host and retains numeric Int64 CAS through the disk stamp", async () => {
  const calls: string[] = [];
  await isolated(async (url, init) => {
    assert.ok(String(url).startsWith(base), "Sync must keep the originally bound gateway");
    if (String(url).endsWith("/health")) return Response.json({ service: "qkrpc", ok: true });
    const req = JSON.parse(String(init?.body)) as { op: string; args: Record<string, unknown>; hostBinding?: QkrpcHostBinding };
    calls.push(req.op);
    assert.notEqual(req.op, "host.list", "Persisted project targets must not rediscover a host");
    assert.equal(req.hostBinding?.hostSessionId, a.hostSessionId);
    if (req.op === "action.validate") return Response.json({ ok: true, data: { success: true } });
    if (req.op === "action.get") {
      process.env.QKRPC_HOST_SESSION = b.hostSessionId;
      process.env.QKRPC_HTTP_URL = "http://replacement.invalid:19478";
      return new Response('{"ok":true,"data":{"success":true,"editVersion":9007199254740992,"compressed":{"title":"Remote","description":"","icon":""}}}');
    }
    if (req.op === "action.apply") return new Response('{"ok":true,"data":{"success":true,"editVersion":9007199254740993}}');
    assert.equal(req.op, "action.set-metadata");
    assert.equal(req.args.expectedEditVersion, "9007199254740993");
    return new Response('{"ok":true,"data":{"success":true,"editVersion":9223372036854775807}}');
  }, () => localSyncFixture(async (_root, actionId, directory) => {
    const result = await saveActionFromWorkspace({ id: actionId });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(calls, ["action.validate", "action.get", "action.apply", "action.set-metadata"]);
    const info = await readFile(join(directory, "info.json"), "utf8");
    assert.match(info, /"editVersion":"9223372036854775807"/);
    assert.match(info, /"opaque":9007199254740993/);
    const trust = JSON.parse(await readFile(join(directory, ".qkrpc", "sync-trust.json"), "utf8")) as { editVersion: unknown };
    assert.equal(trust.editVersion, "9223372036854775807");
  }));
});

test("a lost metadata write response is not replayed and cannot stamp the earlier body version", async () => {
  const writes: string[] = [];
  await isolated(async (url, init) => {
    assert.ok(String(url).startsWith(base));
    if (String(url).endsWith("/health")) return Response.json({ service: "qkrpc", ok: true });
    const req = JSON.parse(String(init?.body)) as { op: string; args: Record<string, unknown>; hostBinding?: QkrpcHostBinding };
    assert.notEqual(req.op, "host.list", "Persisted project targets must not rediscover a host");
    assert.equal(req.hostBinding?.hostSessionId, a.hostSessionId);
    if (req.op === "action.validate") return Response.json({ ok: true, data: { success: true } });
    if (req.op === "action.get") return Response.json({ ok: true, data: { success: true, compressed: { title: "Remote", description: "", icon: "" } } });
    writes.push(req.op);
    if (req.op === "action.apply") return new Response('{"ok":true,"data":{"success":true,"editVersion":9007199254740993}}');
    assert.equal(req.op, "action.set-metadata");
    assert.equal(req.args.expectedEditVersion, "9007199254740993");
    process.env.QKRPC_HOST_SESSION = b.hostSessionId;
    throw new Error("fetch failed after metadata write");
  }, () => localSyncFixture(async (_root, actionId, directory) => {
    const before = await readFile(join(directory, "info.json"), "utf8");
    const result = await saveActionFromWorkspace({ id: actionId });
    assert.equal(result.ok, false);
    assert.deepEqual(writes, ["action.apply", "action.set-metadata"]);
    assert.match(JSON.stringify(result), /"persistedParts":\{"body":true\}/);
    assert.equal(await readFile(join(directory, "info.json"), "utf8"), before);
  }));
});

test("an exact remote Int64 compares against the adjacent local and trusted Int64 without rounding", async () => {
  await isolated(async (url, init) => {
    if (String(url).endsWith("/health")) return Response.json({ service: "qkrpc", ok: true });
    assert.notEqual(request(init).op, "host.list", "Persisted project targets must not rediscover a host");
    assert.deepEqual(request(init).hostBinding, a);
    return new Response('{"ok":true,"data":{"success":true,"editVersion":9007199254740993,"compressed":{"title":"Remote"}}}');
  }, () => localSyncFixture(async (_root, actionId, directory) => {
    const info = await readFile(join(directory, "info.json"), "utf8");
    await writeFile(join(directory, "info.json"), info.replace('"editVersion":"42"', '"editVersion":9007199254740992'));
    await mkdir(join(directory, ".qkrpc"), { recursive: true });
    await writeFile(join(directory, ".qkrpc", "sync-trust.json"), '{"editVersion":"9007199254740992","updatedUtc":"fixture"}');
    const result = await getActionProjectSyncStatus(actionId);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status.state, "quicker_ahead");
      assert.equal(result.status.localEditVersion, "9007199254740992");
      assert.equal(result.status.remoteEditVersion, "9007199254740993");
    }
  }));
});

test("an exact local Int64 stays writable and compares against the adjacent remote Int64", async () => {
  await isolated(async (url, init) => {
    if (String(url).endsWith("/health")) return Response.json({ service: "qkrpc", ok: true });
    assert.notEqual(request(init).op, "host.list", "Persisted project targets must not rediscover a host");
    assert.deepEqual(request(init).hostBinding, a);
    return new Response('{"ok":true,"data":{"success":true,"editVersion":9007199254740992,"compressed":{"title":"Remote"}}}');
  }, () => localSyncFixture(async (_root, actionId, directory) => {
    const info = await readFile(join(directory, "info.json"), "utf8");
    await writeFile(join(directory, "info.json"), info.replace('"editVersion":"42"', '"editVersion":9007199254740993'));
    await mkdir(join(directory, ".qkrpc"), { recursive: true });
    await writeFile(join(directory, ".qkrpc", "sync-trust.json"), '{"editVersion":42,"updatedUtc":"fixture"}');
    const result = await getActionProjectSyncStatus(actionId);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status.state, "disk_ahead");
      assert.equal(result.status.localEditVersion, "9007199254740993");
      assert.equal(result.status.remoteEditVersion, "9007199254740992");
    }
  }));
});

test("Agent version schemas accept exact Int64 strings across dedicated, flat, strict and legacy tools", async () => {
  const { qkrpcEditVersionSchema } = await import("./qkrpc-edit-version-schema");
  const { QKRPC_ACTION_SET_METADATA_TOOL_DEF, QKRPC_ACTION_TOOL_DEF } = await import("./qkrpc-action-tool.server");
  const { QKRPC_SUBPROGRAM_IMPORT_TOOL_DEF, QKRPC_SUBPROGRAM_TOOL_DEF } = await import("./qkrpc-subprogram-tool.server");
  const { QKRPC_SUBPROGRAM_TRANSFER_TOOL_DEF } = await import("./qkrpc-subprogram-transfer-tool.server");
  const { legacyQuickerToolAliases } = await import("./legacy-tool-aliases");
  const actionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  for (const value of [42, "42", "9007199254740993", "9223372036854775807", "-9223372036854775808"]) {
    assert.equal(qkrpcEditVersionSchema.safeParse(value).success, true);
  }
  for (const value of [9007199254740992, 1.5, "1.5", "1e16", "9223372036854775808", "-9223372036854775809"]) {
    assert.equal(qkrpcEditVersionSchema.safeParse(value).success, false);
  }
  for (const [definition, fields] of [
    [QKRPC_ACTION_SET_METADATA_TOOL_DEF, { id: actionId, title: "Local" }],
    [QKRPC_ACTION_TOOL_DEF, { action: "set_metadata", id: actionId, title: "Local" }],
    [QKRPC_SUBPROGRAM_IMPORT_TOOL_DEF, { dir: "fixture" }],
    [QKRPC_SUBPROGRAM_TOOL_DEF, { action: "import", id: "fixture", dir: "fixture" }],
    [QKRPC_SUBPROGRAM_TRANSFER_TOOL_DEF, { direction: "import", dir: "fixture" }],
    [legacyQuickerToolAliases.qkrpc_action_replace, { id: actionId, xaction: {} }],
    [legacyQuickerToolAliases.qkrpc_subprogram_import, { dir: "fixture" }],
  ] as const) {
    const schema = definition.inputSchema as { safeParse(input: unknown): { success: boolean } };
    assert.equal(schema.safeParse({ ...fields, expectedEditVersion: "9007199254740993" }).success, true);
    assert.equal(schema.safeParse({ ...fields, expectedEditVersion: 42 }).success, true);
    assert.equal(schema.safeParse({ ...fields, expectedEditVersion: 9007199254740992 }).success, false);
  }
});

test("document CAS expectations preserve omitted, null and full records in HTTP and isolated CLI child environments", async () => {
  const record = { schemaVersion: 1 as const, kind: "action" as const, actionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", hostBinding: a };
  const expectations = [{}, { expectedProjectBinding: null }, { expectedProjectBinding: record, projectDirectory: "C:/fixture/.quicker/actions/fixture" }];
  const originalExpected = process.env.QKRPC_EXPECTED_PROJECT_BINDING;
  const originalDirectory = process.env.QKRPC_EXPECTED_PROJECT_DIRECTORY;
  process.env.QKRPC_EXPECTED_PROJECT_BINDING = '{"ambient":"must not inherit"}';
  process.env.QKRPC_EXPECTED_PROJECT_DIRECTORY = "C:/ambient/foreign";
  const children: NodeJS.ProcessEnv[] = [];
  const spawn = mock.method(childProcess, "spawn", (_bin: unknown, _args: unknown, options: unknown) => {
    children.push((options as { env: NodeJS.ProcessEnv }).env);
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill() {} });
    setImmediate(() => { child.emit("spawn"); child.stdout.write('{"success":true}'); child.emit("close", 0); });
    return child as unknown as ReturnType<typeof childProcess.spawn>;
  });
  syncBuiltinESMExports();
  try {
    let index = 0;
    await isolated(async (url, init) => {
      if (String(url).endsWith("/health")) return Response.json({ ok: true, service: "qkrpc" });
      const invoke = JSON.parse(String(init?.body));
      assert.equal(invoke.op, "action.validate");
      assert.deepEqual(invoke.hostBinding, a);
      const expected = expectations[index++]!;
      assert.equal(Object.hasOwn(invoke.args, "expectedProjectBinding"), Object.hasOwn(expected, "expectedProjectBinding"));
      if (Object.hasOwn(expected, "expectedProjectBinding")) assert.deepEqual(invoke.args.expectedProjectBinding, expected.expectedProjectBinding);
      if (expected.projectDirectory) assert.equal(invoke.args.dir, expected.projectDirectory);
      return Response.json({ ok: true, data: { success: true } });
    }, async () => {
      for (const expectation of expectations) {
        const result = await runWithAgentRequestContextAsync({}, () => runQkrpcForTool(["action", "validate", "--dir", ".quicker/actions/fixture"], { hostBinding: a, ...expectation }));
        assert.equal(result.ok, true, JSON.stringify(result));
      }
      assert.equal(index, 3);
      process.env.QKRPC_TRANSPORT = "cli";
      process.env.QKRPC_BIN = process.execPath;
      for (const expectation of expectations) {
        const result = await runWithAgentRequestContextAsync({}, () => runQkrpcForTool(["action", "validate", "--dir", ".quicker/actions/fixture"], { hostBinding: a, ...expectation }));
        assert.equal(result.ok, true, JSON.stringify(result));
      }
      assert.equal(children.length, 3);
      assert.equal(Object.hasOwn(children[0]!, "QKRPC_EXPECTED_PROJECT_BINDING"), false);
      assert.equal(children[1]!.QKRPC_EXPECTED_PROJECT_BINDING, "null");
      assert.deepEqual(JSON.parse(children[2]!.QKRPC_EXPECTED_PROJECT_BINDING!), record);
      assert.equal(Object.hasOwn(children[0]!, "QKRPC_EXPECTED_PROJECT_DIRECTORY"), false);
      assert.equal(Object.hasOwn(children[1]!, "QKRPC_EXPECTED_PROJECT_DIRECTORY"), false);
      assert.equal(children[2]!.QKRPC_EXPECTED_PROJECT_DIRECTORY, expectations[2]!.projectDirectory);
      assert.ok(children.every((env) => JSON.parse(env.QKRPC_HOST_BINDING!).hostSessionId === a.hostSessionId));
    });
  } finally {
    spawn.mock.restore(); syncBuiltinESMExports();
    if (originalExpected === undefined) delete process.env.QKRPC_EXPECTED_PROJECT_BINDING; else process.env.QKRPC_EXPECTED_PROJECT_BINDING = originalExpected;
    if (originalDirectory === undefined) delete process.env.QKRPC_EXPECTED_PROJECT_DIRECTORY; else process.env.QKRPC_EXPECTED_PROJECT_DIRECTORY = originalDirectory;
  }
});

test("Agent set_metadata schema and strict Execute preserve a raw numeric host version through bound HTTP CAS", async () => {
  const { QKRPC_ACTION_SET_METADATA_TOOL_DEF, QKRPC_ACTION_TOOL_DEF } = await import("./qkrpc-action-tool.server");
  const { normalizeQkrpcActionInput } = await import("./qkrpc-action-tool");
  const actionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const input = { id: actionId, title: "Local", expectedEditVersion: "9007199254740993" };
  assert.deepEqual(normalizeQkrpcActionInput(input), input);
  let dispatched = 0;
  await isolated(async (url, init) => {
    assert.equal(String(url), `${base}/v1/invoke`);
    const req = JSON.parse(String(init?.body)) as { op: string; args: Record<string, unknown>; hostBinding?: QkrpcHostBinding };
    assert.equal(req.op, "action.set-metadata");
    assert.equal(req.hostBinding?.hostSessionId, a.hostSessionId);
    assert.equal(req.args.expectedEditVersion, input.expectedEditVersion);
    dispatched++;
    return new Response('{"ok":true,"data":{"success":true,"editVersion":9223372036854775807}}');
  }, () => runWithAgentRequestContextAsync({}, async () => {
    process.env.QKRPC_HOST_BINDING = JSON.stringify(a);
    const dedicatedSchema = QKRPC_ACTION_SET_METADATA_TOOL_DEF.inputSchema as { parse(value: unknown): unknown };
    const parsed = dedicatedSchema.parse(input) as typeof input;
    const dedicated = await QKRPC_ACTION_SET_METADATA_TOOL_DEF.execute!(parsed, { toolCallId: "fixture-set-metadata", messages: [] });
    assert.equal(dedicated.ok, true, JSON.stringify(dedicated));
    assert.match(JSON.stringify(dedicated), /"editVersion":"9223372036854775807"/);
    const flat = await QKRPC_ACTION_TOOL_DEF.execute!({ action: "set_metadata", ...input }, { toolCallId: "fixture-flat-metadata", messages: [] });
    assert.equal(flat.ok, true, JSON.stringify(flat));
    assert.equal(dispatched, 2);
    assert.equal(currentQkrpcTarget()?.binding.hostSessionId, a.hostSessionId);
  }));
});
