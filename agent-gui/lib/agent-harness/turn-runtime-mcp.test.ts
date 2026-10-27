import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { before, test } from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
import type { ChatMode } from "@/lib/chat-mode";
import type { PreparedAgentTurnRuntime } from "./turn-runtime.server";
import type { AgentUIMessage } from "@/lib/chat-types";
import { asSchema, type ToolExecutionOptions } from "ai";
import { formatLocalToolResult, isStructuredToolResult } from "@/lib/tool-result";
import type { LiveProgramDocumentSelection } from "@/lib/live-program-document";

type Probe = { loads: number; connections: number; disposals: number;
  plans: Array<{ enabledToolIds: readonly string[]; readOnlyExecutorToolIds?: readonly string[] }>;
  baseCalls: unknown[]; readCalls: unknown[]; referenceText: string };
type Prepare = typeof import("./turn-runtime.server").prepareAgentTurnRuntime;
let compiled = "";

// Run the production composition, selector, command intersection, mode guard and
// call-policy wrappers. Only resource ports are replaced; no config, DB or MCP
// implementation is imported, and the connect fixture cannot open a transport.
const resourcePorts: Record<string, string> = {
  "server-only": "",
  "@/lib/agent-turn-runtime": `
    import { jsonSchema } from 'ai';
    import { LIST_TOOLS_TOOL_DEF } from '@/lib/list-tools-tool.server';
    import { buildSystemInstructions } from '@/lib/instructions';
    import { selectChatToolsFromRegistry } from '@/lib/chat-tool-selection';
    const definition = { inputSchema: jsonSchema({type:'object',properties:{path:{type:'string'}}}), execute: async () => {probe.baseCalls.push('fixture');return 'fixture'} };
    const tools = Object.fromEntries(['Read','Write','skill_load','set_thread_title','qkrpc_step_runner_get','qkrpc_action_save'].map(id=>[id,definition]));
    tools.list_tools=LIST_TOOLS_TOOL_DEF;
    tools.workspace_program={description:'Legacy disk program operations',inputSchema:jsonSchema({type:'object',properties:{action:{enum:['read_data','write_data','patch','diagnostics']}},required:['action']}),execute:async input=>{probe.baseCalls.push(input);return {ok:true,exitCode:0,source:'local',data:input}}};
    export const selectChatTools = params => selectChatToolsFromRegistry(tools, params);
    export const createChatSystemBuilder = async params => { const system = await buildSystemInstructions(undefined, params.chatMode);return () => system; };`,
  "@/lib/action-authoring-docs": "export const formatAuthoringSkillForPrompt=async()=>'';",
  "@/lib/agent-skills/prompt-catalog": "export const formatPreloadedSkillsEssentialsForPrompt=async()=>'';export const isPreloadedSkillBodyInPromptEnabled=()=>false;",
  "@/lib/agent-skills/prompt": "export const formatSkillCatalogForPrompt=async()=>'';",
  "@/lib/agent-defs": "export const discoverAgentDefs=async()=>({agents:[]});export const formatSubagentsCatalogBlock=()=>'';export const formatWorkspaceInstructionsForPrompt=()=>'';export const loadWorkspaceInstructions=async()=>null;",
  "@/lib/agent-core/turn-plan": `
    import { resolveTurnPlan as actualResolveTurnPlan } from './lib/agent-core/turn-plan.ts';
    export const resolveTurnPlan = params => {probe.plans.push(params);return actualResolveTurnPlan(params);};`,
  "@/lib/context-compaction-reinject.server": "export const buildPostCompactReinjectBlock=()=>'';",
  "@/lib/designer-context.server": "export const fetchDesignerContextSnapshot=async()=>{throw Error('No host in fixture')};",
  "@/lib/designer-embed-layout": "export const resolveDesignerWindowContext=()=>undefined;",
  "@/lib/designer-embed-prompt": "export const formatDesignerEmbedContextForSystem=()=>'';export const mergeDesignerDefaultActionScope=x=>x;",
  "@/lib/llm-context-limits": "export const resolveModelContextLimit=()=>({tokens:10000});",
  "@/lib/agent-harness/context-pipeline": "export const prepareContextPipeline=async()=>({modelMessages:[],compressed:false});",
  "@/lib/agent-harness/tool-execution-context": "export const buildToolExecutionContext=x=>x;",
  "@/lib/agent-mcp/load.server": `
    import { jsonSchema } from 'ai';
    async function connectFixture(){probe.connections++;return {close:async()=>{probe.disposals++}};}
    export async function loadConfiguredMcpTools(_cwd,options){
      options.abortSignal?.throwIfAborted();probe.loads++;
      const client=await connectFixture();
      const catalog=(serverName,text)=>({source:{serverName,configPath:'fixture',transport:'http',workspaceCwd:_cwd},
        serverInfo:{name:'current-server',version:null},pageCount:1,tools:[{name:'read',inputSchema:{type:'object'}}],
        guidance:{state:'available',text,revision:'body-'+text,retrievedAt:'this-turn'}});
      return {tools:{mcp__fixture__read:{description:'Actual current MCP schema',inputSchema:jsonSchema({type:'object',properties:{current:{type:'string'}},required:['current']}),execute:async()=>{probe.baseCalls.push('MCP');return 'fixture MCP read'}}},
        catalogs:[catalog('fixture',probe.referenceText),catalog('not_selected','HIDDEN SERVER INSTRUCTIONS')],
        callPolicyOverrides:{},diagnostics:[],dispose:()=>client.close()};
    }`,
  "@/lib/task-tool.server": "export const TASK_TOOL='task';export const createTaskToolForParent=()=>{throw Error('No child loop in fixture')};",
  "@/lib/qkrpc-action-tool.server": "export const executeQkrpcActionGetReadOnly=()=>{throw Error('No host in fixture')};",
  "@/lib/qkrpc-subprogram-tool.server": "export const executeQkrpcSubprogramGetReadOnly=()=>{throw Error('No host in fixture')};",
  "@/lib/workspace-program-tool.server": "export const executeWorkspaceProgramReadOnly=input=>{probe.readCalls.push(input);return {ok:true,exitCode:0,source:'local',data:input}};",
};

