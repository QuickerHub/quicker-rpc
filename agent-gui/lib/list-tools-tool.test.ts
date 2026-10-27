import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { before, test } from "node:test";
import vm from "node:vm";
import { jsonSchema, tool, type JSONSchema7, type ToolSet } from "ai";
import { build } from "esbuild";
import { z } from "zod";
import { executeListToolsTool } from "./list-tools-tool-execute";

type FixtureApi = {
  executeListToolsTool: typeof executeListToolsTool;
  ASK_QUESTION_TOOL_DEF: typeof import("./ask-question-tool").ASK_QUESTION_TOOL_DEF;
  SET_THREAD_TITLE_TOOL_DEF: typeof import("./set-thread-title-tool").SET_THREAD_TITLE_TOOL_DEF;
};

let compiled = "";

before(async () => {
  // The production catalog must have no dependency on the global executable
  // registry, ambient configuration, databases or host transports.
  const result = await build({
    stdin: {
      contents: `
        export { executeListToolsTool } from './list-tools-tool-execute';
        export { ASK_QUESTION_TOOL_DEF } from './ask-question-tool';
        export { SET_THREAD_TITLE_TOOL_DEF } from './set-thread-title-tool';
      `,
      resolveDir: import.meta.dirname,
      loader: "ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    external: ["ai", "zod"],
    metafile: true,
    tsconfig: path.resolve(import.meta.dirname, "../tsconfig.json"),
  });
  for (const input of Object.keys(result.metafile!.inputs)) {
    assert.doesNotMatch(input.replaceAll("\\", "/"),
      /(?:^|\/)lib\/(?:tools\.ts$|db\/|llm[./-]|agent-mcp\/|qkrpc(?:-http)?\.ts$)/,
      "Schema tests must not import ambient config, databases or host transports");
  }
  compiled = result.outputFiles[0]!.text;
});

function fixture(overrides: Record<string, unknown> = {}) {
  const fixtureTools: Record<string, unknown> = {};
  const module = { exports: {} as FixtureApi };
  const require = createRequire(import.meta.url);
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    process: { env: { NODE_ENV: "production" } },
    require(id: string) {
      assert.ok(id === "ai" || id === "zod", `Unexpected fixture dependency: ${id}`);
      return require(id);
    },
  });
  const api = module.exports;
  Object.assign(fixtureTools, {
    ask_question: api.ASK_QUESTION_TOOL_DEF,
    set_thread_title: api.SET_THREAD_TITLE_TOOL_DEF,
  }, overrides);
  return { execute: (input: Parameters<typeof executeListToolsTool>[0]) =>
    api.executeListToolsTool(input, { mode: "agent", tools: fixtureTools as ToolSet }), tools: fixtureTools, originals: api };
}

type WireTool = {
  toolId: string;
  label?: string;
  group?: string;
  category?: string;
  description?: string;
  inputSchema?: JSONSchema7;
};

function wire(result: Record<string, unknown>) {
  // This is the actual JSON boundary used by tool output and HTTP consumers.
  return JSON.parse(JSON.stringify(result)) as {
    ok: boolean;
    data: WireTool & { action: string; bundleId?: string; tools?: WireTool[] };
  };
}

test("executeListToolsTool routing describes only current tools", async () => {
  const result = await fixture().execute({ action: "routing" });
  assert.equal(result.ok, true);
  const data = result.data as Record<string, unknown>;
  assert.ok(String(data.routingTable).includes("Current tool"));
  assert.ok(String(data.routingTable).includes("ask_question"));
  assert.ok(!String(data.routingTable).includes("qkrpc_action_save"));
});

test("executeListToolsTool bundles lists categorized packs", async () => {
  const result = await fixture().execute({ action: "bundles" });
  assert.equal(result.ok, true);
  const data = result.data as { bundles?: Array<{ id: string }> };
  assert.deepEqual(Array.from(data.bundles ?? [], bundle => bundle.id), ["core"]);
});

test("executeListToolsTool bundle requires bundleId", async () => {
  const result = await fixture().execute({ action: "bundle" });
  assert.equal(result.ok, false);
});

