import assert from "node:assert/strict";
import childProcess, { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports, createRequire } from "node:module";
import path from "node:path";
import { after, test } from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

// Real file Host/APDE/variables/private grants/controller/workspace routes.
// Native chrome/catalogs are unavailable; real network and native commits are denied.
const actionId = "72746f6f-7401-4101-8101-000000000001", secondId = "72746f6f-7401-4101-8101-000000000002";
const legacyFile = `.quicker/actions/${actionId}/data.json`, secondFile = `.quicker/actions/${secondId}/data.json`, sourceFile = "source/program.source.yaml";
const sharedId = "shared-variable", sourceId = "source-real-variable";
const resource = "external variable default\r\nkept byte for byte\r\n";
const integer = "9007199254740993123456789", decimal = "0.12345678901234567890123456789";
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex").toUpperCase();
const taskRoot = path.resolve(process.cwd(), "../.tmp/variable-live-scope");
const variable = (id: string, key: string, desc: string) => ({ id, key, varType: 0, desc, defaultValue: "inline original", group: "original", saveState: false, isLocked: false });
const referenceStep = (id: string) => ({ stepId: id, stepRunnerKey: "fixture:inputs", note: "original note", inputParams: { "value.var": "message", expression: "$={message}" }, outputParams: { result: "message.member" } });
function legacyBody(second = false): string {
  const body = { steps: [referenceStep(second ? "second-step" : "main-step")], variables: [variable(sharedId, "message", second ? "second original" : "main original"),
    { ...variable("file-variable", "external", "file original"), defaultValueFile: "files/default.txt" }], subPrograms: second ? [] : [
      { id: "outer", name: "Outer", kind: 1, steps: [], variables: [], subPrograms: [
        { id: "inner", name: "Inner", description: "internal original", kind: 1, steps: [referenceStep("inner-step")], variables: [variable(sharedId, "message", "nested original")], subPrograms: [] }] },
      { id: "foreign", name: "Foreign cache", kind: 2, steps: [], variables: [variable(sharedId, "message", "foreign original")], subPrograms: [] }],
    future: { integer: "EXACT_INTEGER", decimal: "EXACT_DECIMAL", nil: null } };
  return JSON.stringify(body, null, 2).replace('"EXACT_INTEGER"', integer).replace('"EXACT_DECIMAL"', decimal);
}
const binding = { hostInstanceId: "variable-dom-synthetic-instance", hostSessionId: "0123456789abcdef0123456789abcdef",
  endpoint: "QuickerRpc_User_000000000000000000000000_0123456789abcdef0123456789abcdef", protocolVersion: 1,
  schemaVersion: 1, hostKind: "v1", quickerVersion: "synthetic", capabilities: { "action.source.read": true, "action.source.write": true } };
