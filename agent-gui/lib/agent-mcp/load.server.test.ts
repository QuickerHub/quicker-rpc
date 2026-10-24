import assert from "node:assert/strict";
import test from "node:test";
import type { ListToolsResult, MCPClient } from "@ai-sdk/mcp";
import { jsonSchema, type ToolSet } from "ai";
import { loadConfiguredMcpTools } from "./load.server";
import { readMcpToolCatalog, type McpToolDescriptor } from "./catalog";
import type { AgentMcpServerConfig } from "./config";

const tool = (name: string, readOnlyHint?: boolean): McpToolDescriptor => ({ name, inputSchema: { type: "object", properties: {} },
  ...(readOnlyHint === undefined ? {} : { annotations: { readOnlyHint } }) });
const config = (name: string): AgentMcpServerConfig => ({ name, enabled: true, transport: "stdio", command: "never-executed",
  requireApproval: true, configPath: "/generated/mcp.json", baseDir: "/generated" });
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
function fakeClient(list: (options: Parameters<MCPClient["listTools"]>[0]) => Promise<ListToolsResult>, version: string | undefined = "fixture-version") {
  const state = { closed: 0, definitions: [] as McpToolDescriptor[] };
  const client = {
    serverInfo: { name: "actual-server", version }, listTools: list,
    close: async () => { state.closed += 1; },
    toolsFromDefinitions(definitions: ListToolsResult): ToolSet {
      state.definitions = definitions.tools;
      return Object.fromEntries(definitions.tools.map((definition) => [definition.name,
        { inputSchema: jsonSchema(definition.inputSchema), execute: async () => { assert.fail("Loader tests never execute remote tools"); } }]));
    },
  } as unknown as MCPClient;
  return { client, state };
}
function dependencies(servers: AgentMcpServerConfig[], clients: Record<string, MCPClient>) {
  return { loadConfig: async () => ({ servers, diagnostics: [] }), connectServer: async (server: AgentMcpServerConfig) => clients[server.name] };
}

test("loader publishes all pages with metadata while Ask, approval and allowlist gates remain effective", async () => {
  let calls = 0;
  const f = fakeClient(async (options) => ++calls === 1
    ? { tools: [tool("read", true), tool("unknown")], nextCursor: "next" }
    : (assert.equal(options?.params?.cursor, "next"), { tools: [tool("write", false), tool("excluded", true),
      { ...tool("danger", true), annotations: { readOnlyHint: true, destructiveHint: true } }] }));
  const server = { ...config("fixture"), tools: ["read", "write", "unknown", "danger"], maxCallsPerTurn: 3 };
  const loaded = await loadConfiguredMcpTools("/workspace", { chatMode: "ask" }, dependencies([server], { fixture: f.client }));
  assert.deepEqual(Object.keys(loaded.tools), ["mcp__fixture__read"]);
  assert.equal(loaded.tools.mcp__fixture__read.needsApproval, true);
  assert.equal(loaded.callPolicyOverrides.mcp__fixture__read.maxCallsPerTurn, 3);
  assert.equal(loaded.catalogs[0].pageCount, 2);
  assert.deepEqual(loaded.catalogs[0].tools.map((row) => row.name), ["read"]);
  assert.equal(loaded.catalogs[0].tools[0].annotations?.readOnlyHint, true);
  assert.deepEqual(loaded.catalogs[0].source, { serverName: "fixture", configPath: "/generated/mcp.json", transport: "stdio", workspaceCwd: "/workspace" });
  assert.deepEqual(loaded.catalogs[0].serverInfo, { name: "actual-server", version: "fixture-version" });
  assert.equal(Object.hasOwn(loaded.catalogs[0].tools[0], "execute"), false);
  assert.equal(f.state.closed, 0);
  await loaded.dispose(); await loaded.dispose(); assert.equal(f.state.closed, 1);
});

