import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { syncBuiltinESMExports } from "node:module";
import { build } from "esbuild";

const repo = resolve(import.meta.dirname, "../..");
const envKeys = ["QKRPC_HTTP_URL", "QKRPC_TRANSPORT", "QKRPC_BIN", "QKRPC_CWD", "QKRPC_REPO_ROOT", "AGENT_GUI_ROOT", "QKRPC_HOST_BINDING"];
const savedEnv = envKeys.map(key => process.env[key]);
const realFetch = globalThis.fetch;
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
let owned: string;
let api: any;
let requests: Array<{ url: string; init?: RequestInit; body: any }>;
let response: (url: string, init?: RequestInit) => Promise<Response>;
const binding = { hostInstanceId: "fixture", hostSessionId: "a".repeat(32), endpoint: "fixture_endpoint", protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "fixture", capabilities: {} };

function payload(label = "one", markdown = `# Gateway ${label}`) {
  return { ok: true, success: true, action: "guide-get", topic: "program-source", title: `Gateway ${label}`, markdown,
    codec: { schemaVersion: 1, source: { provider: "qkrpc.program-source-codec", kind: "local-codec", assemblyName: "fixture.codec", assemblyVersion: label,
      informationalVersion: `${label}+fixture`, moduleVersionId: `module-${label}`, identityStatus: "known" },
      formats: { inputs: [`dynamic-${label}`, "legacy-dynamic"], output: `dynamic-${label}`, omittedInput: "legacy-compatible" }, nativeSource: { status: "unknown", read: null, write: null }, descriptorRevision: `revision-${label}` },
    provenance: { schemaVersion: 1, source: { provider: "qkrpc.guide", kind: "bundled-fallback", assemblyName: "fixture.guide", bundleVersion: label }, indexRevision: `index-${label}`, contentRevision: `content-${label}` },
  };
}

before(async () => {
  await mkdir(join(repo, ".tmp"), { recursive: true }); owned = await mkdtemp(join(repo, ".tmp/gateway-guide-test-"));
  const skill = join(owned, "docs/skills/quicker-authoring");
  await mkdir(join(skill, "references"), { recursive: true }); await mkdir(join(owned, "QuickerRpc")); await mkdir(join(owned, "agent-gui"));
  await writeFile(join(owned, "QuickerRpc/version.json"), '{"release":"1.0.0","build":0}');
  await writeFile(join(skill, "SKILL.md"), "---\nname: quicker-authoring\ndescription: fixture\n---\n# Router");
  await writeFile(join(skill, "topics.json"), JSON.stringify({ topics: [{ topic: "program-source", description: "local fixture" }] }));
  await writeFile(join(skill, "references/program-source.md"), "# LOCAL_ONLY guide");
  await writeFile(join(owned, "fake-cli-a.exe"), "owned fixture"); await writeFile(join(owned, "fake-cli-b.exe"), "owned fixture");
  // The production resolver/dispatcher run; only artifact discovery ports cannot stage or inspect a real installation.
  await writeFile(join(owned, "qkrpc-bin.mjs"), `export function resolveQkrpcBin(){throw Error('staging forbidden')};export function resolveBundledQkrpcSourceDir(){return null};export function resolveUserInstalledQkrpcExe(){return null};export function resolveQkrpcFromPath(){return null}`);
  const output = join(owned, "fixture.mjs");
  await build({ stdin: { contents: `export * from '@/lib/docs-tool.server';export * from '@/lib/docs-tool';export * from '@/lib/docs-catalog-api';export {GET} from '@/app/api/docs/[topic]/route';export * from '@/lib/qkrpc-request-context';export * from '@/lib/qkrpc-connectivity-gate';export * from '@/lib/qkrpc-host-binding';export * from '@/lib/program-turn-context';export * from '@/lib/tool-result-model-messages';export * from '@/lib/gateway-guide-projection';export * from '@/lib/agent-tool-mode-guard';`, resolveDir: join(repo, "agent-gui") },
    outfile: output, bundle: true, platform: "node", format: "esm", tsconfig: join(repo, "agent-gui/tsconfig.json"), plugins: [{ name: "gateway-owned-ports", setup(builder) {
      builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" }));
      builder.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "", loader: "js" }));
    } }],
  });
  api = await import(pathToFileURL(output).href);
});
beforeEach(() => {
  process.env.QKRPC_HTTP_URL = "http://gateway-one.invalid:9477"; process.env.QKRPC_TRANSPORT = "http";
  process.env.QKRPC_BIN = join(owned, "fake-cli-a.exe"); process.env.QKRPC_CWD = owned;
  process.env.QKRPC_REPO_ROOT = owned; process.env.AGENT_GUI_ROOT = join(owned, "agent-gui");
  delete process.env.QKRPC_HOST_BINDING;
  requests = []; response = async () => Response.json({ ok: true, data: payload() });
  globalThis.fetch = async (input, init) => {
    const url = String(input); const body = JSON.parse(String(init?.body ?? "{}"));
    requests.push({ url, init, body });
    assert.equal(body.op, "guide.get", "No host discovery, wait, bootstrap or repair is permitted");
    assert.deepEqual(body.args, { topic: "program-source" }); assert.equal(body.hostBinding, undefined);
    assert.equal(init?.redirect, "error");
    return response(url, init);
  };
});
afterEach(() => { globalThis.fetch = realFetch; mock.restoreAll(); syncBuiltinESMExports(); });
after(async () => {
  envKeys.forEach((key, i) => { if (savedEnv[i] === undefined) delete process.env[key]; else process.env[key] = savedEnv[i]; });
  assert.ok(owned.startsWith(join(repo, ".tmp/gateway-guide-test-"))); await rm(owned, { recursive: true, force: true });
});
const input = { action: "get", topic: "program-source", source: "gateway" };
const execute = (extra?: object, signal?: AbortSignal) => api.DOCS_TOOL_DEF.execute({ ...input, ...extra }, { toolCallId: "fixture", messages: [], abortSignal: signal });
const display = (output: any) => output.displayData ?? output.data;

