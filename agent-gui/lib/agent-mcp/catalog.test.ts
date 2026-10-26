import assert from "node:assert/strict";
import test from "node:test";
import type { ListToolsResult } from "@ai-sdk/mcp";
import { MCP_CATALOG_LIMITS, readMcpToolCatalog, type McpCatalogClient, type McpToolDescriptor } from "./catalog";

const source = { serverName: "configured", configPath: "/fixture/.quicker/mcp.json", transport: "stdio" as const, workspaceCwd: "/fixture" };
const tool = (name: string, extra: Partial<McpToolDescriptor> = {}): McpToolDescriptor => ({ name, inputSchema: { type: "object", properties: {} }, ...extra });
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
function pages(results: ListToolsResult[]) {
  const calls: Array<string | undefined> = [];
  const client: McpCatalogClient = { serverInfo: { name: "actual", version: "reported-version" }, async listTools(options) {
    calls.push(options.params?.cursor);
    assert.ok(options.options.signal instanceof AbortSignal);
    assert.ok(calls.length <= results.length, "No unexpected page request");
    return results[calls.length - 1];
  } };
  return { client, calls };
}

test("catalog bounds are explicit and one whole-listing deadline is used", () => {
  assert.deepEqual(MCP_CATALOG_LIMITS, { maxPages: 64, maxTools: 2048, maxBytes: 4 * 1024 * 1024, timeoutMs: 15_000, maxInstructionChars: 8192 });
});

test("all cursor pages retain raw descriptors and actual server provenance as plain data", async () => {
  const first = tool("read", { title: "Read", description: "description", annotations: { readOnlyHint: true },
    outputSchema: { type: "object", properties: { result: { type: "string" } } }, _meta: { fixture: "metadata" } });
  Object.assign(first, { execute() { assert.fail("Catalogs never execute tools"); } });
  const f = pages([{ tools: [first], nextCursor: "page-2" }, { tools: [tool("write")] }]);
  const result = await readMcpToolCatalog(f.client, source);
  assert.deepEqual(f.calls, [undefined, "page-2"]);
  assert.deepEqual(result.source, source);
  assert.deepEqual(result.serverInfo, { name: "actual", version: "reported-version" });
  assert.equal(result.pageCount, 2);
  assert.deepEqual(result.tools.map((row) => row.name), ["read", "write"]);
  assert.deepEqual(result.tools[0].annotations, first.annotations);
  assert.deepEqual(result.tools[0].outputSchema, first.outputSchema);
  assert.deepEqual(result.tools[0]._meta, first._meta);
  assert.equal(Object.hasOwn(result.tools[0], "execute"), false);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  first.annotations!.readOnlyHint = false;
  assert.equal(result.tools[0].annotations!.readOnlyHint, true, "The snapshot cannot be mutated through its input");
});

for (const info of [undefined, {}, { name: "actual" }, { name: "actual", version: "" }]) {
  test(`unknown server version stays null (${JSON.stringify(info)})`, async () => {
    const f = pages([{ tools: [] }]);
    Object.assign(f.client, { serverInfo: info });
    const result = await readMcpToolCatalog(f.client, source);
    assert.equal(result.serverInfo.version, null);
    assert.notEqual(result.serverInfo.name, source.serverName, "Configured name is not a reported server name");
  });
}

test("an empty opaque cursor is forwarded rather than mistaken for the last page", async () => {
  const f = pages([{ tools: [], nextCursor: "" }, { tools: [tool("last")] }]);
  assert.equal((await readMcpToolCatalog(f.client, source)).tools.length, 1);
  assert.deepEqual(f.calls, [undefined, ""]);
});

test("cursor whitespace and case are opaque and are never normalized", async () => {
  const f = pages([{ tools: [], nextCursor: " Page " }, { tools: [], nextCursor: " page " }, { tools: [] }]);
  await readMcpToolCatalog(f.client, source);
  assert.deepEqual(f.calls, [undefined, " Page ", " page "]);
});

for (const [name, results, reason] of [
  ["duplicate name", [{ tools: [tool("one")], nextCursor: "next" }, { tools: [tool("one")] }], /Duplicate MCP tool name/],
  ["normalized ID collision", [{ tools: [tool("one.two"), tool("one two")] }], /collision after normalization/],
  ["repeated cursor", [{ tools: [], nextCursor: "same" }, { tools: [], nextCursor: "same" }], /cursor repeated/],
  ["cursor cycle", [{ tools: [], nextCursor: "a" }, { tools: [], nextCursor: "b" }, { tools: [], nextCursor: "a" }], /cursor repeated/],
] as const) {
  test(`catalog rejects ${name} without returning a partial result`, async () => {
    const f = pages([...results] as ListToolsResult[]);
    await assert.rejects(readMcpToolCatalog(f.client, source), reason);
    assert.equal(f.calls.length, results.length);
  });
}

for (const [name, results, limits, reason] of [
  ["page", [{ tools: [], nextCursor: "next" }], { maxPages: 1 }, /exceeds 1 pages/],
  ["tool", [{ tools: [tool("one"), tool("two")] }], { maxTools: 1 }, /exceeds 1 tools/],
  ["byte", [{ tools: [tool("one", { description: "large descriptor" })] }], { maxBytes: 8 }, /exceeds 8 bytes/],
] as const) {
  test(`catalog enforces the ${name} budget`, async () => {
    const f = pages([...results] as ListToolsResult[]);
    await assert.rejects(readMcpToolCatalog(f.client, source, { limits }), reason);
  });
}

