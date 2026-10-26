import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inspectQuickerNativeMcpSource, resolveQuickerNativeMcpSource, NativeQuickerMcpError, nativeSourceAttributesAreSafe, type NativeQuickerSourceDependencies } from "./native-quicker-source.server";
import { probeQuickerNativeMcp } from "./native-quicker-probe.server";
import { connectAgentMcpServer, loadConfiguredMcpTools } from "./load.server";
import { QUICKER_NATIVE_MCP_SERVER_NAME } from "./config";

const SECRET = "private-fixture-token-do-not-export";
const good = { Enabled: true, Port: 22567, Token: SECRET, AllowWrites: true };
function fixture(value: unknown = good) {
  let raw = Buffer.from(JSON.stringify(value)), identity = "fixture-file", path = "/owned/.quicker/mcp/server.json";
  let owner = { pid: 1234, createdAt: "fixture-start-time" };
  let reads = 0;
  const deps: NativeQuickerSourceDependencies = { settingsPath: () => path, readSourceFile: async (_path, signal) => {
    signal?.throwIfAborted(); reads++; return { raw, fileIdentity: identity };
  }, endpointOwner: async () => ({ ...owner }) };
  return { deps, reads: () => reads, update: (value: unknown) => { raw = Buffer.from(JSON.stringify(value)); }, raw: (value: string) => { raw = Buffer.from(value); }, replace: () => { identity += "-new"; }, move: () => { path = "/owned/other/mcp/server.json"; }, restart: () => { owner = { ...owner, createdAt: owner.createdAt + "-new" }; } };
}

function nativeConfig() { return { name: QUICKER_NATIVE_MCP_SERVER_NAME, source: "quicker-native" as const, enabled: true,
  transport: "http" as const, requireApproval: false, configPath: "/owned/mcp.json", baseDir: "/owned" }; }

