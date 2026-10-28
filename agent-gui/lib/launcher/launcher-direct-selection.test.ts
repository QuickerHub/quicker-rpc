import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { before, test } from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
import { defaultLauncherToolIds } from "../chat-mode";
import type { ResolvedAgentTurnRequest } from "../agent-harness/turn-request.server";
import type { LauncherCommandCacheEntry } from "./launcher-command-cache-core";
import type { LauncherResolveCandidate } from "./launcher-resolve-presets";

type Probe = {
  cacheLoads: number;
  cacheHits: string[];
  resolveCalls: number;
  approvalCalls: string[];
  dispatched: string[];
  entries: LauncherCommandCacheEntry[];
  candidates: LauncherResolveCandidate[];
  requiresApproval: string[];
};
let compiled = "";

// Exercise the production request-to-direct adapter and both direct paths. The
// outer turn runner exposes its adapter; only resource/execution ports are fake.
const resourcePorts: Record<string, string> = {
  "server-only": "",
  "@/lib/agent-harness/turn-runner": "export const createAgentTurnRunner=services=>services.tryDirectResponse;",
  "@/lib/agent-harness/turn-request.server": "export const resolveAgentTurnRequest=()=>{throw Error('Unexpected request resolution')};",
  "@/lib/agent-harness/turn-runtime.server": "export const prepareAgentTurnRuntime=()=>{throw Error('Unexpected model runtime')};export const resolveAgentTurnScope=()=>{throw Error('Unexpected scope resolution')};",
  "@/lib/agent-harness/stream-loop.server": "export const runAgentStreamLoop=()=>{throw Error('Unexpected model loop')};",
  "@/lib/llm": "export const isLlmSelectionConfigured=()=>false;export const resolveChatModelForSelection=()=>{throw Error('Unexpected model')};",
  "@/lib/llm-config": "export const isLlmProviderHidden=()=>false;",
  "@/lib/qkrpc-request-context": "export const runWithAgentRequestContextAsync=async(_context,run)=>run();",
  "@/lib/launcher/launcher-command-cache.server": `
    export const loadLauncherCommandCache=()=>{probe.cacheLoads++;return {entries:probe.entries}};
    export const recordLauncherCommandCacheHits=ids=>{probe.cacheHits.push(...ids)};`,
  "@/lib/launcher/launcher-resolve-core": "export const resolveLauncherCandidates=async()=>{probe.resolveCalls++;return {ok:true,candidates:probe.candidates}};",
  "@/lib/tool-execute.server": "export const executeQuickerToolDirect=async params=>{probe.dispatched.push(params.toolName);return {ok:true,output:{fixture:true}}};",
  "@/lib/tools": `
    export const allQuickerTools=Object.fromEntries(['Read','Write','quicker_settings','qkrpc_action_run','qkrpc_action_delete'].map(id=>[id,{
      execute:async()=>{throw Error('The execution port must own dispatch')},
      needsApproval:()=>{probe.approvalCalls.push(id);return probe.requiresApproval.includes(id)}
    }]));`,
};

before(async () => {
  const result = await build({
    stdin: { contents: "export { runAgentChatTurn as direct } from '../agent-harness/run-turn.server';", resolveDir: import.meta.dirname, loader: "ts" },
    bundle: true, write: false, platform: "node", format: "cjs", metafile: true,
    external: ["ai"], tsconfig: path.resolve(import.meta.dirname, "../../tsconfig.json"),
    plugins: [{ name: "owned-launcher-resource-ports", setup(builder) {
      builder.onResolve({ filter: /.*/ }, (args) => args.path in resourcePorts
        ? { path: args.path, namespace: "resource-port" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "resource-port" }, (args) => ({
        contents: resourcePorts[args.path], loader: "ts", resolveDir: path.resolve(import.meta.dirname, "../.."),
      }));
    } }],
  });
  for (const input of Object.keys(result.metafile!.inputs)) {
    if (input.startsWith("resource-port:")) continue;
    assert.doesNotMatch(input.replaceAll("\\", "/"), /(?:^|\/)lib\/(?:db\/|llm(?:[./-])|tools\.ts$|qkrpc\.ts$|tool-execute\.server\.ts$|launcher\/(?:launcher-command-cache\.server|launcher-resolve-core)\.ts$)/,
      "The fixture must not import user configuration, host adapters or real execution");
  }
  compiled = result.outputFiles[0]!.text;
});

function fixture() {
  const probe: Probe = { cacheLoads: 0, cacheHits: [], resolveCalls: 0, approvalCalls: [], dispatched: [], entries: [], candidates: [], requiresApproval: [] };
  const module = { exports: {} as { direct(request: ResolvedAgentTurnRequest): Promise<Response | null> } };
  vm.runInNewContext(compiled, { module, exports: module.exports, probe, require: createRequire(import.meta.url), Response, process: { env: {} } });
  const request = (enabledToolIds = defaultLauncherToolIds(), bodyEnabledTools?: string[]): ResolvedAgentTurnRequest => ({
    body: { messages: [], ...(bodyEnabledTools === undefined ? {} : { enabledTools: bodyEnabledTools }) },
    chatMode: "launcher", cwd: "owned-fixture", enabledToolIds, titleTest: false, benchMode: false,
    repairedMessages: [], messagesForModel: [], slashCommand: { expandedUserText: null, overrides: {}, commandName: null },
    selection: { kind: "profile", profileId: "fixture", modelId: "fixture" }, lastUserText: "owned shortcut",
  });
  const run = async (input = request()) => {
    const response = await module.exports.direct(input);
    if (response) await response.text();
    return response;
  };
  return { probe, request, run };
}

