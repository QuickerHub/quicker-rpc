import assert from "node:assert/strict";
import test from "node:test";

import {
  expandMcpEnvironmentValue,
  mcpToolId,
  parseAgentMcpConfigText,
  resolveAgentMcpConfigPaths,
  mergeAgentMcpConfigLayers,
  loadAgentMcpConfigLayers,
  QUICKER_NATIVE_MCP_SERVER_NAME,
  type AgentMcpConfigLayer,
} from "@/lib/agent-mcp/config";
import { mkdtemp, mkdir, writeFile, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("mcpToolId namespaces and normalizes remote tool names", () => {
  assert.equal(mcpToolId("Git Hub", "search/issues"), "mcp__Git_Hub__search_issues");
});

test("expandMcpEnvironmentValue resolves explicit placeholders", () => {
  const previous = process.env.QKRPC_MCP_TEST_TOKEN;
  process.env.QKRPC_MCP_TEST_TOKEN = "secret";
  try {
    assert.equal(
      expandMcpEnvironmentValue("Bearer ${QKRPC_MCP_TEST_TOKEN}"),
      "Bearer secret",
    );
  } finally {
    if (previous === undefined) delete process.env.QKRPC_MCP_TEST_TOKEN;
    else process.env.QKRPC_MCP_TEST_TOKEN = previous;
  }
});

test("workspace MCP config overrides from .quicker/mcp.json", () => {
  const paths = resolveAgentMcpConfigPaths("C:/workspace/demo");
  assert.equal(paths.length, 2);
  assert.match(paths[1].replaceAll("\\", "/"), /\/\.quicker\/mcp\.json$/);
});

test("parseAgentMcpConfigText requires explicit enable and transport fields", () => {
  const parsed = parseAgentMcpConfigText(JSON.stringify({
    mcpServers: {
      disabled: { transport: "http", url: "https://example.test/mcp" },
      local: {
        enabled: true,
        transport: "stdio",
        command: "node",
        args: ["server.mjs"],
      },
    },
  }), "C:/config/mcp.json");
  assert.equal(parsed.diagnostics.length, 0);
  assert.equal(parsed.servers.length, 2);
  assert.equal(parsed.servers.find((server) => server.name === "disabled")?.enabled, false);
  assert.equal(parsed.servers.find((server) => server.name === "local")?.enabled, true);

  const invalid = parseAgentMcpConfigText(JSON.stringify({
    mcpServers: { broken: { enabled: true, transport: "stdio" } },
  }));
  assert.equal(invalid.servers.length, 0);
  assert.match(invalid.diagnostics[0]?.message ?? "", /requires command/);
});

test("invalid MCP server does not suppress valid siblings", () => {
  const parsed = parseAgentMcpConfigText(JSON.stringify({
    mcpServers: {
      valid: { enabled: true, transport: "http", url: "https://example.test/mcp" },
      broken: { enabled: true, transport: "stdio" },
    },
  }));
  assert.deepEqual(parsed.servers.map((server) => server.name), ["valid"]);
  assert.equal(parsed.diagnostics.length, 1);
});

function layer(value: unknown, path = "/fixture/mcp.json"): AgentMcpConfigLayer {
  return { ...parseAgentMcpConfigText(JSON.stringify(value), path), path, revision: "fixture" };
}

test("native source stores only selection and policies and defaults disabled", () => {
  const parsed = parseAgentMcpConfigText(JSON.stringify({ mcpServers: { [QUICKER_NATIVE_MCP_SERVER_NAME]: { source: "quicker-native", tools: ["read_file"], maxCallsPerTurn: 3 } } }));
  assert.equal(parsed.servers[0].transport, "http");
  assert.equal(parsed.servers[0].enabled, false);
  assert.deepEqual(parsed.servers[0].tools, ["read_file"]);
  assert.equal(parsed.servers[0].url, undefined);
  assert.equal(parsed.servers[0].headers, undefined);
  for (const [key, value] of Object.entries({ transport: "http", url: "http://127.0.0.1:9999/mcp", headers: {}, command: "node", args: [], env: {}, cwd: ".", token: "private", settingsPath: "/other" })) {
    const rejected = layer({ mcpServers: { "quicker-local": { enabled: true, source: "quicker-native", [key]: value } } });
    assert.equal(rejected.entries[0].server, null, key);
  }
  assert.equal(layer({ mcpServers: { native: { enabled: true, source: "quicker-native" } } }).entries[0].server, null);
  assert.equal(layer({ mcpServers: { "QUICKER-LOCAL": { enabled: true, source: "quicker-native" } } }).entries[0].server?.name, QUICKER_NATIVE_MCP_SERVER_NAME);
});

test("case-insensitive invalid or disabled higher layers cannot enable a lower native source", () => {
  const user = layer({ mcpServers: { "quicker-local": { source: "quicker-native", enabled: true }, sibling: { transport: "stdio", command: "node", enabled: true } } });
  for (const value of [{ enabled: false }, { enabled: false, source: "quicker-native" }, { enabled: true, transport: "http" }]) {
    const workspace = layer({ mcpServers: { "QUICKER-LOCAL": value } });
    assert.deepEqual(mergeAgentMcpConfigLayers([user, workspace]).servers.map((s) => s.name), ["sibling"]);
  }
  for (const status of ["invalid", "unavailable"] as const) {
    assert.deepEqual(mergeAgentMcpConfigLayers([user, { path: "/workspace", revision: null, status, entries: [], diagnostics: [] }]).servers, []);
  }
});

test("layer revision follows current bytes even at equal mtime and exposes no raw source", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "qkrpc-mcp-config-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, ".quicker"));
  const path = join(root, ".quicker", "mcp.json");
  const paths = [join(root, "user-mcp.json"), path];
  const stamp = new Date("2020-01-01T00:00:00Z");
  await writeFile(path, '{"mcpServers":{"quicker-local":{"source":"quicker-native","enabled":true}},"private":"first"}');
  await utimes(path, stamp, stamp);
  const a = (await loadAgentMcpConfigLayers(root, paths)).at(-1)!;
  await writeFile(path, '{"mcpServers":{"quicker-local":{"source":"quicker-native","enabled":true}},"private":"other"}');
  await utimes(path, stamp, stamp);
  const b = (await loadAgentMcpConfigLayers(root, paths)).at(-1)!;
  assert.notEqual(a.revision, b.revision);
  assert.equal(JSON.stringify(b).includes("other"), false);
  await writeFile(path, "{malformed");
  assert.equal((await loadAgentMcpConfigLayers(root, paths)).at(-1)?.status, "invalid");
});