test("actual SDK docs reads current gateway metadata through blocked Ask context without binding a host", async () => {
  await api.runWithAgentRequestContextAsync({ cwd: owned, chatMode: "ask" }, async () => {
    api.markQkrpcConnectivityBlockedThisTurn();
    const tools = api.applyToolModeGuards({ docs: api.DOCS_TOOL_DEF }, "ask");
    const result = await tools.docs.execute(input, { toolCallId: "ask", messages: [] });
    assert.equal(result.ok, true); assert.equal(result.data.guideSource, "gateway");
    assert.deepEqual(result.data.gatewayKnowledge.codec, payload().codec); assert.deepEqual(result.data.gatewayKnowledge.provenance, payload().provenance);
    assert.equal(result.data.gatewayKnowledge.status, "available"); assert.ok(Date.parse(result.data.gatewayKnowledge.retrievedAt));
    assert.equal(api.currentQkrpcTarget(), undefined); assert.equal(api.isQkrpcConnectivityBlockedThisTurn(), true);
    assert.equal(api.getDocsCallCountThisTurn(), 1); assert.equal(requests.length, 1);
  });
});

test("default/local docs and invalid gateway operations never dispatch", async () => {
  const local = await api.executeDocsTool({ action: "get", topic: "program-source" });
  assert.match(local.data.markdown, /LOCAL_ONLY/); assert.equal(local.data.guideSource, "local");
  for (const extra of [{ action: "index" }, { action: "search", query: "yaml" }, { topic: "other" }, { reference: "extra" }, { section: "x" }]) {
    assert.equal((await api.executeDocsTool({ ...input, ...extra })).ok, false);
  }
  assert.equal(requests.length, 0);
});

test("gateway changes refresh actual content and keep fixed safe identities, including bound HTTP over forced CLI", async () => {
  process.env.QKRPC_HTTP_URL = "http://user:password@gateway-one.invalid:9477/base?token=secret#fragment";
  const first = display(await execute());
  assert.equal(first.gatewayKnowledge.gateway.displayName, "http://gateway-one.invalid:9477/base");
  assert.equal(first.gatewayKnowledge.gateway.identity, hash(`http:${process.env.QKRPC_HTTP_URL}`));
  assert.doesNotMatch(JSON.stringify(first), /password|token=secret|fragment/);
  process.env.QKRPC_HTTP_URL = "http://gateway-two.invalid:9477";
  response = async () => Response.json({ ok: true, data: payload("two") });
  const second = display(await execute()); assert.notEqual(second.gatewayKnowledge.gateway.identity, first.gatewayKnowledge.gateway.identity);
  assert.equal(second.gatewayKnowledge.codec.formats.output, "dynamic-two");
  await api.runWithAgentRequestContextAsync({ cwd: owned }, async () => {
    api.bindQkrpcTarget({ gateway: "http://bound.invalid:9477", binding }); process.env.QKRPC_TRANSPORT = "cli";
    const result = display(await execute()); assert.equal(result.gatewayKnowledge.gateway.identity, hash("http:http://bound.invalid:9477"));
    assert.equal(requests.at(-1)?.url, "http://bound.invalid:9477/v1/invoke");
  });
});

