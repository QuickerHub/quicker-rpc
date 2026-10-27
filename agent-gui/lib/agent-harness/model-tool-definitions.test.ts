import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";
import { tool } from "ai";
import { z } from "zod";
import { createQkrpcActionSourceTools, QKRPC_ACTION_SAVE_TOOL } from "../qkrpc-action-source-tool";
import { resolveTurnPlan } from "../agent-core/turn-plan";
import { mcpToolId } from "../agent-mcp/tool-id";

import {
  CORE_FULL_SCHEMA_TOOL_IDS,
  countSlimExtendedTools,
  isFullToolSchemasForAllEnabled,
  slimToolDefinition,
  slimToolsForModel,
  SLIM_EXTENDED_TOOL_INPUT_SCHEMA,
} from "./model-tool-definitions";

function mockTool(description: string, schema: z.ZodTypeAny) {
  return tool({
    description,
    inputSchema: schema,
    execute: async () => ({ ok: true }),
  });
}

function enableSlimSchemas(t: TestContext) {
  const previous = process.env.HARNESS_FULL_TOOL_SCHEMAS;
  process.env.HARNESS_FULL_TOOL_SCHEMAS = "0";
  t.after(() => {
    if (previous === undefined) delete process.env.HARNESS_FULL_TOOL_SCHEMAS;
    else process.env.HARNESS_FULL_TOOL_SCHEMAS = previous;
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
    assert.equal(slim, full);
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

  it("a non-authoring turn retains the real save factory's partial-persistence and target restrictions", (t) => {
    enableSlimSchemas(t);
    let calls = 0;
    const unexpected = (): never => { calls++; throw Error("Projection must not access files or dispatch a tool"); };
    const tools = createQkrpcActionSourceTools({ resolveDirectory: unexpected, run: unexpected });
    const plan = resolveTurnPlan({ chatMode: "agent", userText: "Hello", messages: [],
      actionScope: { pinnedLatest: undefined, pinnedLatestAll: [] }, enabledToolIds: Object.keys(tools) });
    assert.equal(plan.activeToolBundles.includes("action_authoring"), false);
    assert.equal(plan.fullSchemaToolIds.includes(QKRPC_ACTION_SAVE_TOOL), false);
    const full = tools[QKRPC_ACTION_SAVE_TOOL];
    const projected = slimToolsForModel(tools, new Set(plan.fullSchemaToolIds))[QKRPC_ACTION_SAVE_TOOL];
    assert.equal(projected.inputSchema, SLIM_EXTENDED_TOOL_INPUT_SCHEMA);
    assert.equal(projected.execute, full.execute);
    assert.ok(projected.description?.startsWith(full.description!));
    assert.match(projected.description!, /If persisted=true but checkpoint failed, do not retry/);
    assert.match(projected.description!, /preserve edits and reopen into another directory/);
    assert.match(projected.description!, /Never edits V2\/new actions\/global subprograms or publishes shares/);
    assert.equal(calls, 0);
  });

  for (const description of [undefined, "", " \t\n"]) {
    it(`missing current descriptions stay unknown even for a known registry id (${JSON.stringify(description)})`, () => {
      let calls = 0;
      const full = tool({ description, inputSchema: z.object({}), execute: async () => { calls++; return {}; } });
      const projected = slimToolDefinition(QKRPC_ACTION_SAVE_TOOL, full, new Set());
      assert.equal(projected.description,
        `The current tool did not provide a description; its operation semantics are unknown. Full params: list_tools action=get toolId=${QKRPC_ACTION_SAVE_TOOL} (or action=bundle bundleId=…).`);
      assert.equal(projected.execute, full.execute);
      assert.equal(calls, 0);
    });
  }

  it("successive MCP definitions retain only the current complete description without executing tools", (t) => {
    enableSlimSchemas(t);
    const id = mcpToolId("fixture", "save");
    let calls = 0;
    const current = (description: string) => tool({ description, inputSchema: z.object({ path: z.string() }),
      execute: async () => { calls++; return {}; } });
    const before = current("Original provider instructions.");
    const description = ` \nUpdated provider instructions. ${"Actual description. ".repeat(700)}\nIf the result is unknown, do not retry. \n`;
    const after = current(description);
    const first = slimToolsForModel({ [id]: before }, new Set())[id];
    const second = slimToolsForModel({ [id]: after }, new Set())[id];
    assert.ok(first.description?.startsWith(before.description!));
    assert.equal(second.description, `${description} Full params: list_tools action=get toolId=${id} (or action=bundle bundleId=…).`);
    assert.doesNotMatch(second.description!, /Original provider instructions/);
    assert.equal(second.execute, after.execute);
    assert.equal(second.inputSchema, SLIM_EXTENDED_TOOL_INPUT_SCHEMA);
    assert.equal(slimToolsForModel({ [id]: after }, new Set([id]))[id], after);
    assert.equal(calls, 0);
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
