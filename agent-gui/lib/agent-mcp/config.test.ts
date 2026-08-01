import assert from "node:assert/strict";
import test from "node:test";

import {
  expandMcpEnvironmentValue,
  mcpToolId,
  parseAgentMcpConfigText,
  resolveAgentMcpConfigPaths,
} from "@/lib/agent-mcp/config";

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
