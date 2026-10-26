import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { before, test } from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
import type { ToolSet, ToolExecutionOptions } from "ai";
import type { createTaskToolForParent as Factory } from "./task-tool.server";
import { formatMcpGuidanceForTools } from "./agent-mcp/guidance";

let compiled = "";
const ports: Record<string, string> = {
  "server-only": "",
  ai: `export const tool=x=>x;export const stepCountIs=x=>x;
    export const generateText=async options=>{probe.calls.push(options);return {text:'child result',steps:[]}};`,
  "@/lib/agent-defs/discover-core": "export const getSubagent=async()=>probe.subagent;",
  "@/lib/agent-defs/subagent-system.server": "export const buildSubagentSystemPrompt=async()=> 'CHILD BASE SYSTEM';",
  "@/lib/llm": "export const resolveLlmSelection=()=>({});export const resolveChatModelForSelection=async()=>({model:{},modelId:'fixture'});",
  "@/lib/qkrpc-request-context": `export const getRequestCwd=()=>'/fixture';export const getRequestLlmSelectionRaw=()=>undefined;
    export const runWithTraceTaskInvocation=async(_id,_name,fn)=>({value:await fn(),traceRuns:[],traceRefs:[]});`,
  "@/lib/repair-tool-call": "export const createRepairToolCallHandler=()=>undefined;",
};
before(async () => {
  const result = await build({ entryPoints: [path.join(import.meta.dirname, "task-tool.server.ts")],
    bundle: true, write: false, platform: "node", format: "cjs", external: ["zod"], metafile: true,
    tsconfig: path.resolve(import.meta.dirname, "../tsconfig.json"), plugins: [{ name: "owned-task-ports", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => args.path in ports ? { path: args.path, namespace: "port" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "port" }, args => ({ contents: ports[args.path], loader: "ts", resolveDir: path.resolve(import.meta.dirname, "..") }));
    } }] });
  for (const name of Object.keys(result.metafile!.inputs)) {
    if (!name.startsWith("port:")) assert.doesNotMatch(name.replaceAll("\\", "/"), /lib\/(?:db\/|llm(?:[./-])|agent-mcp\/(?:config|load\.server)\.ts)/);
  }
  compiled = result.outputFiles[0].text;
});

test("real task composition reprojects turn guidance after child narrowing and retains exact parent wrappers", async () => {
  const remote = { inputSchema: {}, needsApproval: true, execute: async () => "wrapped parent operation" };
  const parent = { mcp__native__read: remote, Read: { inputSchema: {}, execute: async () => "local" },
    task: { inputSchema: {}, execute: async () => assert.fail("no recursion") },
    client_only: { inputSchema: {} } } as ToolSet;
  const catalogs = [{ source: { serverName: "native", configPath: "fixture", transport: "http" as const, workspaceCwd: "/fixture" },
    serverInfo: { name: "quicker", version: null }, tools: [{ name: "read", inputSchema: { type: "object" as const } }], pageCount: 1,
    guidance: { state: "available" as const, text: "CURRENT NATIVE REFERENCE", revision: "current", retrievedAt: "current" } }];
  for (const selected of [undefined, [], ["Read"], ["mcp__native__read", "task", "client_only", "not_in_parent"]]) {
    for (const inheritSkills of [true, false]) {
      const probe = { subagent: { name: "fixture", tools: selected, inheritSkills }, calls: [] as Array<{ tools: ToolSet; system: string }> };
      const module = { exports: {} as { createTaskToolForParent: typeof Factory } };
      vm.runInNewContext(compiled, { module, exports: module.exports, probe, require: createRequire(import.meta.url) });
      const projected: string[][] = [];
      const task = module.exports.createTaskToolForParent(() => parent, undefined, ids => {
        projected.push([...ids]); return formatMcpGuidanceForTools(catalogs, ids);
      });
      await task.execute!({ agent: "fixture", prompt: "child task" }, { toolCallId: "fixture", messages: [] } as ToolExecutionOptions);
      assert.equal(probe.calls.length, 1); assert.equal(projected.length, 1);
      const child = probe.calls[0];
      assert.deepEqual(projected[0], Object.keys(child.tools));
      assert.equal(child.tools.task, undefined); assert.equal(child.tools.client_only, undefined);
      assert.equal(child.tools.not_in_parent, undefined); assert.match(child.system, /CHILD BASE SYSTEM/);
      if (child.tools.mcp__native__read) {
        assert.equal(child.tools.mcp__native__read, remote);
        assert.equal(child.tools.mcp__native__read.needsApproval, true);
        assert.match(child.system, /CURRENT NATIVE REFERENCE/);
        assert.match(child.system, /"read":"mcp__native__read"/);
      } else assert.doesNotMatch(child.system, /CURRENT NATIVE REFERENCE|MCP provider reference material/);
    }
  }
});
