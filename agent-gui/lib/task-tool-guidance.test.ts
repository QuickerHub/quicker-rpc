import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { before, test } from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
import { jsonSchema, tool, type ToolSet, type ToolExecutionOptions } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import type { createTaskToolForParent as Factory } from "./task-tool.server";
import { formatMcpGuidanceForTools } from "./agent-mcp/guidance";
import { formatCurrentToolCatalogSystem } from "./tool-catalog-system-prompt";

let compiled = "";
// Keep the real SDK, selector, child system builder and catalog formatter. Only
// resource ports are synthetic: no user configuration or transport is loaded.
const ports: Record<string, string> = {
  "server-only": "",
  "@/lib/agent-defs/discover-core": "export const getSubagent=async()=>probe.subagent;",
  "@/lib/agent-defs/workspace-instructions.server": "export const loadWorkspaceInstructions=async()=>null;export const formatWorkspaceInstructionsForPrompt=()=>'';",
  "@/lib/agent-skills/prompt-catalog": "export const isPreloadedSkillBodyInPromptEnabled=()=>false;export const formatPreloadedSkillsEssentialsForPrompt=async()=>'';",
  "@/lib/action-authoring-docs": "export const formatAuthoringSkillForPrompt=async()=>'';",
  "@/lib/llm": "export const resolveLlmSelection=()=>({});export const resolveChatModelForSelection=async()=>({model:probe.model,modelId:'fixture'});",
  "@/lib/qkrpc-request-context": `export const getRequestCwd=()=>'/fixture';export const getRequestLlmSelectionRaw=()=>undefined;
    export const runWithTraceTaskInvocation=async(_id,_name,fn)=>({value:await fn(),traceRuns:[],traceRefs:[]});`,
  "@/lib/repair-tool-call": "export const createRepairToolCallHandler=()=>undefined;",
};
before(async () => {
  const result = await build({ entryPoints: [path.join(import.meta.dirname, "task-tool.server.ts")],
    bundle: true, write: false, platform: "node", format: "cjs", external: ["ai", "zod"], metafile: true,
    tsconfig: path.resolve(import.meta.dirname, "../tsconfig.json"), plugins: [{ name: "owned-task-ports", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => args.path in ports ? { path: args.path, namespace: "port" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "port" }, args => ({ contents: ports[args.path], loader: "ts", resolveDir: path.resolve(import.meta.dirname, "..") }));
    } }] });
  for (const name of Object.keys(result.metafile!.inputs)) {
    if (!name.startsWith("port:")) assert.doesNotMatch(name.replaceAll("\\", "/"), /lib\/(?:db\/|llm(?:[./-])|agent-mcp\/(?:config|load\.server)\.ts|agent-defs\/workspace-instructions\.server\.ts|agent-skills\/prompt-catalog\.ts)/);
  }
  compiled = result.outputFiles[0].text;
});

