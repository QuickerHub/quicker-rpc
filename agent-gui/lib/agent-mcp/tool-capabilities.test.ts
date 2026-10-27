import assert from "node:assert/strict";
import { test } from "node:test";
import { selectMcpToolDefinitions } from "./tool-capabilities";
import { restrictComposedTools } from "@/lib/chat-tool-selection";
import { isNamespacedMcpToolId, mcpToolId } from "./tool-id";

const definitions = [
  { name: "read", annotations: { readOnlyHint: true } },
  { name: "write", annotations: { readOnlyHint: false } },
  { name: "unknown" },
  { name: "conflicting", annotations: { readOnlyHint: true, destructiveHint: true } },
];

test("possible MCP ids follow the actual namespace mapping without inferring provider capabilities", () => {
  for (const [server, tool] of [["Git Hub", "search/issues"], ["_", "  "], ["a___b", "c__d"], ["-", "-"], ["Future", "unknown-operation"]]) {
    assert.equal(isNamespacedMcpToolId(mcpToolId(server, tool)), true);
  }
  for (const id of ["Read", "qkrpc_action_save", "mcp__", "mcp__server", "mcp____tool", "mcp__server__", "mcp__a___b", "MCP__server__tool", "mcp__a b__tool", "mcp__a__tool ", "mcp__a__tool/child"]) {
    assert.equal(isNamespacedMcpToolId(id), false, id);
  }
});

test("Ask admits only explicitly read-only MCP capabilities", () => {
  assert.deepEqual(selectMcpToolDefinitions(definitions, { mode: "ask" }).map((x) => x.name), ["read"]);
  assert.deepEqual(selectMcpToolDefinitions(definitions, { mode: "ask", allowedTools: ["write", "unknown"] }), []);
});

test("MCP server allowlist remains monotonic and Launcher has no MCP surface", () => {
  assert.deepEqual(selectMcpToolDefinitions(definitions, { mode: "agent", allowedTools: [] }), []);
  assert.equal(selectMcpToolDefinitions(definitions, { mode: "agent" }).length, 4);
  assert.deepEqual(selectMcpToolDefinitions(definitions, { mode: "launcher" }), []);
});

test("slash restriction still applies after read-only MCP composition", () => {
  const permitted = selectMcpToolDefinitions(definitions, { mode: "ask" });
  const composed = { Read: {}, ...Object.fromEntries(permitted.map((x) => [`mcp__demo__${x.name}`, {}])) };
  assert.deepEqual(restrictComposedTools(composed, []), {});
  assert.deepEqual(Object.keys(restrictComposedTools(composed, ["mcp__demo__read", "mcp__demo__write"])), ["mcp__demo__read"]);
});