test("old or unfamiliar metadata stays unknown with actual markdown; malformed/failed responses never fill local knowledge", async () => {
  for (const data of [{ ...payload(), codec: undefined, provenance: undefined }, { ...payload(), codec: [] },
    { ...payload(), codec: { ...payload().codec, schemaVersion: 99 } },
    { ...payload(), codec: { ...payload().codec, source: { ...payload().codec.source, provider: "unrecognized" } } }]) {
    response = async () => Response.json({ ok: true, data }); const result = await execute();
    assert.equal(result.ok, true); assert.equal(display(result).gatewayKnowledge.status, "unknown"); assert.match(display(result).markdown, /Gateway/);
  }
  for (const raw of [{ ok: false, message: "http://user:secret@bad.invalid" }, { ok: true, data: { ...payload(), success: false } },
    { ok: true, data: { ...payload(), topic: "other" } }, { ok: true, data: { ...payload(), markdown: null } }, null]) {
    response = async () => Response.json(raw); const result = await execute();
    assert.equal(result.ok, false); const doc = api.parseDocsGetDoc(result); assert.ok(doc);
    assert.equal(doc.gatewayKnowledge.status, "unavailable"); assert.equal(doc.gatewayKnowledge.codec, null); assert.equal(doc.markdown, "");
    assert.doesNotMatch(JSON.stringify(result), /LOCAL_ONLY|user:secret/);
  }
});

test("gateway failures do not trip or recover the native connectivity gate", async () => {
  await api.runWithAgentRequestContextAsync({}, async () => {
    response = async () => { throw Object.assign(new Error("connection refused"), { cause: { code: "ECONNREFUSED" } }); };
    assert.equal((await execute()).ok, false); assert.equal(api.isQkrpcConnectivityBlockedThisTurn(), false); assert.equal(requests.length, 1);
  });
});

test("real API route and client parser retain source/status; invalid source/topic never dispatch", async () => {
  const get = (query: string, topic = "program-source", signal?: AbortSignal) => api.GET(new Request(`http://fixture.invalid/api/docs/${topic}${query}`, { signal }), { params: Promise.resolve({ topic }) });
  const data = await (await get("?source=gateway")).json(); assert.equal(data.gatewayKnowledge.status, "available");
  response = async () => Response.json({ ok: false });
  const failed = await get("?source=gateway"); assert.equal(failed.status, 503);
  const failedData = await failed.json(); assert.equal(api.parseDocsGetValue(failedData).gatewayKnowledge.status, "unavailable");
  const before = requests.length; assert.equal((await get("?source=other")).status, 400); assert.equal((await get("?source=gateway", "other")).status, 400);
  assert.equal(requests.length, before);
  globalThis.fetch = async (url, init) => { assert.equal(String(url), "/api/docs/program-source?source=gateway"); assert.equal(init?.cache, "no-store"); return Response.json(failedData, { status: 503 }); };
  const doc = await api.fetchDocByTopic("program-source", { source: "gateway" }); assert.equal(doc.gatewayKnowledge.status, "unavailable");
});

test("owner and explicit API cancellation reject before dispatch and after a late response", async () => {
  const controller = new AbortController(); const reason = new Error("cancel guide"); controller.abort(reason);
  await assert.rejects(execute(undefined, controller.signal), (error: unknown) => error === reason); assert.equal(requests.length, 0);
  const owner = new AbortController();
  response = async () => { owner.abort(reason); return Response.json({ ok: true, data: payload() }); };
  await assert.rejects(api.runWithAgentRequestContextAsync({ abortSignal: owner.signal }, () => execute()), (error: unknown) => error === reason);
  assert.equal(requests.length, 1);
  await assert.rejects(api.GET(new Request("http://fixture.invalid/api/docs/program-source?source=gateway", { signal: controller.signal }), { params: Promise.resolve({ topic: "program-source" }) }), (error: unknown) => error === reason);
});