test("a server's later page failure closes it and never publishes partial tools or metadata", async () => {
  let calls = 0;
  const bad = fakeClient(async () => { if (++calls === 1) return { tools: [tool("partial")], nextCursor: "next" }; throw new Error("page failed"); });
  const good = fakeClient(async () => ({ tools: [tool("healthy")] }));
  const loaded = await loadConfiguredMcpTools("/workspace", { chatMode: "agent" }, dependencies([config("bad"), config("good")], { bad: bad.client, good: good.client }));
  assert.deepEqual(Object.keys(loaded.tools), ["mcp__good__healthy"]);
  assert.deepEqual(loaded.catalogs.map((row) => row.source.serverName), ["good"]);
  assert.equal(loaded.diagnostics.length, 1); assert.match(loaded.diagnostics[0].message, /page failed/);
  assert.equal(bad.state.closed, 1); assert.equal(good.state.closed, 0);
  await loaded.dispose(); assert.equal(bad.state.closed, 1); assert.equal(good.state.closed, 1);
});

test("cross-server normalized collisions discard only the later server as a whole", async () => {
  const first = fakeClient(async () => ({ tools: [tool("read")] }));
  const second = fakeClient(async () => ({ tools: [tool("partial"), tool("read")] }));
  const loaded = await loadConfiguredMcpTools("/workspace", { chatMode: "agent" }, dependencies([config("same.one"), config("same one")], { "same.one": first.client, "same one": second.client }));
  assert.deepEqual(Object.keys(loaded.tools), ["mcp__same_one__read"]);
  assert.equal(loaded.catalogs.length, 1); assert.equal(loaded.diagnostics.length, 1);
  assert.equal(second.state.closed, 1); await loaded.dispose();
});

test("same-server later turns read changed schemas even when the reported version is unchanged", async () => {
  let generation = 0;
  const deps = { loadConfig: async () => ({ servers: [config("same")], diagnostics: [] }), connectServer: async () => {
    const value = ++generation;
    return fakeClient(async () => ({ tools: [{ ...tool("read"), description: `generation-${value}` }] }), "same-reported-version").client;
  } };
  const first = await loadConfiguredMcpTools("/workspace", { chatMode: "agent" }, deps); await first.dispose();
  const second = await loadConfiguredMcpTools("/workspace", { chatMode: "agent" }, deps); await second.dispose();
  assert.equal(generation, 2); assert.equal(first.catalogs[0].tools[0].description, "generation-1");
  assert.equal(second.catalogs[0].tools[0].description, "generation-2");
  assert.equal(first.catalogs[0].serverInfo.version, "same-reported-version");
  assert.equal(second.catalogs[0].serverInfo.version, "same-reported-version");
});

test("metadata omits configured credentials and unknown reported versions stay null", async () => {
  const server = { ...config("private"), transport: "http" as const, url: "https://user:fixture-password@example.test/private?token=fixture-token",
    headers: { Authorization: "fixture-header" }, env: { PRIVATE: "fixture-env" }, args: ["fixture-argument"] };
  const f = fakeClient(async () => ({ tools: [tool("read")] }));
  Object.assign(f.client, { serverInfo: { name: "actual-without-version" } });
  const loaded = await loadConfiguredMcpTools("/workspace", { chatMode: "agent" }, dependencies([server], { private: f.client }));
  assert.equal(loaded.catalogs[0].serverInfo.version, null);
  assert.equal(/fixture-password|fixture-token|fixture-header|fixture-env|fixture-argument|never-executed/.test(JSON.stringify(loaded.catalogs)), false);
  await loaded.dispose();
});

test("listing timeout closes only the timed-out server and subsequent servers still load", async () => {
  const bad = fakeClient(() => new Promise(() => {})), good = fakeClient(async () => ({ tools: [tool("good")] }));
  const loaded = await loadConfiguredMcpTools("/workspace", { chatMode: "agent" }, { ...dependencies([config("bad"), config("good")], { bad: bad.client, good: good.client }),
    readCatalog: (client, source, options) => readMcpToolCatalog(client, source, { ...options, limits: { timeoutMs: 5 } }) });
  assert.deepEqual(Object.keys(loaded.tools), ["mcp__good__good"]); assert.match(loaded.diagnostics[0].message, /timed out/);
  assert.equal(bad.state.closed, 1); assert.equal(good.state.closed, 0); await loaded.dispose();
});