function protocolFetch(options: { status?: number; onRequest?: (method: string) => void; instructions?: string; serverName?: string; toolName?: string; toolOutput?: string; toolFailure?: "500" | "malformed"; onList?: () => void } = {}) {
  const requests: string[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    assert.equal(String(input), `http://127.0.0.1:${good.Port}/mcp`);
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${SECRET}`);
    if (options.status) return new Response(SECRET, { status: options.status });
    if (init?.method === "DELETE") { requests.push("DELETE"); return new Response(null, { status: 204 }); }
    if (init?.method === "GET") { requests.push("GET"); return new Response(null, { status: 405 }); }
    const rpc = JSON.parse(String(init?.body));
    requests.push(rpc.method); options.onRequest?.(rpc.method);
    if (!Object.hasOwn(rpc, "id")) return new Response(null, { status: 202 });
    let result: unknown;
    if (rpc.method === "initialize") result = { protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: options.serverName ?? "quicker", version: "future-not-a-table" }, instructions: options.instructions ?? "Use explicit slots and the current native VFS." };
    else if (rpc.method === "tools/list") {
      options.onList?.();
      result = rpc.params?.cursor ? { tools: [{ name: "write_file", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: false } }] }
        : { tools: [{ name: options.toolName ?? "read_file", inputSchema: { type: "object", properties: { path: { type: "string" } } }, annotations: { readOnlyHint: true } }], nextCursor: "second" };
    } else if (rpc.method === "tools/call") {
      if (options.toolFailure) return new Response(options.toolFailure === "500" ? SECRET : "{malformed", { status: options.toolFailure === "500" ? 500 : 200, headers: { "Content-Type": "application/json" } });
      result = { content: [{ type: "text", text: options.toolOutput ?? "current virtual file" }] };
    }
    else assert.fail(`Unexpected MCP operation ${rpc.method}`);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }), { headers: { "Content-Type": "application/json" } });
  };
  return { fetch, requests };
}

test("inspect returns opaque current file identity and no port or credential", async () => {
  const f = fixture();
  const first = await inspectQuickerNativeMcpSource(undefined, f.deps);
  assert.equal(first.status, "found"); assert.match(first.identity!, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(first).includes(SECRET), false); assert.equal(Object.hasOwn(first, "port"), false);
  assert.equal((await inspectQuickerNativeMcpSource(undefined, f.deps)).identity, first.identity);
  f.update({ ...good, Token: "changed" }); assert.notEqual((await inspectQuickerNativeMcpSource(undefined, f.deps)).identity, first.identity);
  f.update(good); f.replace(); assert.notEqual((await inspectQuickerNativeMcpSource(undefined, f.deps)).identity, first.identity);
  f.move(); assert.notEqual((await inspectQuickerNativeMcpSource(undefined, f.deps)).identity, first.identity);
});

test("settings missing, malformed, disabled and invalid never fetch or infer default port", async () => {
  for (const [value, status] of [[{ Enabled: false }, "disabled"], [{ ...good, Port: undefined }, "invalid"], [{ ...good, Port: 80 }, "invalid"], [{ ...good, Token: "" }, "invalid"], [{ ...good, Enabled: "true" }, "invalid"], [{ ...good, token: "ambiguous" }, "invalid"]] as const) {
    const f = fixture(value); assert.equal((await inspectQuickerNativeMcpSource(undefined, f.deps)).status, status);
    await assert.rejects(resolveQuickerNativeMcpSource(undefined, f.deps), { code: "unavailable" });
  }
  const f = fixture(); f.raw(`{ invalid ${SECRET}`);
  const invalid = await inspectQuickerNativeMcpSource(undefined, f.deps);
  assert.equal(invalid.status, "invalid"); assert.equal(JSON.stringify(invalid).includes(SECRET), false);
  assert.equal((await inspectQuickerNativeMcpSource(undefined, { ...f.deps, readSourceFile: async () => { throw Object.assign(new Error(SECRET), { code: "ENOENT" }); } })).status, "missing");
});

test("each request revalidates identity, and a changed source cannot revive or replay", async () => {
  for (const change of ["token", "port", "disabled", "file", "root"] as const) {
    const f = fixture(), wire = protocolFetch();
    const source = await resolveQuickerNativeMcpSource(undefined, { ...f.deps, fetch: wire.fetch });
    const request = () => source.fetch(source.url, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }) });
    await request();
    if (change === "token") f.update({ ...good, Token: "new-token" });
    if (change === "port") f.update({ ...good, Port: 22568 });
    if (change === "disabled") f.update({ ...good, Enabled: false });
    if (change === "file") f.replace();
    if (change === "root") f.move();
    await assert.rejects(request(), { code: "source_changed" });
    f.update(good); await assert.rejects(request(), { code: "source_changed" });
    assert.deepEqual(wire.requests, ["initialize"]);
  }
});

test("native rejects alternate authorities and runtime environment proxy without sending", async () => {
  const f = fixture(); let requests = 0;
  const source = await resolveQuickerNativeMcpSource(undefined, { ...f.deps, fetch: async () => { requests++; return new Response(); } });
  await assert.rejects(source.fetch("https://example.test/mcp"), NativeQuickerMcpError);
  const previous = process.env.NODE_USE_ENV_PROXY; process.env.NODE_USE_ENV_PROXY = "1";
  try { await assert.rejects(source.fetch(source.url), { code: "unavailable" }); }
  finally { if (previous === undefined) delete process.env.NODE_USE_ENV_PROXY; else process.env.NODE_USE_ENV_PROXY = previous; }
  assert.equal(requests, 0);
});

test("listener incarnation is required and pinned even when port and token remain unchanged", async () => {
  const f = fixture(); let requests = 0;
  await assert.rejects(resolveQuickerNativeMcpSource(undefined, { ...f.deps, endpointOwner: async () => { throw new Error("unobservable"); } }), { code: "unavailable" });
  await assert.rejects(resolveQuickerNativeMcpSource(undefined, { ...f.deps, endpointOwner: async () => ({ pid: 0, createdAt: "" }) }), { code: "unavailable" });
  const source = await resolveQuickerNativeMcpSource(undefined, { ...f.deps, fetch: async () => { requests++; return new Response("ok"); } });
  await source.fetch(source.url);
  f.restart();
  await assert.rejects(source.fetch(source.url), { code: "source_changed", outcomeUnknown: false });
  await assert.rejects(source.fetch(source.url), { code: "source_changed" });
  assert.equal(requests, 1);
});

test("listener change after a dispatched request returns unknown outcome and never replays", async () => {
  const f = fixture(); let requests = 0;
  const source = await resolveQuickerNativeMcpSource(undefined, { ...f.deps, fetch: async () => { requests++; f.restart(); return new Response("accepted"); } });
  await assert.rejects(source.fetch(source.url, { method: "POST", body: "write" }), { code: "source_changed", outcomeUnknown: true });
  await assert.rejects(source.fetch(source.url), { code: "source_changed" });
  assert.equal(requests, 1);
});

test("a concurrent pre-dispatch retirement cannot downgrade an already-dispatched request", async () => {
  const f = fixture(); let requests = 0;
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const pendingResponse = new Promise<void>((resolve) => { release = resolve; });
  const source = await resolveQuickerNativeMcpSource(undefined, { ...f.deps, fetch: async () => {
    requests++; entered(); await pendingResponse; return new Response("accepted");
  } });
  const first = source.fetch(source.url, { method: "POST", body: "write" });
  const rejected = assert.rejects(first, { code: "source_changed", outcomeUnknown: true });
  await started; f.restart();
  await assert.rejects(source.fetch(source.url), { code: "source_changed", outcomeUnknown: false });
  release(); await rejected;
  assert.equal(requests, 1);
});

test("explicit probe uses real SDK initialize and complete catalog, never business tools", async () => {
  const f = fixture(), wire = protocolFetch();
  const probe = await probeQuickerNativeMcp(undefined, { ...f.deps, fetch: wire.fetch });
  assert.equal(probe.status, "ok"); assert.equal(probe.toolCount, 2); assert.equal(probe.serverInfo?.version, "future-not-a-table");
  assert.deepEqual(wire.requests.filter((method) => method !== "GET"), ["initialize", "notifications/initialized", "tools/list", "tools/list"]);
  // The installed SDK probes optional SSE both at start and after the 202 notification.
  assert.ok(wire.requests.filter((method) => method === "GET").length <= 2);
  assert.equal(JSON.stringify(probe).includes(SECRET), false);
});

test("real SDK loader preserves Ask filtering, current schemas and namespaced tool execution", async () => {
  const f = fixture(), wire = protocolFetch();
  const deps = { loadConfig: async () => ({ servers: [nativeConfig()], diagnostics: [] }),
    connectServer: (server: Parameters<typeof connectAgentMcpServer>[0], cwd: string, owner: Parameters<typeof connectAgentMcpServer>[2]) => connectAgentMcpServer(server, cwd, owner, { ...f.deps, fetch: wire.fetch }) };
  const loaded = await loadConfiguredMcpTools("/workspace", { chatMode: "ask" }, deps);
  try {
    assert.deepEqual(Object.keys(loaded.tools), ["mcp__quicker-local__read_file"]);
    assert.equal(JSON.stringify(loaded.catalogs).includes(SECRET), false);
    const result = await loaded.tools["mcp__quicker-local__read_file"].execute!({ path: "/slot/source.yaml" }, { toolCallId: "fixture", messages: [] });
    assert.ok(JSON.stringify(result).includes("current virtual file"));
    f.update({ ...good, Token: "rotated" });
    await assert.rejects(Promise.resolve(loaded.tools["mcp__quicker-local__read_file"].execute!({ path: "/slot/source.yaml" }, { toolCallId: "next", messages: [] })), (error: unknown) => !String(error).includes(SECRET));
    assert.equal(wire.requests.filter((m) => m === "tools/call").length, 1);
  } finally { await loaded.dispose(); }
});

test("probe classifies HTTP failures and never echoes server credentials", async () => {
  for (const [status, expected] of [[401, "unauthorized"], [403, "consent-required"], [307, "error"], [500, "error"]] as const) {
    const f = fixture(), wire = protocolFetch({ status });
    const result = await probeQuickerNativeMcp(undefined, { ...f.deps, fetch: wire.fetch });
    assert.equal(result.status, expected); assert.equal(JSON.stringify(result).includes(SECRET), false);
  }
});

test("successful remote metadata cannot echo known credentials or unbounded identity into probe or catalog", async () => {
  for (const data of [{ serverName: SECRET }, { instructions: SECRET }, { toolName: SECRET }, { serverName: "x".repeat(257) }]) {
    const f = fixture(), wire = protocolFetch(data);
    const result = await probeQuickerNativeMcp(undefined, { ...f.deps, fetch: wire.fetch });
    assert.equal(result.status, "error"); assert.equal(result.serverInfo, undefined);
    assert.equal(JSON.stringify(result).includes(SECRET), false);
  }
});

test("real SDK tool results cannot export a credential echoed in successful content", async () => {
  const f = fixture(), wire = protocolFetch({ toolOutput: SECRET });
  const loaded = await loadConfiguredMcpTools("/workspace", { chatMode: "agent" }, {
    loadConfig: async () => ({ servers: [nativeConfig()], diagnostics: [] }),
    connectServer: (server, cwd, owner) => connectAgentMcpServer(server, cwd, owner, { ...f.deps, fetch: wire.fetch }),
  });
  try {
    await assert.rejects(Promise.resolve(loaded.tools["mcp__quicker-local__read_file"].execute!({}, { toolCallId: "fixture", messages: [] })), (error: unknown) => !String(error).includes(SECRET));
    assert.equal(wire.requests.filter((method) => method === "tools/call").length, 1);
  } finally { await loaded.dispose(); }
});

test("SDK failures after tool dispatch report unknown outcomes without replaying", async () => {
  for (const toolFailure of ["500", "malformed"] as const) {
    const f = fixture(), wire = protocolFetch({ toolFailure });
    const loaded = await loadConfiguredMcpTools("/workspace", { chatMode: "agent" }, {
      loadConfig: async () => ({ servers: [nativeConfig()], diagnostics: [] }),
      connectServer: (server, cwd, owner) => connectAgentMcpServer(server, cwd, owner, { ...f.deps, fetch: wire.fetch }),
    });
    try {
      await assert.rejects(Promise.resolve(loaded.tools["mcp__quicker-local__read_file"].execute!({}, { toolCallId: "fixture", messages: [] })), (error: unknown) => error instanceof NativeQuickerMcpError && error.outcomeUnknown && !error.message.includes(SECRET));
      assert.equal(wire.requests.filter((method) => method === "tools/call").length, 1);
    } finally { await loaded.dispose(); }
  }
});

test("source changed between catalog pages discards the entire probe", async () => {
  const f = fixture(); let lists = 0;
  const wire = protocolFetch({ onList: () => { if (++lists === 1) f.update({ ...good, Port: 22568 }); } });
  const result = await probeQuickerNativeMcp(undefined, { ...f.deps, fetch: wire.fetch });
  assert.equal(result.status, "source_changed"); assert.equal(result.toolCount, undefined);
  assert.equal(lists, 1);
});

test("pre-cancel and disabled configuration do not read native files or connect", async () => {
  const f = fixture(), controller = new AbortController(); controller.abort();
  await assert.rejects(inspectQuickerNativeMcpSource(controller.signal, f.deps), { name: "AbortError" });
  await assert.rejects(probeQuickerNativeMcp(controller.signal, f.deps), { name: "AbortError" });
  assert.equal(f.reads(), 0);
  const loaded = await loadConfiguredMcpTools("/workspace", { chatMode: "agent" }, { loadConfig: async () => ({ servers: [{ ...nativeConfig(), enabled: false }], diagnostics: [] }), connectServer: async () => assert.fail("disabled native source must not connect") });
  assert.deepEqual(loaded.tools, {}); await loaded.dispose();
});

test("cancelled pending native SDK handshake cannot publish a late connection", async () => {
  const f = fixture(), wire = protocolFetch(), controller = new AbortController();
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const pending = probeQuickerNativeMcp(controller.signal, { ...f.deps, fetch: async (input, init) => {
    entered(); await wait; return wire.fetch(input, init);
  } });
  const rejected = assert.rejects(pending, { name: "AbortError" });
  await started; controller.abort(); await rejected;
  release(); await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(wire.requests.filter((method) => method !== "GET"), ["initialize"]);
});

test("Windows metadata guard refuses cloud placeholders, recall flags and reparse points", () => {
  assert.equal(nativeSourceAttributesAreSafe([16, 32], 2), true);
  for (const flag of [0x400, 0x1000, 0x40000, 0x400000]) assert.equal(nativeSourceAttributesAreSafe([16, flag | 32], 2), false);
  assert.equal(nativeSourceAttributesAreSafe([], 1), false);
  assert.equal(nativeSourceAttributesAreSafe([NaN], 1), false);
});

test("UTF8 BOM is accepted but remains part of the source identity", async () => {
  const f = fixture(), before = await inspectQuickerNativeMcpSource(undefined, f.deps);
  f.raw("\uFEFF" + JSON.stringify(good));
  const after = await inspectQuickerNativeMcpSource(undefined, f.deps);
  assert.equal(after.status, "found"); assert.notEqual(before.identity, after.identity);
});

test("production file reader reads an owned file and rejects cloud-named and linked roots", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "qkrpc-native-source-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "server.json"); await writeFile(path, JSON.stringify(good));
  assert.equal((await inspectQuickerNativeMcpSource(undefined, { settingsPath: () => path })).status, "found");
  const cloud = join(root, "OneDrive-fixture"); await mkdir(cloud); await writeFile(join(cloud, "server.json"), JSON.stringify(good));
  assert.equal((await inspectQuickerNativeMcpSource(undefined, { settingsPath: () => join(cloud, "server.json") })).status, "unavailable");
  const target = join(root, "target"); await mkdir(target); await writeFile(join(target, "server.json"), JSON.stringify(good));
  const link = join(root, "link"); await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
  assert.equal((await inspectQuickerNativeMcpSource(undefined, { settingsPath: () => join(link, "server.json") })).status, "unavailable");
});