test("executeListToolsTool bundle rejects unknown pack", async () => {
  const result = await fixture().execute({
    action: "bundle",
    bundleId: "not_a_bundle" as "core",
  });
  assert.equal(result.ok, false);
});
test("executeListToolsTool index lists only current selected tools", async () => {
  const result = await fixture().execute({ action: "index" });
  assert.equal(result.ok, true);
  const data = result.data as { toolIds?: string[] };
  assert.deepEqual(Array.from(data.toolIds ?? []), ["ask_question", "set_thread_title"]);
});

test("unbound discovery never restores the global catalog", async () => {
  const result = await executeListToolsTool({ action: "get", toolId: "workspace_program" });
  assert.equal(result.ok, false);
  assert.equal((result.data as { errorCode: string }).errorCode, "tool_catalog_unbound");
});

test("get serializes original tool schemas with nested required fields and constraints", async () => {
  const run = fixture();
  const original = run.originals.ASK_QUESTION_TOOL_DEF;
  const originalSchema = original.inputSchema;
  const result = wire(await run.execute({ action: "get", toolId: " ask_question " }));
  assert.equal(result.ok, true);
  assert.equal(result.data.action, "list-tools-get");
  assert.equal(result.data.toolId, "ask_question");
  assert.equal(result.data.label, "询问选项");
  assert.equal(result.data.group, "read");
  assert.equal(result.data.category, "runtime");
  assert.equal(result.data.bundleId, "core");
  assert.equal(result.data.description, original.description);
  const schema = result.data.inputSchema!;
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.required, ["questions"]);
  assert.equal(schema.additionalProperties, false);
  assert.equal((schema.properties!.title as JSONSchema7).type, "string");
  const questions = schema.properties!.questions as JSONSchema7;
  assert.equal(questions.type, "array");
  assert.equal(questions.minItems, 1);
  assert.equal(questions.maxItems, 8);
  const question = questions.items as JSONSchema7;
  assert.deepEqual(question.required, ["id", "prompt", "options"]);
  assert.equal((question.properties!.allow_multiple as JSONSchema7).type, "boolean");
  const options = question.properties!.options as JSONSchema7;
  assert.equal(options.minItems, 2);
  assert.deepEqual((options.items as JSONSchema7).required, ["id", "label"]);
  assert.equal("_def" in schema, false);
  assert.equal("def" in schema, false);
  assert.equal(original.inputSchema, originalSchema);
  assert.equal(original.execute, undefined, "Discovery must keep a client-only tool client-only");

  const title = wire(await run.execute({ action: "get", toolId: "set_thread_title" }));
  assert.equal(title.ok, true);
  assert.equal(title.data.description, run.originals.SET_THREAD_TITLE_TOOL_DEF.description);
  assert.deepEqual(title.data.inputSchema!.required, ["title"]);
  assert.equal((title.data.inputSchema!.properties!.title as JSONSchema7).minLength, 1);
});

test("bundle returns real JSON schemas while retaining bundle and tool metadata", async () => {
  const definition = tool({
    description: "Fixture connection wait",
    inputSchema: z.object({
      action: z.enum(["check", "wait"]),
      timeout: z.number().int().min(1).optional(),
    }),
    execute: async () => { throw new Error("Schema discovery must not execute tools"); },
  });
  const run = fixture({ qkrpc_wait: definition });
  const result = wire(await run.execute({ action: "bundle", bundleId: "core" }));
  assert.equal(result.ok, true);
  assert.equal(result.data.action, "list-tools-bundle");
  assert.equal(result.data.bundleId, "core");
  assert.equal(result.data.label, "核心");
  assert.match(result.data.description!, /execution scope/);
  const tools = result.data.tools!;
  assert.deepEqual(tools.map((item) => item.toolId), ["qkrpc_wait", "ask_question"]);
  const wait = tools[0];
  assert.equal(wait.description, definition.description);
  assert.equal(wait.group, "read");
  assert.deepEqual(wait.inputSchema!.required, ["action"]);
  assert.deepEqual((wait.inputSchema!.properties!.action as JSONSchema7).enum, ["check", "wait"]);
  assert.equal((wait.inputSchema!.properties!.timeout as JSONSchema7).minimum, 1);
  assert.deepEqual(tools[1].inputSchema!.required, ["questions"]);
  assert.equal(definition.inputSchema instanceof z.ZodObject, true);
});