test("a later page error propagates without an earlier partial catalog", async () => {
  let calls = 0;
  const client: McpCatalogClient = { async listTools() {
    if (++calls === 1) return { tools: [tool("partial")], nextCursor: "next" };
    throw new Error("later page failed");
  } };
  await assert.rejects(readMcpToolCatalog(client, source), /later page failed/);
});

for (const [name, page] of [
  ["missing tools", {}],
  ["non-string cursor", { tools: [], nextCursor: 1 }],
  ["empty name", { tools: [tool(" ")] }],
  ["missing input schema", { tools: [{ name: "missing" }] }],
] as const) {
  test(`malformed catalog data fails closed (${name})`, async () => {
    await assert.rejects(readMcpToolCatalog({ listTools: async () => page as unknown as ListToolsResult }, source), /Invalid MCP/);
  });
}

test("a changing server handshake identity invalidates the listing", async () => {
  const f = pages([{ tools: [] }]);
  const list = f.client.listTools;
  f.client.listTools = async (options) => {
    const result = await list(options);
    Object.assign(f.client, { serverInfo: { name: "actual", version: "changed" } });
    return result;
  };
  await assert.rejects(readMcpToolCatalog(f.client, source), /identity changed/);
});

test("instructions are captured exactly from the same client, refreshed even without a version change", async () => {
  const get = async (instructions: unknown) => readMcpToolCatalog({ ...pages([{ tools: [tool("read")] }]).client, instructions }, source);
  const first = await get("  current workflow\n\uD800 ");
  assert.equal(first.guidance?.text, "  current workflow\n\uD800 ");
  assert.equal(first.guidance?.state, "available");
  assert.ok(Number.isFinite(Date.parse(first.guidance!.retrievedAt)));
  const changed = await get("new workflow");
  assert.deepEqual(first.serverInfo, changed.serverInfo);
  assert.notEqual(first.guidance?.revision, changed.guidance?.revision);
  assert.notEqual((await get("\uD800")).guidance?.revision, (await get("\uFFFD")).guidance?.revision);
});

test("absent or invalid guidance is explicit and an oversized body is omitted whole", async () => {
  for (const [instructions, state, reason] of [[undefined, "missing", undefined], [" \n", "missing", undefined],
    [null, "omitted", "invalid"], [42, "omitted", "invalid"], ["a".repeat(8193), "omitted", "too_large"]] as const) {
    const result = await readMcpToolCatalog({ ...pages([{ tools: [] }]).client, instructions }, source);
    assert.equal(result.guidance?.state, state); assert.equal(result.guidance?.reason, reason);
    assert.equal(result.guidance?.text, undefined); assert.equal(result.guidance?.revision, null);
  }
});

test("a changed instruction body on a later page rejects the whole catalog", async () => {
  let instructions = "initial"; let calls = 0;
  const client: McpCatalogClient = { get instructions() { return instructions; }, async listTools() {
    if (++calls === 1) return { tools: [tool("partial")], nextCursor: "next" };
    instructions = "changed"; return { tools: [tool("new")] };
  } };
  await assert.rejects(readMcpToolCatalog(client, source), /instructions changed/);
  assert.equal(calls, 2);
});

test("pre-cancellation makes no client request", async () => {
  const controller = new AbortController(); controller.abort();
  const f = pages([]);
  await assert.rejects(readMcpToolCatalog(f.client, source, { abortSignal: controller.signal }), { name: "AbortError" });
  assert.deepEqual(f.calls, []);
});

test("one listing timeout covers all pages and rejects a client ignoring abort", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let first!: (value: ListToolsResult) => void, late!: (value: ListToolsResult) => void;
  let calls = 0; let listingSignal: AbortSignal | undefined;
  const client: McpCatalogClient = { listTools(options) {
    listingSignal = options.options.signal;
    return new Promise((resolve) => { if (++calls === 1) first = resolve; else late = resolve; });
  } };
  const pending = readMcpToolCatalog(client, source, { limits: { timeoutMs: 50 } });
  const rejected = assert.rejects(pending, /listing timed out after 50ms/);
  t.mock.timers.tick(30); first({ tools: [tool("partial")], nextCursor: "next" });
  await turn(); assert.equal(calls, 2);
  t.mock.timers.tick(20); await rejected;
  assert.equal(listingSignal?.aborted, true);
  late({ tools: [tool("late")] }); await turn();
  assert.equal(calls, 2, "Late pages cannot continue a retired listing");
});

test("abort rejects immediately and late old pages cannot enter the next catalog", async () => {
  const controller = new AbortController(); let late!: (value: ListToolsResult) => void;
  const old = readMcpToolCatalog({ listTools: () => new Promise((resolve) => { late = resolve; }) }, source, { abortSignal: controller.signal });
  const rejected = assert.rejects(old, { name: "AbortError" });
  controller.abort(); await rejected;
  const next = await readMcpToolCatalog(pages([{ tools: [tool("current")] }]).client, source);
  late({ tools: [tool("obsolete")], nextCursor: "must-not-follow" }); await turn();
  assert.deepEqual(next.tools.map((row) => row.name), ["current"]);
});
