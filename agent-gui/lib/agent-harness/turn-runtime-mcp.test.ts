import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { before, test } from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
import type { ChatMode } from "@/lib/chat-mode";
import type { PreparedAgentTurnRuntime } from "./turn-runtime.server";

type Probe = { loads: number; connections: number; disposals: number };
type Prepare = typeof import("./turn-runtime.server").prepareAgentTurnRuntime;
let compiled = "";

// Run the production composition, selector, command intersection, mode guard and
// call-policy wrappers. Only resource ports are replaced; no config, DB or MCP
// implementation is imported, and the connect fixture cannot open a transport.
const resourcePorts: Record<string, string> = {
  "server-only": "",
  "@/lib/agent-turn-runtime": `
    import { selectChatToolsFromRegistry } from '@/lib/chat-tool-selection';
    const definition = { inputSchema: {}, execute: async () => 'fixture' };
    const tools = Object.fromEntries(['Read','Write','list_tools','skill_load','set_thread_title'].map(id=>[id,definition]));
    export const selectChatTools = params => selectChatToolsFromRegistry(tools, params);
    export const createChatSystemBuilder = async () => () => 'fixture system';`,
  "@/lib/context-compaction-reinject.server": "export const buildPostCompactReinjectBlock=()=>'';",
  "@/lib/designer-context.server": "export const fetchDesignerContextSnapshot=async()=>{throw Error('No host in fixture')};",
  "@/lib/designer-embed-layout": "export const resolveDesignerWindowContext=()=>undefined;",
  "@/lib/designer-embed-prompt": "export const formatDesignerEmbedContextForSystem=()=>'';export const mergeDesignerDefaultActionScope=x=>x;",
  "@/lib/llm-context-limits": "export const resolveModelContextLimit=()=>({tokens:10000});",
  "@/lib/agent-harness/context-pipeline": "export const prepareContextPipeline=async()=>({modelMessages:[],compressed:false});",
  "@/lib/agent-harness/tool-execution-context": "export const buildToolExecutionContext=x=>x;",
  "@/lib/agent-mcp/load.server": `
    async function connectFixture(){probe.connections++;return {close:async()=>{probe.disposals++}};}
    export async function loadConfiguredMcpTools(_cwd,options){
      options.abortSignal?.throwIfAborted();probe.loads++;
      const client=await connectFixture();
      return {tools:{mcp__fixture__read:{inputSchema:{},execute:async()=> 'fixture MCP read'}},callPolicyOverrides:{},diagnostics:[],dispose:()=>client.close()};
    }`,
  "@/lib/task-tool.server": "export const TASK_TOOL='task';export const createTaskToolForParent=()=>{throw Error('No child loop in fixture')};",
  "@/lib/qkrpc-action-tool.server": "export const executeQkrpcActionGetReadOnly=()=>{throw Error('No host in fixture')};",
  "@/lib/qkrpc-subprogram-tool.server": "export const executeQkrpcSubprogramGetReadOnly=()=>{throw Error('No host in fixture')};",
  "@/lib/workspace-program-tool.server": "export const executeWorkspaceProgramReadOnly=()=>{throw Error('No workspace IO in fixture')};",
};

before(async () => {
  const result = await build({
    entryPoints: [path.join(import.meta.dirname, "turn-runtime.server.ts")],
    bundle: true, write: false, platform: "node", format: "cjs", metafile: true,
    external: ["ai", "zod"],
    tsconfig: path.resolve(import.meta.dirname, "../../tsconfig.json"),
    plugins: [{ name: "explicit-runtime-resource-ports", setup(builder) {
      builder.onResolve({ filter: /.*/ }, (args) => args.path in resourcePorts
        ? { path: args.path, namespace: "resource-port" }
        : undefined);
      builder.onLoad({ filter: /.*/, namespace: "resource-port" }, (args) => ({ contents: resourcePorts[args.path], loader: "ts", resolveDir: path.resolve(import.meta.dirname, "../..") }));
    } }],
  });
  for (const input of Object.keys(result.metafile!.inputs)) {
    if (input.startsWith("resource-port:")) continue;
    assert.doesNotMatch(input.replaceAll("\\", "/"), /(?:^|\/)lib\/(?:db\/|llm(?:[./-])|tools\.ts$|agent-mcp\/(?:config|load\.server)\.ts$)/,
      "The fixture must not import ambient configuration or real connection implementations");
  }
  compiled = result.outputFiles[0]!.text;
});