function fixture(selected: string[] | undefined, inheritSkills = false) {
  const model = new MockLanguageModelV3({ doGenerate: async () => ({
    content: [{ type: "text", text: "child result" }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
    warnings: [],
  }) });
  const probe = { model, subagent: { name: "fixture", description: "Owned subagent fixture", body: "CHILD BASE SYSTEM",
    tools: selected, inherit: inheritSkills ? ["skills"] : [], model: null } };
  const module = { exports: {} as { createTaskToolForParent: typeof Factory } };
  vm.runInNewContext(compiled, { module, exports: module.exports, probe, require: createRequire(import.meta.url) });
  return { model, createTask: module.exports.createTaskToolForParent };
}

function parentTools() {
  let executions = 0;
  const remote = tool({ description: "Current native operation; approval is required.",
    inputSchema: jsonSchema({ type: "object", properties: { current: { type: "string" } }, required: ["current"] }),
    needsApproval: true, execute: async () => { executions++; return "wrapped parent operation"; } });
  const parent: ToolSet = { mcp__native__read: remote,
    Read: tool({ description: "Read the selected local file.", inputSchema: jsonSchema({ type: "object", properties: { path: { type: "string" } } }),
      execute: async () => { executions++; return "local"; } }),
    task: tool({ inputSchema: jsonSchema({ type: "object" }), execute: async () => assert.fail("no recursion") }),
    client_only: tool({ inputSchema: jsonSchema({ type: "object" }) }),
  };
  return { parent, remote, executions: () => executions };
}

function sdkCall(run: ReturnType<typeof fixture>) {
  assert.equal(run.model.doGenerateCalls.length, 1, "Exactly one real SDK provider call is expected");
  const call = run.model.doGenerateCalls[0];
  return { system: call.prompt.filter(message => message.role === "system").map(message => String(message.content)).join("\n\n"),
    tools: call.tools ?? [], toolIds: (call.tools ?? []).map(definition => definition.name).sort() };
}
const options = { toolCallId: "fixture", messages: [] } as ToolExecutionOptions;
const selections = [undefined, [], ["Read"], ["mcp__native__read", "task", "client_only", "not_in_parent"]];
function expectedIds(selected: string[] | undefined) {
  return ["Read", "mcp__native__read"].filter(id => selected === undefined || selected.includes(id)).sort();
}
function systemCatalog(system: string) {
  const blocks = [...system.matchAll(/<current-tool-catalog>\s*([\s\S]*?)\s*<\/current-tool-catalog>/g)];
  assert.equal(blocks.length, 1, "The actual SDK system must contain exactly one final executable tool catalog");
  return JSON.parse(blocks[0][1]) as { mode: string; tools: Array<{ toolId: string; descriptionState: string; operationPolicy: unknown }> };
}

test("the actual child SDK system always describes its final tools even without a parent projection callback", async () => {
  for (const selected of selections) {
    const run = fixture(selected), parent = parentTools();
    const task = run.createTask(() => parent.parent);
    await task.execute!({ agent: "fixture", prompt: "child task" }, options);
    const received = sdkCall(run);
    assert.deepEqual(received.toolIds, expectedIds(selected));
    assert.match(received.system, /CHILD BASE SYSTEM/);
    const catalog = systemCatalog(received.system);
    assert.equal(catalog.mode, "unknown", "An unbound child prompt must not infer Agent permissions");
    assert.deepEqual(catalog.tools.map(row => row.toolId).sort(), received.toolIds);
    for (const row of catalog.tools) {
      assert.equal(row.descriptionState, row.toolId.startsWith("mcp__") ? "unknown" : "provided",
        "An SDK wrapper description alone cannot prove the missing MCP provider declaration");
      assert.equal(row.operationPolicy, "unknown");
    }
    assert.doesNotMatch(received.system, /full schema every turn|Auto-loaded packs|On-demand packs/);
    assert.equal(parent.executions(), 0, "Catalog/system preparation must not execute a business tool");
  }
});

test("the actual SDK child reprojects provider guidance after final narrowing without restoring forbidden tools", async () => {
  const catalogs = [{ source: { serverName: "native", configPath: "fixture", transport: "http" as const, workspaceCwd: "/fixture" },
    serverInfo: { name: "quicker", version: null }, tools: [{ name: "read", inputSchema: { type: "object" as const } }], pageCount: 1,
    guidance: { state: "available" as const, text: "CURRENT NATIVE REFERENCE", revision: "current", retrievedAt: "current" } }];
  for (const selected of selections) {
    for (const inheritSkills of [true, false]) {
      const run = fixture(selected, inheritSkills), parent = parentTools();
      const projected: string[][] = [];
      const task = run.createTask(() => parent.parent, undefined, ids => {
        projected.push([...ids]);
        const narrowed = Object.fromEntries(Object.entries(parent.parent).filter(([id]) => ids.includes(id)));
        return [formatCurrentToolCatalogSystem(narrowed, { mode: "agent" }, catalogs), formatMcpGuidanceForTools(catalogs, ids)].filter(Boolean).join("\n\n");
      });
      await task.execute!({ agent: "fixture", prompt: "child task" }, options);
      const received = sdkCall(run);
      assert.equal(projected.length, 1); assert.deepEqual(projected[0].sort(), received.toolIds);
      assert.deepEqual(received.toolIds, expectedIds(selected));
      assert.match(received.system, /CHILD BASE SYSTEM/);
      const catalog = systemCatalog(received.system);
      assert.equal(catalog.mode, "agent");
      assert.deepEqual(catalog.tools.map(row => row.toolId).sort(), received.toolIds);
      if (received.toolIds.includes("mcp__native__read")) {
        assert.match(received.system, /CURRENT NATIVE REFERENCE/);
        assert.match(received.system, /"read":"mcp__native__read"/);
        const definition = received.tools.find(item => item.name === "mcp__native__read");
        assert.equal(definition?.type, "function");
        if (definition?.type === "function") assert.deepEqual(definition.inputSchema, { type: "object", properties: { current: { type: "string" } }, required: ["current"] });
      } else assert.doesNotMatch(received.system, /CURRENT NATIVE REFERENCE|MCP provider reference material/);
      assert.equal(parent.remote.needsApproval, true); assert.equal(parent.executions(), 0);
    }
  }
});
