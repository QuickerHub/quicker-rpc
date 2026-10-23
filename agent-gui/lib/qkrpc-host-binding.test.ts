import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { syncBuiltinESMExports } from "node:module";
import { mock, test } from "node:test";
import { invokeQkrpcHttp } from "./qkrpc-http";
import { currentQkrpcTarget, readHostBinding, type QkrpcHostBinding } from "./qkrpc-host-binding";
import { runWithAgentRequestContextAsync } from "./qkrpc-request-context";
import { runQkrpcForTool, runQkrpcWithPatchFileForTool } from "./qkrpc";

const base = "http://binding-fixture.invalid:19477";
const a: QkrpcHostBinding = {
  hostInstanceId: "instance-a", hostSessionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "fixture",
  capabilities: { "action.source.read": true, "action.source.write": true },
};
const b: QkrpcHostBinding = { ...a, hostInstanceId: "instance-b", hostSessionId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", hostKind: "v2",
  capabilities: { "action.source.read": false } };

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
      child.stdout.write(JSON.stringify(argv[0] === "host" ? { candidates: [a] } : { ok: true }));
      child.emit("close", 0);
    });
    return child as unknown as ReturnType<typeof childProcess.spawn>;
  });
  syncBuiltinESMExports();
  try {
    await isolated(async () => { throw new Error("CLI must not contact HTTP"); }, () => runWithAgentRequestContextAsync({}, async () => {
      process.env.QKRPC_TRANSPORT = "cli";
      process.env.QKRPC_BIN = process.execPath;
      assert.equal((await runQkrpcForTool(["action", "get", "--id", "fixture"]))?.ok, true);
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
  }, () => runWithAgentRequestContextAsync({}, async () => {
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
  }, () => runWithAgentRequestContextAsync({ abortSignal: cancel.signal }, async () => {
    process.env.QKRPC_HOST_BINDING = JSON.stringify(a);
    await assert.rejects(runActionTraceForAgentTool({ id: "trace-cancel-fixture" }), (error) => error === reason);
  }));
});