function fixture() {
  const probe: Probe = { loads: 0, connections: 0, disposals: 0 };
  const module = { exports: {} as { prepareAgentTurnRuntime: Prepare } };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, probe, require: createRequire(import.meta.url),
    process: { env: { NODE_ENV: "production" } },
  });
  const prepare = (options: {
    mode?: ChatMode; allowlist?: string[]; titleTest?: boolean; benchMode?: boolean; abortSignal?: AbortSignal;
  } = {}): Promise<PreparedAgentTurnRuntime> => {
    const request = {
      chatMode: options.mode ?? "agent", enabledToolIds: ["Read"],
      titleTest: options.titleTest ?? false, benchMode: options.benchMode ?? false,
      slashCommand: { overrides: { toolAllowlist: options.allowlist } }, body: {},
      messagesForModel: [], repairedMessages: [], lastUserText: "hello", cwd: "fixture-only",
    };
    return module.exports.prepareAgentTurnRuntime({
      request, scope: { actionScope: { pinnedLatestAll: [] } },
      model: {}, modelId: "fixture-only", abortSignal: options.abortSignal,
    } as Parameters<Prepare>[0]);
  };
  return { probe, prepare };
}

test("an explicit empty command selection acquires no MCP client in Agent or Ask", async () => {
  for (const mode of ["agent", "ask"] as const) {
    const run = fixture();
    const runtime = await run.prepare({ mode, allowlist: [] });
    assert.deepEqual(Object.keys(runtime.tools), []);
    assert.equal(run.probe.loads, 0);
    assert.equal(run.probe.connections, 0);
    await runtime.dispose();
    assert.equal(run.probe.disposals, 0);
  }
});

test("an omitted restriction still loads MCP and an unknown explicit MCP name is retained", async () => {
  for (const mode of ["agent", "ask"] as const) {
    for (const allowlist of [undefined, ["mcp__fixture__read"]]) {
      const run = fixture();
      const runtime = await run.prepare({ mode, allowlist });
      assert.equal(run.probe.loads, 1);
      assert.equal(run.probe.connections, 1);
      assert.ok(runtime.tools.mcp__fixture__read);
      if (allowlist) assert.deepEqual(Object.keys(runtime.tools), allowlist);
      await runtime.dispose();
      assert.equal(run.probe.disposals, 1);
    }
  }
});

test("the existing title, benchmark and Launcher gates still acquire no MCP client", async () => {
  for (const options of [{ titleTest: true }, { benchMode: true }, { mode: "launcher" as const }]) {
    const run = fixture();
    const runtime = await run.prepare(options);
    assert.equal(run.probe.loads, 0);
    assert.equal(run.probe.connections, 0);
    await runtime.dispose();
  }
});

test("a cancelled turn stops before connection and another turn remains independent", async () => {
  const cancelled = fixture(), other = fixture(), parent = new AbortController();
  const reason = new Error("fixture cancelled"); parent.abort(reason);
  await assert.rejects(cancelled.prepare({ abortSignal: parent.signal }), (failure) => failure === reason);
  assert.equal(cancelled.probe.loads, 0); assert.equal(cancelled.probe.connections, 0);
  const runtime = await other.prepare();
  assert.equal(other.probe.connections, 1);
  await runtime.dispose();
  assert.equal(other.probe.disposals, 1);
});