test("cancelled late pages are cleaned up and cannot affect the next turn", async () => {
  let late!: (value: ListToolsResult) => void;
  const old = fakeClient(() => new Promise((resolve) => { late = resolve; }));
  const controller = new AbortController();
  const pending = loadConfiguredMcpTools("/workspace", { chatMode: "agent", abortSignal: controller.signal }, dependencies([config("same")], { same: old.client }));
  const rejected = assert.rejects(pending, { name: "AbortError" });
  await turn(); controller.abort(); await rejected; assert.equal(old.state.closed, 1);
  const current = fakeClient(async () => ({ tools: [tool("current")] }));
  const next = await loadConfiguredMcpTools("/workspace", { chatMode: "agent" }, dependencies([config("same")], { same: current.client }));
  late({ tools: [tool("obsolete")] }); await turn();
  assert.deepEqual(Object.keys(next.tools), ["mcp__same__current"]); assert.equal(old.state.definitions.length, 0);
  await next.dispose(); assert.equal(current.state.closed, 1);
});

test("pre-cancelled loaders never read configuration or connect", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadConfiguredMcpTools("/workspace", { chatMode: "agent", abortSignal: controller.signal }, {
    loadConfig: async () => { assert.fail("No configuration read after pre-cancel"); },
    connectServer: async () => { assert.fail("No connection after pre-cancel"); },
  }), { name: "AbortError" });
});

test("cancellation during SDK mapping cannot publish retired tools", async () => {
  const controller = new AbortController();
  const f = fakeClient(async () => ({ tools: [tool("retired")] }));
  const map = f.client.toolsFromDefinitions.bind(f.client);
  f.client.toolsFromDefinitions = ((definitions: ListToolsResult) => {
    const result = map(definitions); controller.abort(); return result;
  }) as MCPClient["toolsFromDefinitions"];
  await assert.rejects(loadConfiguredMcpTools("/workspace", { chatMode: "agent", abortSignal: controller.signal },
    dependencies([config("same")], { same: f.client })), { name: "AbortError" });
  assert.equal(f.state.closed, 1);
});

for (const variant of ["missing", "extra", "same-count replacement", "prototype name"] as const) {
  test(`SDK mapped names must exactly match permitted definitions (${variant})`, async (t) => {
    const bad = fakeClient(async () => ({ tools: [tool("read"), tool(variant === "prototype name" ? "__proto__" : "second")] }));
    const map = bad.client.toolsFromDefinitions.bind(bad.client);
    bad.client.toolsFromDefinitions = ((definitions: ListToolsResult) => {
      const mapped = map(definitions);
      if (variant === "prototype name") {
        // Match the installed SDK's ordinary-object assignment, without replacing the SDK in production.
        const ordinary: ToolSet = {};
        for (const [name, definition] of Object.entries(mapped)) ordinary[name] = definition;
        return ordinary;
      }
      if (variant !== "extra") delete mapped.second;
      if (variant !== "missing") mapped.unlisted = mapped.read;
      return mapped;
    }) as MCPClient["toolsFromDefinitions"];
    const good = fakeClient(async () => ({ tools: [tool("healthy")] }));
    const loaded = await loadConfiguredMcpTools("/workspace", { chatMode: "agent" },
      dependencies([config("bad"), config("good")], { bad: bad.client, good: good.client }));
    t.after(() => loaded.dispose());
    assert.deepEqual(Object.keys(loaded.tools), ["mcp__good__healthy"], "No partial or unlisted SDK tool is published");
    assert.deepEqual(loaded.catalogs.map((row) => row.source.serverName), ["good"]);
    assert.equal(loaded.diagnostics.length, 1);
    assert.match(loaded.diagnostics[0].message, /SDK.*tool.*names/i);
    assert.equal(bad.state.closed, 1); assert.equal(good.state.closed, 0);
  });
}

test("SDK mapped-name mismatches never replace synchronous cancellation", async () => {
  const controller = new AbortController(), reason = new Error("Mapping cancellation wins");
  const bad = fakeClient(async () => ({ tools: [tool("read")] }));
  bad.client.toolsFromDefinitions = (() => { controller.abort(reason); return {}; }) as MCPClient["toolsFromDefinitions"];
  await assert.rejects(loadConfiguredMcpTools("/workspace", { chatMode: "agent", abortSignal: controller.signal },
    dependencies([config("bad")], { bad: bad.client })), (error) => error === reason);
  assert.equal(bad.state.closed, 1);
});