test("explicit CLI dispatch uses the selected binary once; missing binary is unavailable without discovery or HTTP", async () => {
  process.env.QKRPC_TRANSPORT = "cli"; const bins: string[] = [];
  process.env.QKRPC_BIN = relative(process.cwd(), join(owned, "fake-cli-a.exe"));
  mock.method(childProcess, "spawn", (bin: string, args: string[]) => {
    bins.push(bin); assert.deepEqual(args, ["guide", "get", "--topic", "program-source", "--json"]);
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill() {} });
    process.env.QKRPC_BIN = join(owned, "fake-cli-b.exe");
    setImmediate(() => { child.emit("spawn"); child.stdout.write(JSON.stringify(payload(bin))); child.emit("close", 0); });
    return child;
  }); syncBuiltinESMExports();
  const one = display(await execute()), two = display(await execute());
  assert.equal(bins[0], join(owned, "fake-cli-a.exe"), "Relative configuration is fixed before changing the child cwd");
  assert.equal(one.gatewayKnowledge.gateway.identity, hash(`cli:${bins[0]}`)); assert.equal(two.gatewayKnowledge.gateway.identity, hash(`cli:${bins[1]}`));
  assert.notEqual(one.gatewayKnowledge.gateway.identity, two.gatewayKnowledge.gateway.identity);
  process.env.QKRPC_BIN = join(owned, "not-present.exe"); const missing = display(await execute());
  assert.equal(missing.gatewayKnowledge.status, "unavailable"); assert.equal(bins.length, 2); assert.equal(requests.length, 0);
  delete process.env.QKRPC_BIN;
  assert.equal(display(await execute()).gatewayKnowledge.status, "unavailable"); assert.equal(bins.length, 2);
  const staged = join(owned, "agent-gui/.runtime/qkrpc", process.platform === "win32" ? "qkrpc.exe" : "qkrpc");
  await mkdir(join(owned, "agent-gui/.runtime/qkrpc"), { recursive: true }); await writeFile(staged, "owned existing CLI");
  const existing = display(await execute()); assert.equal(existing.gatewayKnowledge.gateway.identity, hash(`cli:${staged}`));
  assert.equal(bins[2], staged); assert.equal(requests.length, 0);
});

test("long guide and oversized metadata preserve bounded exact observations in actual SDK to model projection", async () => {
  // JSON escaping keeps even the semantic preview above the final 8 KiB budget.
  const raw = payload("bounded", "\u0000".repeat(12000));
  response = async () => Response.json({ ok: true, data: raw });
  const output = await execute(); const model = api.buildModelFacingToolOutput(output);
  assert.deepEqual(output.displayData.gatewayKnowledge.codec, raw.codec); assert.equal(output.displayData.markdown, raw.markdown);
  assert.ok(JSON.stringify(model).length <= 8192); assert.equal(model.displayData, undefined);
  const projected = model.data.gatewayKnowledgeProjection;
  assert.deepEqual(projected.gatewayKnowledge.codec, raw.codec); assert.deepEqual(projected.gatewayKnowledge.provenance, raw.provenance);
  assert.equal(projected.gatewayKnowledge.gateway.identity, hash(`http:${process.env.QKRPC_HTTP_URL}`));
  assert.match(projected.notice, /not native support or write permission/);
  raw.codec.source.moduleVersionId = "x".repeat(30000);
  const oversized = await execute(); const next = api.buildModelFacingToolOutput(oversized);
  assert.ok(JSON.stringify(next).length <= 8192); const p = next.data.gatewayKnowledgeProjection;
  assert.equal(p.gatewayKnowledge.codec.source.moduleVersionId, undefined); assert.ok(p.omittedFields.includes("codec.source.moduleVersionId"));
  assert.equal(oversized.displayData.gatewayKnowledge.codec.source.moduleVersionId.length, 30000);
  assert.deepEqual(api.buildModelFacingToolOutput(next), next);
});

test("reprojecting huge failed history metadata is bounded, never returns an old available claim or shortened identity", async () => {
  const prior = { guideSource: "gateway", metadataStatus: "preserved", gatewayKnowledge: { status: "available", gateway: { transport: "http", identity: "identity".repeat(10000), displayName: "fixture" }, codec: payload().codec, provenance: payload().provenance, retrievedAt: "fixture" } };
  const raw = { ok: false, exitCode: 1, data: { gatewayKnowledgeProjection: prior, padding: "p".repeat(30000) } };
  const projected = api.projectGatewayGuideKnowledge(raw); assert.ok(JSON.stringify(projected).length <= 3072);
  assert.equal(projected.metadataStatus, "unknown"); assert.equal(projected.gatewayKnowledge.status, "unavailable");
  assert.equal(projected.gatewayKnowledge.gateway.identity, undefined); assert.equal(projected.gatewayKnowledge.codec, null);
  assert.ok(JSON.stringify(api.buildModelFacingToolOutput(raw)).length <= 8192);
});
