import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tool } from "ai";
import { z } from "zod";

import {
  CORE_FULL_SCHEMA_TOOL_IDS,
  countSlimExtendedTools,
  isFullToolSchemasForAllEnabled,
  slimToolDefinition,
  slimToolsForModel,
} from "./model-tool-definitions";

function mockTool(description: string, schema: z.ZodTypeAny) {
  return tool({
    description,
    inputSchema: schema,
    execute: async () => ({ ok: true }),
  });
}

describe("model-tool-definitions", () => {
  it("CORE_FULL_SCHEMA_TOOL_IDS covers core workflow tools", () => {
    assert.ok(CORE_FULL_SCHEMA_TOOL_IDS.has("list_tools"));
    assert.ok(CORE_FULL_SCHEMA_TOOL_IDS.has("workspace_program"));
    assert.ok(!CORE_FULL_SCHEMA_TOOL_IDS.has("browser"));
  });

  it("slimToolDefinition keeps full schema for active pack ids", () => {
    const full = mockTool("Find actions", z.object({ query: z.string() }));
    const active = new Set(["qkrpc_action_query"]);
    const slim = slimToolDefinition("qkrpc_action_query", full, active);
    assert.equal(slim.inputSchema, full.inputSchema);
  });

  it("slimToolDefinition replaces inactive tool schema with list_tools hint", () => {
    const full = mockTool(
      "Playwright browser",
      z.object({ action: z.string(), url: z.string().optional() }),
    );
    const active = new Set<string>();
    const slim = slimToolDefinition("browser", full, active);
    assert.notEqual(slim.inputSchema, full.inputSchema);
    assert.match(slim.description ?? "", /list_tools action=get toolId=browser/);
  });

  it("slimToolsForModel respects HARNESS_FULL_TOOL_SCHEMAS=1", () => {
    const prev = process.env.HARNESS_FULL_TOOL_SCHEMAS;
    process.env.HARNESS_FULL_TOOL_SCHEMAS = "1";
    try {
      const bag = {
        browser: mockTool("browser", z.object({ action: z.string() })),
      };
      assert.equal(
        slimToolsForModel(bag, new Set()),
        bag,
      );
      assert.equal(isFullToolSchemasForAllEnabled(), true);
    } finally {
      if (prev === undefined) delete process.env.HARNESS_FULL_TOOL_SCHEMAS;
      else process.env.HARNESS_FULL_TOOL_SCHEMAS = prev;
    }
  });

  it("countSlimExtendedTools excludes active full-schema ids", () => {
    const active = new Set(["Read", "browser"]);
    assert.equal(
      countSlimExtendedTools(["Read", "browser", "qkrpc_action_delete"], active),
      1,
    );
  });
});