test("get and bundle await SDK schema wrappers without executing validation or changing approval", async () => {
  let release!: (schema: JSONSchema7) => void;
  const ready = new Promise<JSONSchema7>((resolve) => { release = resolve; });
  let factories = 0;
  let validations = 0;
  let executions = 0;
  let approvals = 0;
  const expected: JSONSchema7 = {
    type: "object",
    properties: { id: { type: "string", minLength: 1 } },
    required: ["id"],
    additionalProperties: false,
  };
  const inputSchema = jsonSchema(async () => { factories++; return ready; }, {
    validate: () => { validations++; return { success: true, value: { id: "unused" } }; },
  });
  const needsApproval = () => { approvals++; return true; };
  const definition = tool({
    description: "Fixture approved profile deletion",
    inputSchema,
    needsApproval,
    execute: async () => { executions++; return "unused"; },
  });
  const run = fixture({ qkrpc_profile_delete: definition });
  let settled = false;
  const pending = run.execute({ action: "get", toolId: "qkrpc_profile_delete" });
  void pending.then(() => { settled = true; }, () => { settled = true; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(factories, 1);
  assert.equal(settled, false, "The catalog cannot return a pending Promise as JSON schema");
  release(expected);
  const get = wire(await pending);
  assert.deepEqual(get.data.inputSchema, expected);
  assert.equal(get.data.group, "write");
  assert.equal(get.data.label, "删除动作页");
  assert.equal(get.data.category, "layout");
  assert.equal(get.data.bundleId, "action_layout");
  assert.equal(get.data.description, definition.description);
  const bundle = wire(await run.execute({ action: "bundle", bundleId: "action_layout" }));
  assert.deepEqual(bundle.data.tools!.map((item) => item.toolId), ["qkrpc_profile_delete"]);
  assert.deepEqual(bundle.data.tools![0].inputSchema, expected);
  assert.equal(factories, 1, "Use the SDK wrapper's cached schema");
  assert.equal(validations, 0);
  assert.equal(executions, 0);
  assert.equal(approvals, 0);
  assert.equal(definition.inputSchema, inputSchema);
  assert.equal(definition.needsApproval, needsApproval);
});

test("missing schemas remain omitted and unknown tools keep their error result", async () => {
  const run = fixture({ qkrpc_profile_delete: { description: "Metadata only" } });
  const result = wire(await run.execute({ action: "get", toolId: "qkrpc_profile_delete" }));
  assert.equal(result.ok, true);
  assert.equal("inputSchema" in result.data, false);
  const bundle = wire(await run.execute({ action: "bundle", bundleId: "action_layout" }));
  assert.equal("inputSchema" in bundle.data.tools![0], false);
  const unknown = await run.execute({ action: "get", toolId: "not_registered" });
  assert.equal(unknown.ok, false);
  assert.match(String(unknown.stderr), /unavailable in the current execution scope/);
  assert.equal((await run.execute({ action: "get" })).ok, false);
});

test("schema generation failures reject get and bundle instead of returning raw or partial schemas", async () => {
  for (const action of ["get", "bundle"] as const) {
    const failure = new Error(`Fixture ${action} schema conversion failed`);
    const inputSchema = jsonSchema(async () => { throw failure; });
    const definition = tool({
      inputSchema,
      execute: async () => { throw new Error("No tool execution"); },
    });
    const run = fixture({
      qkrpc_profile_create: tool({ inputSchema: z.object({ label: z.string() }) }),
      qkrpc_profile_delete: definition,
    });
    await assert.rejects(run.execute({ action, toolId: "qkrpc_profile_delete", bundleId: "action_layout" }),
      (error) => error === failure);
    assert.equal(definition.inputSchema, inputSchema);
  }
});