const nativeBody = '{"Steps":[],"Variables":[{"Id":"source-real-variable","Key":"message","Type":0,"Desc":"source original","DefaultValue":"inline original","unknownVariable":{"integer":' + integer + ',"decimal":' + decimal + '}},{"Id":"source-file-variable","Key":"external","Type":0,"DefaultValue":' + JSON.stringify(resource) + '}],"SubPrograms":[],"unknownRoot":null}';
const caw = '{"steps":[],"variables":[{"id":"source-real-variable","key":"message","varType":"text","desc":"source original","default":"inline original","unknownVariable":{"integer":' + integer + ',"decimal":' + decimal + '}},{"id":"source-file-variable","key":"external","varType":"text","default":' + JSON.stringify(resource) + '}],"subPrograms":[],"unknownRoot":null,"$schema":"quicker.action.v1"}';
const yaml = `$schema: quicker.program.source.v1\r\nvariables:\r\n  - id: source-real-variable\r\n    key: message\r\n    varType: text\r\n    desc: source original\r\n    default: inline original\r\n    unknownVariable:\r\n      integer: ${integer}\r\n      decimal: ${decimal}\r\n  - id: source-file-variable\r\n    key: external\r\n    varType: text\r\n    default.file: files/default.txt\r\nsteps: []\r\nsubPrograms: []\r\nunknownRoot: null\r\n`;
let handlers: typeof import("../../app/api/workspace/route");
let compiled: { js: string; css: string } | undefined;
let runtime: Promise<void> | undefined, cli = "", profile = "";
const oldEnvironment: Record<string, string | undefined> = {}, originalSpawn = childProcess.spawn;
function owned(directory: string): void {
  const relative = path.relative(taskRoot, directory);
  assert.ok(relative && !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`), "Fixture escaped owned root");
}
async function removeOwned(directory: string): Promise<void> {
  owned(directory); const actual = await realpath(directory), root = await realpath(taskRoot), relative = path.relative(root, actual);
  assert.ok(relative && !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`), "Resolved cleanup escaped owned root");
  await rm(actual, { recursive: true, force: true });
}
async function ensureRuntime(): Promise<void> {
  return runtime ??= (async () => {
    const requested = process.env.QKRPC_SOURCE_DOCUMENT_BIN?.trim();
    assert.ok(requested && path.isAbsolute(requested), "QKRPC_SOURCE_DOCUMENT_BIN must select explicitly built current C# codec; no installed fallback or silent skip");
    cli = requested; assert.equal((await stat(cli)).isFile(), true); await mkdir(taskRoot, { recursive: true }); profile = await mkdtemp(path.join(taskRoot, "dom-profile-")); owned(profile);
    for (const key of ["QKRPC_BIN", "QKRPC_TRANSPORT", "QUICKER_AGENT_DATA_DIR", "QKRPC_HOST_BINDING", "QKRPC_HOST_SESSION"]) oldEnvironment[key] = process.env[key];
    Object.assign(process.env, { QKRPC_BIN: cli, QKRPC_TRANSPORT: "cli", QUICKER_AGENT_DATA_DIR: profile, QKRPC_HOST_BINDING: "offline-do-not-use-host", QKRPC_HOST_SESSION: "offline-do-not-connect" });
    childProcess.spawn = ((command: string, args: string[] = [], options?: any) => {
      if (/^qkrpc(?:\.exe)?$/i.test(path.basename(command))) { assert.equal(path.resolve(command).toLowerCase(), path.resolve(cli).toLowerCase(), "Installed/native fallback prohibited"); assert.deepEqual(args, ["source", "document", "--json"], "Native dispatch prohibited"); }
      return originalSpawn(command, args, options);
    }) as typeof childProcess.spawn;
    syncBuiltinESMExports(); handlers = await import("../../app/api/workspace/route");
  })();
}
after(async () => {
  childProcess.spawn = originalSpawn; syncBuiltinESMExports();
  for (const [key, value] of Object.entries(oldEnvironment)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  if (profile) await removeOwned(profile);
});
async function sourceInspect(directory: string) {
  const child = spawn(cli, ["source", "document", "--json"], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = ""; child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; });
  const completion = new Promise<number | null>((done, fail) => { child.once("close", done); child.once("error", fail); });
  child.stdin.end(JSON.stringify({ mode: "inspect", dir: directory })); const timer = setTimeout(() => child.kill(), 30_000);
  let code; try { code = await completion; } finally { clearTimeout(timer); }
  const result = JSON.parse(stdout); assert.equal(code, 0, result.message ?? stderr); assert.equal(result.ok, true); return result.data;
}
async function makeFiles(synthetic = false, hostKind: "v1" | "v2" = "v1") {
  await ensureRuntime(); const cwd = await mkdtemp(path.join(taskRoot, "dom-case-")); owned(cwd);
  for (const [id, body] of [[actionId, legacyBody()], [secondId, legacyBody(true)]] as const) {
    const directory = path.join(cwd, ".quicker/actions", id); await mkdir(path.join(directory, "files"), { recursive: true });
    await writeFile(path.join(directory, "data.json"), body); await writeFile(path.join(directory, "info.json"), JSON.stringify({ kind: "action", id, title: "Variable DOM fixture", description: "", icon: "", editVersion: "7" }));
    await writeFile(path.join(directory, "files/default.txt"), resource);
  }
  const directory = path.join(cwd, "source"); await mkdir(path.join(directory, ".qkrpc"), { recursive: true }); await mkdir(path.join(directory, "files"));
  const sourceYaml = synthetic ? yaml.replace("steps: []", "  - key: localOnly\r\n    varType: text\r\n    default: synthetic\r\n  - key: localOther\r\n    varType: text\r\n    default: another\r\nsteps: []") : yaml;
  const body = synthetic ? nativeBody.replace('],"SubPrograms"', ',{"Key":"localOnly","Type":0,"DefaultValue":"synthetic"},{"Key":"localOther","Type":0,"DefaultValue":"another"}],"SubPrograms"') : nativeBody;
  const checkpoint = synthetic ? caw.replace('],"subPrograms"', ',{"key":"localOnly","varType":"text","default":"synthetic"},{"key":"localOther","varType":"text","default":"another"}],"subPrograms"') : caw;
  const sourceBinding = { ...binding, hostKind, hostInstanceId: binding.hostInstanceId + "-" + hostKind };
  await writeFile(path.join(directory, "program.source.yaml"), sourceYaml); await writeFile(path.join(directory, "files/default.txt"), resource);
  await writeFile(path.join(directory, "quicker.source.json"), JSON.stringify({ schema: "quicker.source-bundle.v1", kind: "action", actionId, title: "Variable source DOM fixture", editVersion: "7", hostBinding: sourceBinding, storageIdentity: null, readSource: "catalog" }));
  await writeFile(path.join(directory, ".qkrpc/baseline.json"), '{"schema":"qkrpc.native-baseline.v1","actionId":' + JSON.stringify(actionId) + ',"hostBinding":' + JSON.stringify(sourceBinding) + ',"editVersion":"7","bodyHash":' + JSON.stringify(hash(body)) + ',"body":' + body + ',"cawHash":' + JSON.stringify(hash(checkpoint)) + ',"caw":' + checkpoint + ',"storageIdentity":null}');
  return { cwd, directory, close: () => removeOwned(cwd) };
}
const browserEntry = `
import React,{StrictMode,useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WorkspaceExplorerPanelProvider,WorkspaceExplorerShellProvider,useWorkspaceExplorerEditor} from '@/lib/workspace-explorer';
import {WorkspaceDocumentHost} from '@/components/workspace/WorkspaceDocumentHost';
import {WorkspaceExplorerPanel} from '@/components/workspace/WorkspaceExplorerPanel';
import '@/app/globals.css';
const config=window.fixtureConfig,state=window.fixture={cwd:config.cwd,pins:[],stepPins:[],requests:[],unexpected:[],sourceClients:[]};
window.EventSource=class{close(){}};
let sequence=0;
window.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.href),id=++sequence;
 const envelope=init.body?JSON.parse(init.body):Object.fromEntries(url.searchParams);state.requests.push({url:url.pathname,...envelope});
 if(init.signal?.aborted)throw new DOMException('Aborted','AbortError');
 const abort=()=>{void window.variableApiCancel(id)};init.signal?.addEventListener('abort',abort,{once:true});
 const response=await window.variableApiStart({id,url:url.href,method:init.method||'GET',body:init.body});
 if(response.stream)return new Response(new ReadableStream({async pull(controller){const part=await window.variableApiRead(id);if(part.done){init.signal?.removeEventListener('abort',abort);controller.close()}else controller.enqueue(Uint8Array.from(atob(part.base64),c=>c.charCodeAt(0)))},async cancel(){init.signal?.removeEventListener('abort',abort);await window.variableApiCancel(id)}}),{status:response.status,headers:response.headers});
 init.signal?.removeEventListener('abort',abort);if(init.signal?.aborted)throw new DOMException('Aborted','AbortError');return new Response(response.body,{status:response.status,headers:response.headers});
};
function Controls(){const editor=useWorkspaceExplorerEditor();useEffect(()=>{state.open=p=>editor.openFile(p);state.active=()=>editor.activeTab;state.close=p=>{const tab=editor.tabs.find(t=>t.path===p);if(tab)editor.closeTab(tab.id)}});return null}
function App(){const[thread,setThread]=useState('chat-a'),[visible,setVisible]=useState(true);state.setThread=setThread;state.hide=()=>setVisible(false);state.show=()=>setVisible(true);
 const presentation=useMemo(()=>({threadId:thread,pinStep:(tag,pin)=>state.stepPins.push({tag,pin,thread}),pinVariable:(tag,pin)=>state.pins.push({tag,pin,thread})}),[thread]);
 const publish=registry=>{state.live=registry;return()=>{if(state.live===registry)state.live=null}};
 return <WorkspaceExplorerShellProvider><WorkspaceExplorerPanelProvider cwd={config.cwd}><WorkspaceDocumentHost onLiveProgramDocumentRegistry={publish}><Controls/>{visible&&<WorkspaceExplorerPanel chatPresentation={presentation}/>}</WorkspaceDocumentHost></WorkspaceExplorerPanelProvider></WorkspaceExplorerShellProvider>}
createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);
`;
async function browserBundle() {
  if (compiled) return compiled; const require = createRequire(path.join(process.cwd(), "package.json"));
  const result = await build({ stdin: { contents: browserEntry, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", outfile: "variable-pin-fixture.js", tsconfig: "tsconfig.json", define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "variable-owned-chrome", setup(builder) {
      // Observe the real client factory without replacing its methods, owner or callbacks.
      // This lets the test make an explicit user no-op save while the UI clean-save button is disabled.
      builder.onResolve({ filter: /^@\/lib\/source-bundle-document-client$/ }, () => ({ path: "observed-source-client", namespace: "observe-source-client" }));
      builder.onResolve({ filter: /^actual-source-client$/, namespace: "observe-source-client" }, () => ({ path: path.resolve(process.cwd(), "lib/source-bundle-document-client.ts"), namespace: "file" }));
      builder.onLoad({ filter: /.*/, namespace: "observe-source-client" }, () => {
        const actual = JSON.stringify("actual-source-client");
        return { contents: `import {createSourceBundleDocumentClient as real} from ${actual};export * from ${actual};export function createSourceBundleDocumentClient(options){const client=real(options);window.fixture.sourceClients.push(client);return client}`, loader: "js" };
      });
      builder.onResolve({ filter: /^@iconify\/icons-mdi\// }, args => ({ path: require.resolve(args.path) }));
      builder.onResolve({ filter: /(^@\/components\/(browser\/WorkspaceEmbeddedBrowser|terminal\/WorkspaceEmbeddedTerminal|action-trace\/ActionTracePanel|workspace\/WorkspaceResourceManager|chat\/(ActionIcon|FaIconProvider|DocsViewerTabs))$|shared\/IconControl$|^@\/lib\/(docs-viewer|embedded-terminal-context|action-command-client|action-trace-client)$)/ }, args => ({ path: args.path, namespace: "variable-chrome" }));
      builder.onLoad({ filter: /.*/, namespace: "variable-chrome" }, args => {
        if (args.path.endsWith("docs-viewer")) return { contents: "export const useDocsViewer=()=>({activeDoc:null})", loader: "js" };
        if (args.path.endsWith("embedded-terminal-context")) return { contents: "export const useEmbeddedTerminal=()=>({open:false})", loader: "js" };
        if (args.path.endsWith("action-command-client")) return { contents: "export const isQuickerActionMissingError=()=>false;export function invokeActionCommand(){throw Error('Native commands prohibited')}", loader: "js" };
        if (args.path.endsWith("action-trace-client")) return { contents: "export function startActionTrace(){throw Error('Trace prohibited')}", loader: "js" };
        if (args.path.endsWith("FaIconProvider")) return { contents: "export const FaIconProvider=p=>p.children", loader: "js" };
        if (args.path.endsWith("ActionIcon") || args.path.endsWith("IconControl")) return { contents: `export const ${args.path.endsWith("ActionIcon") ? "ActionIcon" : "IconControl"}=()=>null`, loader: "js" };
        return { contents: `export const ${args.path.endsWith("DocsViewerTabs") ? "DocsViewerPanel" : args.path.split("/").at(-1)}=()=>null`, loader: "js" };
      });
    } }] });
  return compiled = { js: result.outputFiles.find(file => file.path.endsWith(".js"))!.text, css: result.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "" };
}
async function openFixture(file = legacyFile, synthetic = false, hostKind: "v1" | "v2" = "v1") {
  const bundle = await browserBundle(), fixture = await makeFiles(synthetic, hostKind); let browser: Browser | undefined;
  const streams = new Map<number, { controller: AbortController; reader?: ReadableStreamDefaultReader<Uint8Array> }>(), cancelled = new Set<number>();
  const pending = new Set<Promise<unknown>>();
  const calls: Record<string, unknown>[] = [], errors: string[] = [];
  type SaveGate = { entered: Promise<void>; enter(): void; wait: Promise<void>; release(): void };
  let saveGate: SaveGate | undefined; const gates = new Set<SaveGate>();
  const close = async () => {
    const page = browser?.contexts()[0]?.pages()[0];
    if (page && !page.isClosed()) {
      const evidence = path.join(taskRoot, "dom-evidence-" + path.basename(fixture.cwd)); await mkdir(evidence, { recursive: true });
      await Promise.all([page.screenshot({ path: path.join(evidence, "final.png"), fullPage: true, timeout: 10_000 }),
        writeFile(path.join(evidence, "state.json"), JSON.stringify({ errors, calls, text: await page.locator("body").innerText().catch(() => "unavailable"),
          source: await page.evaluate(() => (window as any).fixture?.sourceClients?.map((client: any) => {
            const state = client.getState(), document = state.document;
            return { blocked: state.blocked, error: state.error, target: document ? client.getLiveSourceTarget(document.editorJson) : null, identity: document?.variableIdentity, lastSave: client.getLastSaveReceipt() };
          })).catch(() => "unavailable") }, null, 2))]).catch(error => { console.warn("DOM diagnostic capture:", String(error)); });
    }
    for (const gate of gates) gate.release(); gates.clear();
    for (const stream of streams.values()) { stream.controller.abort(); await stream.reader?.cancel().catch(() => {}); }
    streams.clear(); await Promise.allSettled([...pending]); await browser?.close(); await fixture.close();
  };
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 } }); page.setDefaultTimeout(10_000);
    page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    const origin = `http://localhost/variable-owned-${randomUUID()}`;
    await page.route("**/*", route => { if (route.request().url() === origin) return route.fulfill({ contentType: "text/html", body: '<!doctype html><html data-theme="light"><head><link rel="icon" href="data:,"></head><body><div id="root"></div></body></html>' }); errors.push(`Unexpected network: ${route.request().url()}`); return route.abort(); });
    await page.exposeBinding("variableApiStart", async (_, input: { id: number; url: string; method: string; body?: string }) => {
      const operation = (async () => {
      const controller = new AbortController(), slot = { controller, reader: undefined as ReadableStreamDefaultReader<Uint8Array> | undefined }; streams.set(input.id, slot); if (cancelled.delete(input.id)) controller.abort();
      const url = new URL(input.url), envelope = input.body ? JSON.parse(input.body) : Object.fromEntries(url.searchParams); calls.push({ api: url.pathname, ...envelope });
      let response: Response;
      if (url.pathname === "/api/workspace") {
        assert.ok(["read", "list", "tree", "program-document-target", "open-source-document", "save-program-document", "preview-source-document"].includes(envelope.op), `Unexpected workspace operation: ${envelope.op}`);
        assert.equal(envelope.cwd, fixture.cwd, "The original workspace remains explicit");
        const req = new Request(input.url, { method: input.method, ...(input.body === undefined ? {} : { body: input.body, headers: { "Content-Type": "application/json" } }), signal: controller.signal });
        response = input.method === "POST" ? await handlers.POST(req) : await handlers.GET(req);
      } else if (url.pathname.startsWith("/api/step-runner/") || url.pathname.startsWith("/api/fa/") || url.pathname === "/api/subprogram/list" || url.pathname.startsWith("/api/designer/resources/")) {
        response = Response.json({ ok: false, code: "HOST_CAPABILITY_UNAVAILABLE", error: "Synthetic fixture has no native catalog", retryable: false }, { status: 503 });
      } else throw Error(`Unexpected browser API ${url.pathname}`);
      const headers = Object.fromEntries(response.headers);
      if (headers["content-type"]?.startsWith("application/x-ndjson")) { slot.reader = response.body!.getReader(); return { status: response.status, headers, stream: true }; }
      const body = await response.text();
      if (saveGate && envelope.op === "save-program-document") { const gate = saveGate; saveGate = undefined; gate.enter(); await gate.wait; gates.delete(gate); }
      streams.delete(input.id); return { status: response.status, headers, body };
      })();
      pending.add(operation); try { return await operation; } finally { pending.delete(operation); }
    });
    await page.exposeBinding("variableApiRead", async (_, id: number) => { const stream = streams.get(id); if (!stream?.reader) return { done: true }; const part = await stream.reader.read(); if (part.done) streams.delete(id); return { done: part.done, ...(part.done ? {} : { base64: Buffer.from(part.value).toString("base64") }) }; });
    await page.exposeBinding("variableApiCancel", async (_, id: number) => { const stream = streams.get(id); if (!stream) { cancelled.add(id); return; } stream.controller.abort(); await stream.reader?.cancel().catch(() => {}); streams.delete(id); });
    await page.goto(origin); assert.equal(await page.evaluate(() => isSecureContext && Boolean(crypto.subtle)), true, "Source validation uses real WebCrypto on owned localhost");
    await page.addStyleTag({ content: bundle.css + "\nhtml,body,#root{height:100%;margin:0}.workspace-side-panel{width:100%;height:100%}" });
    await page.evaluate(config => { (window as any).fixtureConfig = config; }, { cwd: fixture.cwd }); await page.addScriptTag({ content: bundle.js });
    await page.waitForFunction(() => Boolean((window as any).fixture?.open)); await page.evaluate(file => { (window as any).fixture.open(file); }, file);
    await doc(page).locator(".action-project-data-editor-tabs").waitFor(); return { ...fixture, page, calls, errors, close,
      deferNextSaveAck() {
        let enter!: () => void, release!: () => void; const entered = new Promise<void>(done => { enter = done; }), wait = new Promise<void>(done => { release = done; });
        saveGate = { entered, enter, wait, release }; gates.add(saveGate); return { entered, release };
      },
    };
  } catch (error) { await close(); throw error; }
}
const doc = (page: Page) => page.locator("[data-workspace-document]:visible");
const surface = (page: Page) => doc(page).locator(".program-editor-surface:visible");
const variableForm = (page: Page) => surface(page).locator(".variable-form");
async function openVariables(page: Page, id: string) {
  const button = surface(page).getByRole("button", { name: "打开变量面板", exact: true }); if (await button.count()) await button.click();
  await surface(page).locator(`[data-variable-id="${id}"]`).click(); await variableForm(page).locator('input[title="变量名"]').waitFor();
}
async function pinSelected(page: Page) { await surface(page).getByRole("button", { name: "添加变量到对话", exact: true }).evaluate((button: HTMLButtonElement) => button.click()); }
async function captureRead(page: Page, mode: "read" | "edit" = "edit", operationId = "variable-read") {
  return page.evaluate(({ mode, operationId }) => {
    const f = (window as any).fixture, pinned = f.pins.at(-1); if (!pinned?.pin?.pinId) throw Error(`Actual variable pin failed: ${JSON.stringify(pinned)}`);
    f.selection = f.live.captureForManualSend({ pins: [pinned.pin], threadId: pinned.thread, userMessageId: `manual-${operationId}`, cwd: f.cwd, mode });
    if (f.selection.state !== "ready") throw Error(JSON.stringify(f.selection));
    f.readOperationId = operationId; f.read = f.live.execute(f.selection.scope, { scopeId: f.selection.scope.scopeId, operationId, input: { action: "read_live", variableFor: { surface: pinned.tag.surface, variableId: pinned.tag.variableId } } });
    return { receipt: f.read, tag: pinned.tag, scope: f.selection.scope };
  }, { mode, operationId });
}
async function edit(page: Page, changes: { field: string; valueJson: string }[], operationId = "variable-edit") {
  return page.evaluate(({ changes, operationId }) => {
    const f = (window as any).fixture, variable = f.read.variable;
    f.command = { scopeId: f.selection.scope.scopeId, operationId, input: { action: "edit_variable_live", readOperationId: f.readOperationId,
      expectedRevision: f.read.revision, surface: variable.surface, variableId: variable.variableId, contractRevision: variable.contract.revision, changes } };
    return f.live.execute(f.selection.scope, f.command);
  }, { changes, operationId });
}
async function openInner(page: Page) {
  await doc(page).getByLabel("打开或新建内部子程序", { exact: true }).click(); await doc(page).getByRole("button", { name: "Outer / Inner", exact: true }).click();
  await surface(page).getByRole("button", { name: "打开变量面板", exact: true }).waitFor();
}
async function userSave(page: Page) {
  const button = doc(page).locator(".action-project-data-editor-save"); await button.click(); await page.waitForFunction(() => {
    const button = document.querySelector('[data-workspace-document]:not([hidden]) .action-project-data-editor-save') as HTMLButtonElement | null;
    return button?.disabled === true && button.textContent?.includes("保存到工作区");
  });
}
async function reorderAfter(page: Page, selectedId: string, targetId: string) {
  const selected = surface(page).locator(`[data-variable-id="${selectedId}"]`), target = surface(page).locator(`[data-variable-id="${targetId}"]`);
  const to = await target.boundingBox(); assert.ok(to);
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  try {
    // Dispatch the real HTML drag events with a real DataTransfer; wait for React's
    // indicator commit before Drop instead of depending on clipped drawer pixels.
    await selected.dispatchEvent("dragstart", { dataTransfer });
    await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => done())));
    await target.dispatchEvent("dragover", { dataTransfer, clientX: to.x + 5, clientY: to.y + to.height - 2 });
    await page.waitForFunction(targetId => document.querySelector(`[data-workspace-document]:not([hidden]) [data-variable-id="${targetId}"]`)?.classList.contains("insert-after"), targetId);
    await target.dispatchEvent("drop", { dataTransfer });
    await selected.dispatchEvent("dragend", { dataTransfer });
  } finally { await dataTransfer.dispose(); }
  await page.waitForFunction(({ selectedId, targetId }) => {
    const ids = [...document.querySelectorAll('[data-workspace-document]:not([hidden]) .program-editor-surface:not([hidden]) [data-variable-id]')].map(row => row.getAttribute("data-variable-id"));
    return ids.indexOf(selectedId) > ids.indexOf(targetId);
  }, { selectedId, targetId });
}
function successfulPins(page: Page) { return page.evaluate(() => (window as any).fixture.pins.filter((entry: any) => Boolean(entry.pin?.pinId)).length); }