function entry(...toolNames: string[]): LauncherCommandCacheEntry {
  return { id: "owned-cache", trigger: "owned shortcut", steps: toolNames.map(toolName => ({ toolName, input: {} })),
    createdAt: "fixture", updatedAt: "fixture", useCount: 0 };
}

function candidate(tool = "quicker_settings"): LauncherResolveCandidate {
  return { kind: "settings", title: "Owned candidate", score: 1000, suggestedTool: tool, suggestedInput: {} };
}

test("explicit HTTP empty selection suppresses every direct probe despite legacy normalized defaults", async () => {
  const f = fixture(); f.probe.entries = [entry("quicker_settings")]; f.probe.candidates = [candidate()];
  assert.equal(await f.run(f.request(defaultLauncherToolIds(), [])), null);
  assert.equal(f.probe.cacheLoads, 0); assert.equal(f.probe.resolveCalls, 0);
  assert.deepEqual(f.probe.dispatched, []); assert.deepEqual(f.probe.cacheHits, []);
});

test("an empty normalized selection cannot start a shortcut or resolver", async () => {
  const f = fixture(); f.probe.entries = [entry("quicker_settings")]; f.probe.candidates = [candidate()];
  assert.equal(await f.run(f.request([])), null);
  assert.equal(f.probe.cacheLoads, 0); assert.equal(f.probe.resolveCalls, 0); assert.deepEqual(f.probe.dispatched, []);
});

test("a cache chain with a later unselected step performs no prefix execution or hit write", async () => {
  const f = fixture(); f.probe.entries = [entry("Read", "Write")];
  assert.equal(await f.run(f.request(["Read"])), null);
  assert.deepEqual(f.probe.approvalCalls, []); assert.deepEqual(f.probe.dispatched, []); assert.deepEqual(f.probe.cacheHits, []);
  assert.equal(f.probe.resolveCalls, 0);
});

test("resolver discovery itself requires the selected launcher_resolve capability", async () => {
  const f = fixture(); f.probe.candidates = [candidate()];
  assert.equal(await f.run(f.request(["quicker_settings"])), null);
  assert.equal(f.probe.resolveCalls, 0); assert.deepEqual(f.probe.dispatched, []);
});

test("a selected resolver cannot execute its unselected recommendation", async () => {
  const f = fixture(); f.probe.candidates = [candidate()];
  assert.equal(await f.run(f.request(["launcher_resolve"])), null);
  assert.equal(f.probe.resolveCalls, 1); assert.deepEqual(f.probe.approvalCalls, []); assert.deepEqual(f.probe.dispatched, []);
});

test("the default launcher preserves cache and resolver shortcuts", async () => {
  const cached = fixture(); cached.probe.entries = [entry("quicker_settings", "qkrpc_action_run")];
  assert.ok(await cached.run());
  assert.deepEqual(cached.probe.dispatched, ["quicker_settings", "qkrpc_action_run"]);
  assert.deepEqual(cached.probe.cacheHits, ["owned-cache"]); assert.equal(cached.probe.resolveCalls, 0);
  const resolved = fixture(); resolved.probe.candidates = [candidate()];
  assert.ok(await resolved.run());
  assert.equal(resolved.probe.resolveCalls, 1); assert.deepEqual(resolved.probe.dispatched, ["quicker_settings"]);
});

test("an explicitly selected subset preserves only its permitted shortcut", async () => {
  const cached = fixture(); cached.probe.entries = [entry("Read")];
  assert.ok(await cached.run(cached.request(["Read"])));
  assert.deepEqual(cached.probe.dispatched, ["Read"]); assert.equal(cached.probe.resolveCalls, 0);
  const resolved = fixture(); resolved.probe.candidates = [candidate()];
  assert.ok(await resolved.run(resolved.request(["launcher_resolve", "quicker_settings"])));
  assert.equal(resolved.probe.resolveCalls, 1); assert.deepEqual(resolved.probe.dispatched, ["quicker_settings"]);
});

test("a selected chain still requires approval and never partially dispatches", async () => {
  const f = fixture(); f.probe.entries = [entry("Read", "qkrpc_action_delete")]; f.probe.requiresApproval = ["qkrpc_action_delete"];
  assert.equal(await f.run(f.request(["Read", "qkrpc_action_delete"])), null);
  assert.deepEqual(f.probe.dispatched, []); assert.deepEqual(f.probe.cacheHits, []); assert.equal(f.probe.resolveCalls, 0);
});

test("non-launcher, title-only and live-document turns never enter launcher shortcuts", async () => {
  for (const patch of [{ chatMode: "agent" as const }, { titleTest: true }, { liveProgramDocument: { state: "unavailable" as const, code: "fixture", error: "fixture", retryable: false as const } }]) {
    const f = fixture(); f.probe.entries = [entry("quicker_settings")];
    assert.equal(await f.run({ ...f.request(), ...patch }), null);
    assert.equal(f.probe.cacheLoads, 0); assert.equal(f.probe.resolveCalls, 0); assert.deepEqual(f.probe.dispatched, []);
  }
});
