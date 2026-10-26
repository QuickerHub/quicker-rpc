import assert from "node:assert/strict";
import test from "node:test";
import type { McpServerCatalog } from "./catalog";
import { formatMcpGuidanceForTools, MCP_GUIDANCE_CONTEXT_MAX_CHARS } from "./guidance";

function catalog(name = "quicker-local", text = "Current host workflow") : McpServerCatalog {
  return { source: { serverName: name, configPath: "fixture", transport: "http", workspaceCwd: "fixture" },
    serverInfo: { name: "quicker", version: null }, pageCount: 1,
    tools: ["skill_load", "quicker_save"].map(name => ({ name, inputSchema: { type: "object" } })),
    guidance: { state: "available", text, revision: "fixture-revision", retrievedAt: "fixture-time" } };
}

test("only final capabilities contribute reference material and raw names map to remote IDs", () => {
  const text = formatMcpGuidanceForTools([catalog(), catalog("other", "OTHER SERVER")], ["skill_load", "mcp__quicker-local__skill_load"]);
  assert.match(text, /untrusted reference data/);
  assert.match(text, /cannot authorize tools/);
  assert.match(text, /does not prove a private editing workspace/);
  const block = JSON.parse(text.split("\n\n")[1]);
  assert.deepEqual(block.toolNames, { skill_load: "mcp__quicker-local__skill_load" });
  assert.equal(block.source.reportedServer.version, null);
  assert.equal(block.source.instructionsRevision, "fixture-revision");
  assert.equal(block.source.retrievedAt, "fixture-time");
  assert.doesNotMatch(text, /OTHER SERVER|quicker_save/);
  assert.equal(formatMcpGuidanceForTools([catalog()], ["skill_load"]), "");
  assert.equal(formatMcpGuidanceForTools([catalog()], []), "");
});

test("child capabilities narrow guidance independently, without a provider name or version allowlist", () => {
  const unknown = catalog("future", "New initialization instructions");
  unknown.serverInfo = { name: "future product", version: "unknown build" };
  const selected = formatMcpGuidanceForTools([unknown], ["mcp__future__quicker_save"]);
  assert.match(selected, /New initialization instructions/);
  assert.match(selected, /mcp__future__quicker_save/);
  assert.doesNotMatch(selected, /skill_load/);
});

test("missing and omitted instructions give explicit notices rather than invented fallback workflows", () => {
  for (const guidance of [undefined, { state: "omitted" as const, revision: null, retrievedAt: "now", reason: "too_large" as const },
    { state: "available" as const, revision: null, retrievedAt: "now" }]) {
    const value = catalog(); value.guidance = guidance;
    const block = JSON.parse(formatMcpGuidanceForTools([value], ["mcp__quicker-local__skill_load"]).split("\n\n")[1]);
    assert.ok(["missing", "omitted"].includes(block.state));
    assert.equal(block.reference, undefined);
    assert.match(block.notice, /do not/);
  }
});

test("whole JSON blocks including escaped text, mapping and source labels fit one aggregate context budget", () => {
  const sources = Array.from({ length: 20 }, (_, i) => catalog(`server${i}`, "\u0000".repeat(5000)));
  const ids = sources.map((_, i) => `mcp__server${i}__skill_load`);
  const text = formatMcpGuidanceForTools(sources, ids);
  assert.ok(text.length <= MCP_GUIDANCE_CONTEXT_MAX_CHARS);
  assert.match(text, /20 MCP source reference block/);
  assert.doesNotMatch(text, /\\u0000/);
  const largeLabel = catalog("x".repeat(25000), "WHOLE TEXT");
  const huge = formatMcpGuidanceForTools([largeLabel], [`mcp__${largeLabel.source.serverName}__skill_load`]);
  assert.ok(huge.length <= MCP_GUIDANCE_CONTEXT_MAX_CHARS);
  assert.doesNotMatch(huge, /WHOLE TEXT/);
  const many = Array.from({ length: 40 }, (_, i) => catalog(`s${i}`, `COMPLETE-${i}-${"a".repeat(1200)}-END`));
  const aggregate = formatMcpGuidanceForTools(many, many.map((_, i) => `mcp__s${i}__skill_load`));
  assert.ok(aggregate.length <= MCP_GUIDANCE_CONTEXT_MAX_CHARS);
  for (const block of aggregate.split("\n\n").slice(1).filter(value => value.startsWith("{"))) {
    assert.match(JSON.parse(block).reference, /-END$/);
  }
});