// Select only this test for static preparation. Normal CI runs every test below;
// unavailable codec/browser support is a failure, never a silent skip.
test("variable pin fixture compiles the actual file Host and APDE graph", { timeout: 60_000 }, async () => {
  const bundle = await browserBundle(); assert.match(bundle.js, /WorkspaceDocumentHost/); assert.match(bundle.js, /captureForManualSend/); assert.ok(bundle.css.length > 0);
});
test("Source fixtures inspect through the explicit actual codec and expose document-local identity for both target kinds", { timeout: 120_000 }, async () => {
  for (const hostKind of ["v1", "v2"] as const) {
    const fixture = await makeFiles(true, hostKind);
    try {
      const document = await sourceInspect(fixture.directory), identity = document.variableIdentity;
      assert.equal(document.hostBinding.hostKind, hostKind); assert.equal(identity.schemaVersion, 1); assert.equal(identity.authorizesLive, false);
      assert.equal(identity.sourceSnapshot, document.sourceSnapshot.revision); assert.equal(identity.codecRevision, document.sourceSnapshot.codecRevision);
      assert.equal(identity.editorDocumentHash, "sha256:" + hash(document.editorJson).toLowerCase()); assert.equal(identity.baselineEditorHash, identity.editorDocumentHash);
      assert.equal(identity.view, "observed"); assert.equal(identity.mappingEpochKind, "content-bound");
      const local = identity.variables.find((row: any) => row.sourceRowAnchor?.key === "localOnly");
      assert.ok(local); assert.equal(local.provenance, "generated"); assert.equal(local.documentLocalIdentityProven, true); assert.equal(local.nativeIdentity, "unknown"); assert.equal(local.renameMappingProven, false);
    } finally { await fixture.close(); }
  }
});
test("main variable pin flushes a human draft, changes proven fields once, and Save/reopen preserves raw bytes", { timeout: 120_000 }, async () => {
  const fixture = await openFixture(); const { page } = fixture;
  try {
    const original = await readFile(path.join(fixture.cwd, legacyFile), "utf8"); await openVariables(page, sharedId);
    await variableForm(page).locator('input[title="备注"]').fill("human unblurred description"); await pinSelected(page);
    const read = await captureRead(page); assert.equal(read.receipt.ok, true); assert.equal(read.tag.surface, "main"); assert.equal(read.tag.variableId, sharedId);
    assert.equal(read.scope.target.owner.path, legacyFile); assert.match(read.receipt.variable.variableJson, /human unblurred description/);
    const rename = await edit(page, [{ field: "key", valueJson: '"renamedMessage"' }], "file-bound-rename"); assert.equal(rename.ok, false); assert.match(rename.error, /unsupported_reference|外置默认值/);
    const result = await edit(page, [{ field: "defaultValue", valueJson: '"Agent inline"' }, { field: "desc", valueJson: '"Agent description"' }, { field: "group", valueJson: '"Agent group"' }, { field: "saveState", valueJson: "true" }, { field: "isLocked", valueJson: "true" }]);
    assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.persisted, false); assert.equal(result.undoable, true);
    await page.waitForFunction(() => document.querySelector<HTMLInputElement>('[data-workspace-document]:not([hidden]) .variable-form input[title="备注"]')?.value === "Agent description");
    assert.equal(await readFile(path.join(fixture.cwd, legacyFile), "utf8"), original, "Agent variable edits do not persist");
    await doc(page).locator('[title="撤销 (Ctrl+Z)"]').click(); assert.equal(await variableForm(page).locator('input[title="变量名"]').inputValue(), "message"); assert.equal(await variableForm(page).locator('input[title="备注"]').inputValue(), "human unblurred description");
    const replay = await page.evaluate(() => { const f = (window as any).fixture; return f.live.execute(f.selection.scope, f.command); }); assert.deepEqual(replay, result);
    assert.equal(await variableForm(page).locator('input[title="变量名"]').inputValue(), "message", "Receipt replay cannot repeat an edit after Undo");
    await doc(page).locator('[title^="重做 ("]').click(); await userSave(page);
    const saved = await readFile(path.join(fixture.cwd, legacyFile), "utf8"); assert.match(saved, new RegExp(integer)); assert.match(saved, /0\.12345678901234567890123456789/);
    const parsed = JSON.parse(saved); assert.equal(parsed.variables[0].desc, "Agent description"); assert.equal(parsed.variables[0].group, "Agent group"); assert.equal(parsed.variables[0].saveState, true); assert.equal(parsed.variables[0].isLocked, true);
    // Legacy Save retains its established compact-on-disk default names.
    assert.equal(parsed.variables[0].default, "Agent inline"); assert.equal(parsed.variables[0].key, "message"); assert.equal(parsed.steps[0].inputParams["value.var"], "message"); assert.equal(parsed.subPrograms[0].subPrograms[0].variables[0].key, "message"); assert.equal(parsed.variables[1]["default.file"], "files/default.txt");
    assert.equal(await readFile(path.join(fixture.cwd, ".quicker/actions", actionId, "files/default.txt"), "utf8"), resource);
    await page.evaluate(file => { (window as any).fixture.close(file); }, legacyFile); await doc(page).waitFor({ state: "hidden" });
    await page.evaluate(file => { (window as any).fixture.open(file); }, legacyFile); await doc(page).locator(".action-project-data-editor-tabs").waitFor(); await openVariables(page, sharedId);
    assert.equal(await variableForm(page).locator('input[title="备注"]').inputValue(), "Agent description");
    assert.equal(fixture.calls.filter(call => call.op === "save-program-document").length, 1); assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test("nested grants keep a root owner and legal same IDs, block a hidden modal, and reject a retired owner", { timeout: 120_000 }, async () => {
  const fixture = await openFixture(); const { page } = fixture;
  try {
    await openInner(page); await openVariables(page, sharedId); await pinSelected(page); const read = await captureRead(page, "edit", "nested-read");
    assert.equal(read.receipt.ok, true); assert.equal(read.tag.surface, "sub-inner"); assert.equal(read.scope.target.owner.path, legacyFile); assert.equal(read.receipt.variable.variableId, sharedId);
    await doc(page).getByRole("tab", { name: "Inner", exact: true }).dblclick(); const popup = page.getByRole("dialog", { name: "子程序属性", exact: true }); await popup.getByLabel("说明", { exact: true }).fill("human modal retained");
    await page.evaluate(() => { (window as any).fixture.hide(); });
    const refused = await edit(page, [{ field: "desc", valueJson: '"must not apply"' }], "hidden-modal-edit"); assert.equal(refused.ok, false); assert.equal(refused.code, "LIVE_DOCUMENT_BUSY"); assert.equal(refused.application, "not_applied");
    await page.evaluate(() => { (window as any).fixture.show(); }); await popup.waitFor(); assert.equal(await popup.getByLabel("说明", { exact: true }).inputValue(), "human modal retained");
    await popup.getByRole("button", { name: "取消", exact: true }).click(); await page.getByRole("alertdialog", { name: "是否保存更改？", exact: true }).getByRole("button", { name: "不保存", exact: true }).click(); await popup.waitFor({ state: "hidden" });
    await page.evaluate(() => { const f = (window as any).fixture; f.readOperationId = "nested-fresh-read"; f.read = f.live.execute(f.selection.scope, { scopeId: f.selection.scope.scopeId, operationId: f.readOperationId, input: { action: "read_live", variableFor: { surface: "sub-inner", variableId: "shared-variable" } } }); });
    await page.evaluate(file => { const f = (window as any).fixture; f.open(file); f.setThread("chat-b"); }, secondFile); await doc(page).locator(".action-project-data-editor-tabs").waitFor(); await openVariables(page, sharedId);
    const changed = await edit(page, [{ field: "key", valueJson: '"nestedRenamed"' }, { field: "desc", valueJson: '"Agent nested"' }], "nested-edit"); assert.equal(changed.ok, true, JSON.stringify(changed)); assert.equal(changed.persisted, false);
    assert.equal(await variableForm(page).locator('input[title="备注"]').inputValue(), "second original");
    await page.evaluate(file => { (window as any).fixture.open(file); }, legacyFile); await doc(page).getByRole("tab", { name: "Inner", exact: true }).click();
    assert.equal(await variableForm(page).locator('input[title="变量名"]').inputValue(), "nestedRenamed"); await doc(page).locator('[title="撤销 (Ctrl+Z)"]').click(); assert.equal(await variableForm(page).locator('input[title="变量名"]').inputValue(), "message");
    await doc(page).getByRole("tab", { name: "主程序", exact: true }).click(); await openVariables(page, sharedId); assert.equal(await variableForm(page).locator('input[title="备注"]').inputValue(), "main original");
    assert.equal(await readFile(path.join(fixture.cwd, legacyFile), "utf8"), legacyBody()); assert.equal(fixture.calls.filter(call => call.op === "save-program-document").length, 0);
    await page.evaluate(file => { const f = (window as any).fixture; f.close(file); f.open(file); }, legacyFile); await doc(page).locator(".action-project-data-editor-tabs").waitFor();
    const stale = await edit(page, [{ field: "desc", valueJson: '"retired owner edit"' }], "retired-edit"); assert.equal(stale.ok, false); assert.equal(stale.application, "not_applied"); assert.match(stale.code, /STALE|SCOPE|UNAVAILABLE/); assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});
test("invalid variable drafts cannot mint a pin and Ask reads cannot edit", { timeout: 90_000 }, async () => {
  const fixture = await openFixture(); const { page } = fixture;
  try {
    await openVariables(page, sharedId); const before = await successfulPins(page); await variableForm(page).locator('input[title="变量名"]').fill("invalid variable name"); await pinSelected(page);
    assert.equal(await successfulPins(page), before); assert.equal(await variableForm(page).locator('input[title="变量名"]').inputValue(), "invalid variable name");
    await surface(page).getByRole("button", { name: "放弃修改", exact: true }).click(); await pinSelected(page); const read = await captureRead(page, "read", "ask-variable-read"); assert.equal(read.receipt.ok, true);
    const denied = await edit(page, [{ field: "desc", valueJson: '"Ask must not edit"' }], "ask-edit"); assert.equal(denied.ok, false); assert.equal(denied.application, "not_applied"); assert.match(denied.code, /denied|READ_ONLY|MODE/);
    assert.equal(await variableForm(page).locator('input[title="备注"]').inputValue(), "main original"); assert.equal(fixture.calls.filter(call => call.op === "save-program-document").length, 0); assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

for (const hostKind of ["v1", "v2"] as const) test(`Source ${hostKind} document-local identity survives reorder, Save ACK and a fresh scope without changing native identity`, { timeout: 120_000 }, async () => {
  const fixture = await openFixture(sourceFile, true, hostKind); const { page } = fixture;
  try {
    const original = await sourceInspect(fixture.directory); assert.ok(original.variableIdentity, "Current codec must supply real variable provenance");
    const origin = original.variableIdentity.variables.find((row: any) => row.sourceRowAnchor?.key === "localOnly");
    const other = original.variableIdentity.variables.find((row: any) => row.sourceRowAnchor?.key === "localOther");
    assert.ok(origin?.editorId); assert.ok(other?.editorId); assert.equal(origin.documentLocalIdentityProven, true); assert.equal(origin.nativeIdentity, "unknown");
    const selectedId = origin.editorId as string;
    const managed = await Promise.all(["quicker.source.json", ".qkrpc/baseline.json", "files/default.txt"].map(async file => [file, hash(await readFile(path.join(fixture.directory, file)))]));
    await openVariables(page, selectedId); await variableForm(page).locator('input[title="备注"]').fill("source human without blur"); await pinSelected(page); const read = await captureRead(page, "edit", "source-variable-read");
    assert.equal(read.receipt.ok, true, JSON.stringify(read.receipt)); assert.equal(read.scope.target.format, "source-bundle"); assert.equal(read.scope.target.owner.path, sourceFile); assert.equal(read.scope.target.identity.projectBinding, undefined);
    assert.equal(read.receipt.variable.contract.source, "document-controller"); assert.equal(read.receipt.variable.contract.nativeValidation, "unobserved");
    assert.equal(read.scope.target.source.hostBinding.hostKind, hostKind); assert.equal(read.receipt.variable.variableId, selectedId);
    const changed = await edit(page, [{ field: "desc", valueJson: '"Source Agent description"' }, { field: "group", valueJson: '"Source group"' }, { field: "saveState", valueJson: "true" }], "source-variable-edit"); assert.equal(changed.ok, true, JSON.stringify(changed)); assert.equal(changed.persisted, false);
    assert.equal(hash(await readFile(path.join(fixture.directory, "program.source.yaml"))), original.sourceSnapshot.files.find((file: any) => file.path === "program.source.yaml").sha256.replace(/^sha256:/i, "").toUpperCase(), "Live edits never save YAML");
    await doc(page).locator('[title="撤销 (Ctrl+Z)"]').click(); assert.equal(await variableForm(page).locator('input[title="备注"]').inputValue(), "source human without blur");
    await doc(page).locator('[title^="重做 ("]').click();
    await reorderAfter(page, selectedId, other.editorId);
    await userSave(page); const saved = await sourceInspect(fixture.directory); assert.equal(saved.pending.status, "pending"); assert.match(saved.editorJson, /Source Agent description/); assert.match(saved.editorJson, new RegExp(integer)); assert.match(saved.editorJson, /0\.12345678901234567890123456789/);
    const savedOrigin = saved.variableIdentity.variables.find((row: any) => row.sourceRowAnchor?.key === "localOnly");
    assert.equal(savedOrigin.nativeIdentity, "unknown"); assert.equal(savedOrigin.sourceId, null); assert.equal(savedOrigin.sourceIdProven, false);
    const rows = JSON.parse(saved.editorJson).variables; assert.ok(rows.findIndex((row: any) => row.key === "localOther") < rows.findIndex((row: any) => row.key === "localOnly"), "The real variable UI reordered the source rows");
    assert.equal(await readFile(path.join(fixture.directory, "data.json"), "utf8").then(() => true, () => false), false);
    for (const [file, expected] of managed) assert.equal(hash(await readFile(path.join(fixture.directory, file))), expected, `${file} stays unchanged by local Save`);
    const stale = await edit(page, [{ field: "desc", valueJson: '"old pre-Save proof"' }], "source-pre-save-proof"); assert.equal(stale.ok, false); assert.equal(stale.application, "not_applied");
    await openVariables(page, selectedId); await pinSelected(page); const afterSave = await captureRead(page, "edit", "source-after-reorder"); assert.equal(afterSave.receipt.ok, true); assert.equal(JSON.parse(afterSave.receipt.variable.variableJson).key, "localOnly");
    assert.equal(afterSave.scope.target.owner.instanceId, read.scope.target.owner.instanceId); assert.notEqual(afterSave.scope.target.source.mappingEpoch, read.scope.target.source.mappingEpoch);
    const again = await edit(page, [{ field: "desc", valueJson: '"after reorder proof"' }], "source-after-reorder-edit"); assert.equal(again.ok, true, JSON.stringify(again)); await doc(page).locator('[title="撤销 (Ctrl+Z)"]').click();
    await page.evaluate(file => { (window as any).fixture.close(file); }, sourceFile); await doc(page).waitFor({ state: "hidden" }); await page.evaluate(file => { (window as any).fixture.open(file); }, sourceFile);
    const reopenedId = saved.variableIdentity.variables.find((row: any) => row.sourceRowAnchor?.key === "localOnly")?.editorId; assert.ok(reopenedId);
    await doc(page).getByText(/本地待同步/).waitFor(); await openVariables(page, reopenedId); assert.equal(await variableForm(page).locator('input[title="备注"]').inputValue(), "Source Agent description");
    assert.equal(fixture.calls.filter(call => call.op === "save-program-document").length, 1); assert.equal(fixture.calls.some(call => /sync|write|run/.test(String(call.op))), false); assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test("Source document-local generated ID edits metadata without native claims, while rename and an unproven new row are denied", { timeout: 120_000 }, async () => {
  const fixture = await openFixture(sourceFile, true); const { page } = fixture;
  try {
    const document = await sourceInspect(fixture.directory), identities = document.variableIdentity?.variables;
    assert.ok(Array.isArray(identities), "The current codec supplies actual per-variable provenance");
    const local = identities.find((row: any) => row.sourceRowAnchor?.key === "localOnly");
    assert.ok(local?.editorId); assert.equal(local.provenance, "generated"); assert.equal(local.documentLocalIdentityProven, true); assert.equal(local.nativeIdentity, "unknown"); assert.equal(local.renameMappingProven, false);
    await openVariables(page, local.editorId); await pinSelected(page); const read = await captureRead(page, "edit", "source-document-local"); assert.equal(read.receipt.ok, true);
    const rename = await edit(page, [{ field: "key", valueJson: '"unprovenRename"' }], "source-document-local-rename"); assert.equal(rename.ok, false); assert.equal(rename.application, "not_applied");
    const applied = await edit(page, [{ field: "desc", valueJson: '"local metadata changed"' }, { field: "group", valueJson: '"local group"' }], "source-document-local-edit"); assert.equal(applied.ok, true, JSON.stringify(applied)); assert.equal(applied.persisted, false);
    const before = await successfulPins(page); await surface(page).locator('button[title="增加变量"]').click();
    const button = surface(page).getByRole("button", { name: "添加变量到对话", exact: true });
    if (await button.count() && await button.isEnabled()) await button.evaluate((element: HTMLButtonElement) => element.click());
    assert.equal(await successfulPins(page), before, "A new unproven row cannot inherit an original row's document-local identity");
    assert.equal(fixture.calls.filter(call => call.op === "save-program-document").length, 0);
    const after = await sourceInspect(fixture.directory); assert.equal(after.sourceSnapshot.revision, document.sourceSnapshot.revision, "Unsaved live work does not rewrite the bundle or provenance"); assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test("a real Source no-op Save retires its proof even when the original Session revision and bytes stay unchanged", { timeout: 120_000 }, async () => {
  const fixture = await openFixture(sourceFile); const { page } = fixture;
  try {
    await openVariables(page, sourceId); await pinSelected(page); const before = await captureRead(page, "edit", "before-noop-save"); assert.equal(before.receipt.ok, true);
    const hashes = await Promise.all(["program.source.yaml", "quicker.source.json", ".qkrpc/baseline.json", "files/default.txt"].map(async file => [file, hash(await readFile(path.join(fixture.directory, file)))]));
    const acknowledgement = await page.evaluate(async () => {
      const f = (window as any).fixture, client = f.sourceClients.at(-1), document = client.getState().document;
      if (!client || !document) throw Error("The actual Source client was not observed");
      const previous = client.getLiveSourceTarget(document.editorJson);
      const result = await client.save({ saveId: 991, revision: f.read.revision, content: document.editorJson, baselineContent: document.editorJson, identity: f.selection.scope.target.identity });
      return { result, previous, current: client.getLiveSourceTarget(client.getState().document.editorJson) };
    });
    assert.equal(acknowledgement.result.ok, true, JSON.stringify(acknowledgement.result)); assert.ok(acknowledgement.previous); assert.ok(acknowledgement.current);
    assert.notEqual(acknowledgement.current.mappingEpoch, acknowledgement.previous.mappingEpoch);
    const oldRead = await page.evaluate(() => { const f = (window as any).fixture; return f.live.execute(f.selection.scope, { scopeId: f.selection.scope.scopeId, operationId: "old-scope-after-noop", input: { action: "read_live", variableFor: { surface: "main", variableId: "source-real-variable" } } }); });
    assert.equal(oldRead.ok, false); assert.equal(oldRead.application, "not_applied");
    const oldEdit = await edit(page, [{ field: "desc", valueJson: '"must not revive old proof"' }], "old-proof-after-noop"); assert.equal(oldEdit.ok, false); assert.equal(oldEdit.application, "not_applied");
    await pinSelected(page); const fresh = await captureRead(page, "edit", "after-noop-save"); assert.equal(fresh.receipt.ok, true);
    assert.equal(fresh.receipt.revision, before.receipt.revision, "Storage-only no-op did not advance or replace the actual Session");
    assert.equal(fresh.scope.target.owner.instanceId, before.scope.target.owner.instanceId); assert.equal(fresh.scope.target.sessionId, before.scope.target.sessionId);
    assert.notEqual(fresh.scope.target.source.mappingEpoch, before.scope.target.source.mappingEpoch);
    const applied = await edit(page, [{ field: "desc", valueJson: '"fresh post-noop proof"' }], "fresh-post-noop-edit"); assert.equal(applied.ok, true, JSON.stringify(applied)); assert.equal(applied.persisted, false);
    for (const [file, expected] of hashes) assert.equal(hash(await readFile(path.join(fixture.directory, file))), expected, "Neither no-op nor later unsaved metadata modifies " + file);
    assert.equal(fixture.calls.filter(call => call.op === "save-program-document").length, 1); assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test("Source saving and a delayed real ACK mint no new grant and preserve a newer unblurred variable draft", { timeout: 120_000 }, async () => {
  const fixture = await openFixture(sourceFile); const { page } = fixture;
  try {
    await openVariables(page, sourceId); await pinSelected(page); const before = await captureRead(page, "edit", "source-before-delayed-save"); assert.equal(before.receipt.ok, true);
    await variableForm(page).locator('input[title="备注"]').fill("first saved variable ticket"); await doc(page).getByRole("tab", { name: "主程序", exact: true }).click();
    const gate = fixture.deferNextSaveAck(); await doc(page).locator(".action-project-data-editor-save").click(); await gate.entered;
    const pinCount = await successfulPins(page); await pinSelected(page); assert.equal(await successfulPins(page), pinCount, "The still-pending ACK cannot authorize a new variable pin");
    const refused = await edit(page, [{ field: "desc", valueJson: '"old proof while saving"' }], "source-saving-edit"); assert.equal(refused.ok, false); assert.equal(refused.application, "not_applied");
    await variableForm(page).locator('input[title="备注"]').fill("human variable draft newer than ACK"); gate.release();
    await page.waitForFunction(() => !document.querySelector('[data-workspace-document]:not([hidden]) .action-project-data-editor-save')?.textContent?.includes("保存中"));
    assert.equal(await variableForm(page).locator('input[title="备注"]').inputValue(), "human variable draft newer than ACK");
    const disk = await sourceInspect(fixture.directory); assert.match(disk.editorJson, /first saved variable ticket/); assert.doesNotMatch(disk.editorJson, /human variable draft newer than ACK/);
    await pinSelected(page); const current = await captureRead(page, "edit", "source-after-delayed-save"); assert.equal(current.receipt.ok, true, JSON.stringify(current.receipt)); assert.match(current.receipt.variable.variableJson, /human variable draft newer than ACK/);
    assert.equal(current.scope.target.owner.instanceId, before.scope.target.owner.instanceId); assert.equal(current.scope.target.sessionId, before.scope.target.sessionId);
    assert.notEqual(current.scope.target.source.mappingEpoch, before.scope.target.source.mappingEpoch); assert.equal(fixture.calls.filter(call => call.op === "save-program-document").length, 1); assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});