before(async () => {
  const result = await build({
    stdin: { contents: `export { prepareAgentTurnRuntime } from './turn-runtime.server';
      export { selectSubagentTools } from '../task-tool-capabilities';`, resolveDir: import.meta.dirname, loader: "ts" },
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
  const probe: Probe = { loads: 0, connections: 0, disposals: 0, plans: [], baseCalls: [], readCalls: [], referenceText: "CURRENT SERVER KNOWLEDGE" };
  const module = { exports: {} as { prepareAgentTurnRuntime: Prepare;
    selectSubagentTools: typeof import("../task-tool-capabilities").selectSubagentTools } };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, probe, require: createRequire(import.meta.url),
    process: { env: { NODE_ENV: "production" } },
  });
  const prepare = (options: {
    mode?: ChatMode; allowlist?: string[]; titleTest?: boolean; benchMode?: boolean; abortSignal?: AbortSignal;
    enabledToolIds?: string[]; messages?: AgentUIMessage[]; liveProgramDocument?: LiveProgramDocumentSelection;
  } = {}): Promise<PreparedAgentTurnRuntime> => {
    const request = {
      chatMode: options.mode ?? "agent", enabledToolIds: options.enabledToolIds ?? ["Read"],
      titleTest: options.titleTest ?? false, benchMode: options.benchMode ?? false,
      slashCommand: { overrides: { toolAllowlist: options.allowlist } }, body: {},
      messagesForModel: [], repairedMessages: options.messages ?? [], lastUserText: "hello", cwd: "fixture-only",
      liveProgramDocument: options.liveProgramDocument,
    };
    return module.exports.prepareAgentTurnRuntime({
      request, scope: { actionScope: { pinnedLatestAll: [] } },
      model: {}, modelId: "fixture-only", abortSignal: options.abortSignal,
    } as Parameters<Prepare>[0]);
  };
  return { probe, prepare, selectChildTools: module.exports.selectSubagentTools };
}

test("the actual live runtime prompt and client definition describe input edits while Ask remains read-only", async () => {
  for (const mode of ["agent", "ask"] as const) {
    const run = fixture();
    const selection: LiveProgramDocumentSelection = { state: "ready", scope: {
      version: 1, scopeId: "original-live-scope", threadId: "thread", userMessageId: "manual", cwd: "fixture-only",
      mode: mode === "ask" ? "read" : "edit", target: {
        owner: { key: "owner", instanceId: 1, cwd: "fixture-only", tabId: "data", path: ".quicker/actions/fixture/data.json" },
        sessionId: "original-session", identity: { documentKey: "original-live-document", projectBinding: null },
      },
    } };
    const runtime = await run.prepare({ mode, enabledToolIds: ["workspace_program", "Read"], liveProgramDocument: selection });
    try {
      const system = runtime.buildSystemForPreparedContext({});
      assert.doesNotMatch(system, /CURRENT SERVER KNOWLEDGE|MCP provider reference material/);
      const description = runtime.tools.workspace_program?.description ?? "";
      assert.equal(run.probe.loads, 0); assert.equal(runtime.tools.workspace_program?.execute, undefined);
      assert.match(system, /original-live-document/); assert.match(system, /original-live-scope/);
      assert.match(system, /stepSchemaFor/); assert.match(description, /stepSchemaFor/);
      assert.doesNotMatch(system, /only changes a uniquely identified step's note/);
      if (mode === "agent") { assert.match(system, /edit_step_inputs_live/); assert.match(description, /edit_step_inputs_live/); }
      else { assert.match(system, /read-only/); assert.doesNotMatch(system, /edit_step_inputs_live/); }
    } finally { await runtime.dispose(); }
  }
});

test("production runtime discovery returns the live variable schema and child discovery cannot restore disk tools", async () => {
  const run = fixture();
  const selection: LiveProgramDocumentSelection = { state: "ready", scope: {
    version: 1, scopeId: "catalog-live", threadId: "thread", userMessageId: "manual", cwd: "fixture-only",
    mode: "edit", target: {
      owner: { key: "owner", instanceId: 1, cwd: "fixture-only", tabId: "data", path: ".quicker/actions/fixture/data.json" },
      sessionId: "original-session", identity: { documentKey: "original-live-document", projectBinding: null },
    },
  } };
  const runtime = await run.prepare({ enabledToolIds: ["workspace_program", "Read"], liveProgramDocument: selection });
  try {
    const options = { toolCallId: "catalog-live", messages: [] } as ToolExecutionOptions;
    const response = await runtime.tools.list_tools.execute!({ action: "get", toolId: "workspace_program" }, options);
    assert.ok(isStructuredToolResult(response)); assert.equal(response.ok, true);
    const data = response.data as Record<string, unknown>;
    assert.deepEqual(JSON.parse(JSON.stringify(data.inputSchema)), JSON.parse(JSON.stringify(await asSchema(runtime.tools.workspace_program.inputSchema).jsonSchema)));
    assert.match(JSON.stringify(data.inputSchema), /edit_variable_live/);
    assert.match(JSON.stringify(data.inputSchema), /catalog-live/);
    assert.doesNotMatch(JSON.stringify(data.inputSchema), /write_data|"patch"/);
    assert.equal(runtime.tools.workspace_program.execute, undefined);
    const child = run.selectChildTools(runtime.tools, ["Read", "workspace_program", "list_tools"]);
    assert.equal(child.workspace_program, undefined);
    const childIndex = await child.list_tools.execute!({ action: "index" }, options);
    assert.ok(isStructuredToolResult(childIndex));
    assert.deepEqual(Array.from((childIndex.data as { toolIds: string[] }).toolIds).sort(), ["Read", "list_tools"]);
    const denied = await child.list_tools.execute!({ action: "get", toolId: "workspace_program" }, options);
    assert.ok(isStructuredToolResult(denied)); assert.equal(denied.ok, false);
    assert.equal(run.probe.connections, 0); assert.deepEqual(run.probe.baseCalls, []);
  } finally { await runtime.dispose(); }
});

test("current MCP schemas are discoverable without calling tools or opening another connection", async () => {
  const run = fixture();
  const runtime = await run.prepare({ enabledToolIds: ["Read"], allowlist: ["Read", "list_tools", "mcp__fixture__read"] });
  try {
    const before = run.probe.connections;
    const options = { toolCallId: "catalog-mcp", messages: [] } as ToolExecutionOptions;
    const result = await runtime.tools.list_tools.execute!({ action: "get", toolId: "mcp__fixture__read" }, options);
    assert.ok(isStructuredToolResult(result)); assert.equal(result.ok, true);
    const data = result.data as Record<string, unknown>;
    assert.deepEqual(data.inputSchema, await asSchema(runtime.tools.mcp__fixture__read.inputSchema).jsonSchema);
    assert.equal(data.risk, "unknown"); assert.equal(data.group, undefined);
    const child = run.selectChildTools(runtime.tools, ["list_tools", "mcp__fixture__read"]);
    for (const action of ["index", "bundles", "routing", "bundle"] as const) {
      const catalog = await child.list_tools.execute!({ action, bundleId: "action_authoring" }, options);
      assert.ok(isStructuredToolResult(catalog)); assert.equal(catalog.ok, true);
      assert.doesNotMatch(JSON.stringify(catalog.data), /qkrpc_action_save|write_data|"Read"/);
    }
    assert.equal(run.probe.connections, before); assert.deepEqual(run.probe.baseCalls, []);
  } finally { await runtime.dispose(); }
});

test("Ask discovery reports the same operation limits as execution and TurnPlan", async () => {
  const run = fixture();
  const runtime = await run.prepare({ mode: "ask", benchMode: true,
    enabledToolIds: ["workspace_program", "qkrpc_step_runner_get", "qkrpc_action_save"] });
  try {
    const options = { toolCallId: "ask-catalog", messages: [] } as ToolExecutionOptions;
    const result = await runtime.tools.list_tools.execute!({ action: "get", toolId: "workspace_program" }, options);
    assert.ok(isStructuredToolResult(result)); assert.equal(result.ok, true);
    const policy = (result.data as { operationPolicy: { allowedActions: string[] } }).operationPolicy;
    assert.ok(policy.allowedActions.includes("read_data"));
    assert.ok(!policy.allowedActions.includes("read_live"));
    assert.ok(!policy.allowedActions.includes("patch")); assert.ok(!policy.allowedActions.includes("diagnostics"));
    for (const id of ["qkrpc_step_runner_get", "qkrpc_action_save"]) {
      const catalog = await runtime.tools.list_tools.execute!({ action: "get", toolId: id }, options);
      assert.ok(isStructuredToolResult(catalog)); assert.equal(catalog.ok, false);
      const execution = await runtime.tools[id].execute!({}, options);
      assert.ok(isStructuredToolResult(execution)); assert.equal(execution.ok, false);
    }
    for (const action of ["diagnostics", "read_live", "patch"]) {
      const denied = await runtime.tools.workspace_program.execute!({ action }, options);
      assert.ok(isStructuredToolResult(denied)); assert.equal(denied.ok, false);
    }
    assert.equal(run.probe.connections, 0); assert.deepEqual(run.probe.baseCalls, []); assert.deepEqual(run.probe.readCalls, []);
    const system = await runtime.buildSystemForPreparedContext(runtime.preparedContext);
    assert.match(system, /current execution catalog|current catalog/);
    assert.doesNotMatch(system, /read_data\/diagnostics only|quicker_settings list\/get\/search/);
  } finally { await runtime.dispose(); }
});

test("an explicit empty command selection acquires no MCP client in Agent or Ask", async () => {
  for (const mode of ["agent", "ask"] as const) {
    const run = fixture();
    const runtime = await run.prepare({ mode, allowlist: [] });
    assert.deepEqual(Object.keys(runtime.tools), []);
    assert.equal(run.probe.loads, 0);
    assert.equal(run.probe.connections, 0);
    assert.doesNotMatch(runtime.buildSystemForPreparedContext({}), /CURRENT SERVER KNOWLEDGE|MCP provider reference material/);
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
      const system = runtime.buildSystemForPreparedContext({});
      assert.match(system, /CURRENT SERVER KNOWLEDGE/);
      assert.match(system, /"read":"mcp__fixture__read"/);
      assert.doesNotMatch(system, /HIDDEN SERVER INSTRUCTIONS/);
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
    assert.doesNotMatch(runtime.buildSystemForPreparedContext({}), /CURRENT SERVER KNOWLEDGE|MCP provider reference material/);
    await runtime.dispose();
  }
});

test("the next turn uses new initialized instructions without caching by reported server version", async () => {
  const run = fixture();
  const first = await run.prepare();
  run.probe.referenceText = "NEW CURRENT KNOWLEDGE";
  const second = await run.prepare();
  try {
    assert.match(first.buildSystemForPreparedContext({}), /CURRENT SERVER KNOWLEDGE/);
    assert.doesNotMatch(first.buildSystemForPreparedContext({}), /NEW CURRENT KNOWLEDGE/);
    assert.match(second.buildSystemForPreparedContext({}), /NEW CURRENT KNOWLEDGE/);
    assert.doesNotMatch(second.buildSystemForPreparedContext({}), /CURRENT SERVER KNOWLEDGE/);
    assert.equal(run.probe.connections, 2);
  } finally { await first.dispose(); await second.dispose(); }
  assert.equal(run.probe.disposals, 2);
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

test("the runtime resolves one recovery plan from its final command set and real read-only port composition", async () => {
  for (const row of [
    { mode: "agent", action: "diagnostics", allowlist: [] as string[], allowed: false },
    { mode: "ask", action: "diagnostics", allowlist: ["workspace_program"], allowed: false },
    { mode: "ask", action: "read_data", allowlist: ["workspace_program"], allowed: true },
    { mode: "agent", action: "diagnostics", allowlist: ["workspace_program"], allowed: true },
  ] as const) {
    const run = fixture();
    const messages = [{ id: "recovery", role: "assistant", parts: [{
      type: "tool-workspace_program", toolCallId: "prior-write", state: "output-available", input: { action: "patch" },
      output: formatLocalToolResult({ action: "program-patch" }, true, undefined, { nextActions: [{
        tool: "workspace_program", reason: "Verification remains required.", priority: "required", input: { action: row.action },
      }] }),
    }] }] as AgentUIMessage[];
    const runtime = await run.prepare({ mode: row.mode, enabledToolIds: ["workspace_program"], allowlist: [...row.allowlist], messages });
    try {
      const plan = runtime.runtimeSnapshot.turnPlan;
      assert.equal(run.probe.plans.length, 1, "the production composition resolves one plan");
      assert.deepEqual(Array.from(run.probe.plans[0].enabledToolIds), Object.keys(runtime.tools));
      assert.ok(run.probe.plans[0].readOnlyExecutorToolIds?.includes("workspace_program"));
      assert.equal(runtime.runtimeSnapshot.recoveryDecision, plan.recoveryDecision);
      assert.ok(plan.requiredToolIds.includes("workspace_program"));
      if (row.allowed) {
        assert.equal(plan.nextAction?.input?.action, row.action);
        assert.equal(plan.blockedNextAction, undefined);
      } else {
        assert.equal(plan.nextAction, undefined);
        assert.equal(plan.blockedNextAction?.action.input?.action, row.action);
        assert.equal(plan.recoveryDecision.kind, "ask_user");
      }
      const execute = runtime.tools.workspace_program?.execute;
      if (execute) {
        const result = await execute({ action: row.action }, { toolCallId: "new-operation", messages: [] } as ToolExecutionOptions);
        assert.ok(isStructuredToolResult(result)); assert.equal(result.ok, row.allowed);
      }
      assert.equal(run.probe.baseCalls.length, row.allowed && row.mode === "agent" ? 1 : 0);
      assert.equal(run.probe.readCalls.length, row.allowed && row.mode === "ask" ? 1 : 0);
    } finally { await runtime.dispose(); }
  }
});
