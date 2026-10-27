import assert from "node:assert/strict";
import childProcess, { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports, createRequire } from "node:module";
import path from "node:path";
import { after, test } from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

// Actual Source codec -> WorkspaceDocumentHost/APDE -> private registry -> original Session.
// All native APIs are unavailable. Only source/document runs in the owned local workspace.
const actionId = "72746f6f-7401-4101-8101-000000000003";
const sourceFile = "source/program.source.yaml", nativeStepId = "s-1", sourceId = "source-real-variable";
const resource = "external variable default\r\nkept byte for byte\r\n";
const integer = "9007199254740993123456789", decimal = "0.12345678901234567890123456789";
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex").toUpperCase();
const taskRoot = path.resolve(process.cwd(), "../.tmp/source-step-live-provenance/dom");
const binding = { hostInstanceId: "source-step-dom-synthetic-instance", hostSessionId: "0123456789abcdef0123456789abcdef",
  endpoint: "QuickerRpc_User_000000000000000000000000_0123456789abcdef0123456789abcdef", protocolVersion: 1,
  schemaVersion: 1, hostKind: "v1", quickerVersion: "synthetic", capabilities: { "action.source.read": true, "action.source.write": true } };
const unknown = '{"integer":' + integer + ',"decimal":' + decimal + ',"nil":null,"empty":{}}';
const nativeBody = '{"Steps":[{"StepRunnerKey":"sys:comment","StepId":"s-1","Note":"native-looking-prefix original","Disabled":true,"unknownStep":' + unknown + '},{"StepRunnerKey":"sys:comment","Note":"idless original","Disabled":true}],"Variables":[{"Id":"source-real-variable","Key":"message","Type":0,"Desc":"variable original","DefaultValue":' + JSON.stringify(resource) + '}],"SubPrograms":[],"unknownRoot":' + unknown + '}';
const caw = '{"steps":[{"key":"sys:comment","stepId":"s-1","note":"native-looking-prefix original","disabled":true,"unknownStep":' + unknown + '},{"key":"sys:comment","note":"idless original","disabled":true}],"variables":[{"id":"source-real-variable","key":"message","varType":"text","desc":"variable original","default":' + JSON.stringify(resource) + '}],"subPrograms":[],"unknownRoot":' + unknown + ',"$schema":"quicker.action.v1"}';
const yaml = `$schema: quicker.program.source.v1\r\nvariables:\r\n  - id: source-real-variable\r\n    key: message\r\n    varType: text\r\n    desc: variable original\r\n    default.file: files/default.txt\r\nsteps:\r\n  - key: "sys:comment"\r\n    stepId: s-1\r\n    note: native-looking-prefix original\r\n    disabled: true\r\n    unknownStep:\r\n      integer: ${integer}\r\n      decimal: ${decimal}\r\n      nil: null\r\n      empty: {}\r\n  - key: "sys:comment"\r\n    note: idless original\r\n    disabled: true\r\nsubPrograms: []\r\nunknownRoot:\r\n  integer: ${integer}\r\n  decimal: ${decimal}\r\n  nil: null\r\n  empty: {}\r\n`;
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
async function makeFiles() {
  await ensureRuntime(); const cwd = await mkdtemp(path.join(taskRoot, "dom-case-")); owned(cwd);
  const directory = path.join(cwd, "source"); await mkdir(path.join(directory, ".qkrpc"), { recursive: true }); await mkdir(path.join(directory, "files"));
  await writeFile(path.join(directory, "program.source.yaml"), yaml); await writeFile(path.join(directory, "files/default.txt"), resource);
  await writeFile(path.join(directory, "quicker.source.json"), JSON.stringify({ schema: "quicker.source-bundle.v1", kind: "action", actionId, title: "Source step DOM fixture", editVersion: "7", hostBinding: binding, storageIdentity: null, readSource: "catalog" }));
  await writeFile(path.join(directory, ".qkrpc/baseline.json"), '{"schema":"qkrpc.native-baseline.v1","actionId":' + JSON.stringify(actionId) + ',"hostBinding":' + JSON.stringify(binding) + ',"editVersion":"7","bodyHash":' + JSON.stringify(hash(nativeBody)) + ',"body":' + nativeBody + ',"cawHash":' + JSON.stringify(hash(caw)) + ',"caw":' + caw + ',"storageIdentity":null}');
  // Prove the fixture through the real offline codec before opening the renderer.
  // A malformed or unsupported bundle is a codec failure, not a browser timeout.
  try { return { cwd, directory, initialDocument: await sourceInspect(directory), close: () => removeOwned(cwd) }; }
  catch (error) { await removeOwned(cwd); throw error; }
}
const browserEntry = `
import React,{StrictMode,useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WorkspaceExplorerPanelProvider,WorkspaceExplorerShellProvider,useWorkspaceExplorerEditor} from '@/lib/workspace-explorer';
import {WorkspaceDocumentHost} from '@/components/workspace/WorkspaceDocumentHost';
import {WorkspaceExplorerPanel} from '@/components/workspace/WorkspaceExplorerPanel';
import '@/app/globals.css';
const config=window.fixtureConfig,state=window.fixture={cwd:config.cwd,pins:[],stepPins:[],requests:[],unexpected:[],sourceClients:[],endpoints:[]},observedRegistries=new WeakSet();
window.EventSource=class{close(){}};
let sequence=0;
window.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.href),id=++sequence;
 const envelope=init.body?JSON.parse(init.body):Object.fromEntries(url.searchParams);state.requests.push({url:url.pathname,...envelope});
 if(init.signal?.aborted)throw new DOMException('Aborted','AbortError');
 const abort=()=>{void window.sourceStepApiCancel(id)};init.signal?.addEventListener('abort',abort,{once:true});
 const response=await window.sourceStepApiStart({id,url:url.href,method:init.method||'GET',body:init.body});
 if(response.stream)return new Response(new ReadableStream({async pull(controller){const part=await window.sourceStepApiRead(id);if(part.done){init.signal?.removeEventListener('abort',abort);controller.close()}else controller.enqueue(Uint8Array.from(atob(part.base64),c=>c.charCodeAt(0)))},async cancel(){init.signal?.removeEventListener('abort',abort);await window.sourceStepApiCancel(id)}}),{status:response.status,headers:response.headers});
 init.signal?.removeEventListener('abort',abort);if(init.signal?.aborted)throw new DOMException('Aborted','AbortError');return new Response(response.body,{status:response.status,headers:response.headers});
};
function Controls(){const editor=useWorkspaceExplorerEditor();useEffect(()=>{state.open=p=>editor.openFile(p);state.active=()=>editor.activeTab;state.close=p=>{const tab=editor.tabs.find(t=>t.path===p);if(tab)editor.closeTab(tab.id)}});return null}
function App(){const[thread,setThread]=useState('chat-a'),[visible,setVisible]=useState(true);state.setThread=setThread;state.hide=()=>setVisible(false);state.show=()=>setVisible(true);
 const presentation=useMemo(()=>({threadId:thread,pinStep:(tag,pin)=>state.stepPins.push({tag,pin,thread}),pinVariable:(tag,pin)=>state.pins.push({tag,pin,thread})}),[thread]);
 const publish=registry=>{state.live=registry;if(!observedRegistries.has(registry)){observedRegistries.add(registry);const register=registry.register;registry.register=(owner,endpoint)=>{state.endpoints.push(endpoint);return register(owner,endpoint)}}return()=>{if(state.live===registry)state.live=null}};
 return <WorkspaceExplorerShellProvider><WorkspaceExplorerPanelProvider cwd={config.cwd}><WorkspaceDocumentHost onLiveProgramDocumentRegistry={publish}><Controls/>{visible&&<WorkspaceExplorerPanel chatPresentation={presentation}/>}</WorkspaceDocumentHost></WorkspaceExplorerPanelProvider></WorkspaceExplorerShellProvider>}
createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);
`;
async function browserBundle() {
  if (compiled) return compiled; const require = createRequire(path.join(process.cwd(), "package.json"));
  const result = await build({ stdin: { contents: browserEntry, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", outfile: "source-step-pin-fixture.js", tsconfig: "tsconfig.json", define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "source-step-owned-chrome", setup(builder) {
      // Observe the real client factory without replacing its methods, owner or callbacks.
      // Diagnostics and the old-CLI fixture inspect what the actual renderer adopted.
      builder.onResolve({ filter: /^@\/lib\/source-bundle-document-client$/ }, () => ({ path: "observed-source-client", namespace: "observe-source-client" }));
      builder.onResolve({ filter: /^actual-source-client$/, namespace: "observe-source-client" }, () => ({ path: path.resolve(process.cwd(), "lib/source-bundle-document-client.ts"), namespace: "file" }));
      builder.onLoad({ filter: /.*/, namespace: "observe-source-client" }, () => {
        const actual = JSON.stringify("actual-source-client");
        return { contents: `import {createSourceBundleDocumentClient as real} from ${actual};export * from ${actual};export function createSourceBundleDocumentClient(options){const client=real(options);window.fixture.sourceClients.push(client);return client}`, loader: "js" };
      });
      builder.onResolve({ filter: /^@iconify\/icons-mdi\// }, args => ({ path: require.resolve(args.path) }));
      builder.onResolve({ filter: /(^@\/components\/(browser\/WorkspaceEmbeddedBrowser|terminal\/WorkspaceEmbeddedTerminal|action-trace\/ActionTracePanel|workspace\/WorkspaceResourceManager|chat\/(ActionIcon|FaIconProvider|DocsViewerTabs))$|shared\/IconControl$|^@\/lib\/(docs-viewer|embedded-terminal-context|action-command-client|action-trace-client)$)/ }, args => ({ path: args.path, namespace: "source-step-chrome" }));
      builder.onLoad({ filter: /.*/, namespace: "source-step-chrome" }, args => {
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
async function openFixture(options: { omitStepIdentity?: boolean } = {}) {
  const bundle = await browserBundle(), fixture = await makeFiles(); let browser: Browser | undefined;
  const streams = new Map<number, { controller: AbortController; reader?: ReadableStreamDefaultReader<Uint8Array> }>(), cancelled = new Set<number>();
  const pending = new Set<Promise<unknown>>();
  const calls: Record<string, unknown>[] = [], errors: string[] = [];
  const close = async () => {
    const page = browser?.contexts()[0]?.pages()[0];
    if (page && !page.isClosed()) {
      const evidence = path.join(taskRoot, "dom-evidence-" + path.basename(fixture.cwd)); await mkdir(evidence, { recursive: true });
      await Promise.all([page.screenshot({ path: path.join(evidence, "final.png"), fullPage: true, timeout: 10_000 }),
        writeFile(path.join(evidence, "state.json"), JSON.stringify({ errors, calls, text: await page.locator("body").innerText().catch(() => "unavailable"),
          source: await page.evaluate(() => (window as any).fixture?.sourceClients?.map((client: any) => {
            const state = client.getState(), document = state.document;
            return { blocked: state.blocked, error: state.error, target: document ? client.getLiveSourceTarget(document.editorJson) : null, identity: document?.stepIdentity, lastSave: client.getLastSaveReceipt() };
          })).catch(() => "unavailable") }, null, 2))]).catch(error => { console.warn("DOM diagnostic capture:", String(error)); });
    }
    for (const stream of streams.values()) { stream.controller.abort(); await stream.reader?.cancel().catch(() => {}); }
    streams.clear(); await Promise.allSettled([...pending]); await browser?.close(); await fixture.close();
  };
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 } }); page.setDefaultTimeout(10_000);
    page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    const origin = `http://localhost/source-step-owned-${randomUUID()}`;
    await page.route("**/*", route => { if (route.request().url() === origin) return route.fulfill({ contentType: "text/html", body: '<!doctype html><html data-theme="light"><head><link rel="icon" href="data:,"></head><body><div id="root"></div></body></html>' }); errors.push(`Unexpected network: ${route.request().url()}`); return route.abort(); });
    await page.exposeBinding("sourceStepApiStart", async (_, input: { id: number; url: string; method: string; body?: string }) => {
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
      if (options.omitStepIdentity && ["open-source-document", "save-program-document", "preview-source-document"].includes(envelope.op)) {
        const omit = (value: unknown): void => {
          if (!value || typeof value !== "object") return;
          if (Array.isArray(value)) { value.forEach(omit); return; }
          const row = value as Record<string, unknown>;
          if (row.kind === "source-bundle-document") delete row.stepIdentity;
          Object.values(row).forEach(omit);
        };
        const mapLine = (line: string) => {
          if (!line.trim()) return line;
          const value = JSON.parse(line); omit(value); return JSON.stringify(value);
        };
        // The production open stream remains alive as its ownership lease. Transform
        // individual frames without buffering to EOF or prematurely releasing it.
        if (response.headers.get("content-type")?.startsWith("application/x-ndjson")) {
          const decoder = new TextDecoder(), encoder = new TextEncoder(); let buffered = "";
          const body = response.body!.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              buffered += decoder.decode(chunk, { stream: true });
              let newline: number;
              while ((newline = buffered.indexOf("\n")) >= 0) {
                controller.enqueue(encoder.encode(mapLine(buffered.slice(0, newline)) + "\n")); buffered = buffered.slice(newline + 1);
              }
            },
            flush(controller) { buffered += decoder.decode(); if (buffered) controller.enqueue(encoder.encode(mapLine(buffered))); },
          }));
          response = new Response(body, { status: response.status, headers: response.headers });
        } else response = new Response(mapLine(await response.text()), { status: response.status, headers: response.headers });
      }
      const headers = Object.fromEntries(response.headers);
      if (headers["content-type"]?.startsWith("application/x-ndjson")) { slot.reader = response.body!.getReader(); return { status: response.status, headers, stream: true }; }
      const body = await response.text();
      streams.delete(input.id); return { status: response.status, headers, body };
      })();
      pending.add(operation); try { return await operation; } finally { pending.delete(operation); }
    });
    await page.exposeBinding("sourceStepApiRead", async (_, id: number) => { const stream = streams.get(id); if (!stream?.reader) return { done: true }; const part = await stream.reader.read(); if (part.done) streams.delete(id); return { done: part.done, ...(part.done ? {} : { base64: Buffer.from(part.value).toString("base64") }) }; });
    await page.exposeBinding("sourceStepApiCancel", async (_, id: number) => { const stream = streams.get(id); if (!stream) { cancelled.add(id); return; } stream.controller.abort(); await stream.reader?.cancel().catch(() => {}); streams.delete(id); });
    await page.goto(origin); assert.equal(await page.evaluate(() => isSecureContext && Boolean(crypto.subtle)), true, "Source validation uses real WebCrypto on owned localhost");
    await page.addStyleTag({ content: bundle.css + "\nhtml,body,#root{height:100%;margin:0}.workspace-side-panel{width:100%;height:100%}" });
    await page.evaluate(config => { (window as any).fixtureConfig = config; }, { cwd: fixture.cwd }); await page.addScriptTag({ content: bundle.js });
    await page.waitForFunction(() => Boolean((window as any).fixture?.open)); await page.evaluate(file => { (window as any).fixture.open(file); }, sourceFile);
    await doc(page).locator(".action-project-data-editor-tabs").waitFor(); return { ...fixture, page, calls, errors, close };
  } catch (error) { await close(); throw error; }
}
const doc = (page: Page) => page.locator("[data-workspace-document]:visible");
const surface = (page: Page) => doc(page).locator(".program-editor-surface:visible");
const note = (page: Page) => surface(page).locator(".step-form-note-input").first();
async function selectStep(page: Page, id: string) {
  await surface(page).locator(`[data-step-id="${id}"]`).click(); await note(page).waitFor();
}
async function pinStep(page: Page) {
  // Actual UI click handler, without a preceding blur that could hide broken flushing.
  await surface(page).getByRole("button", { name: "添加步骤到对话", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
}
async function captureRead(page: Page, operationId = "source-step-read") {
  return page.evaluate(operationId => {
    const f = (window as any).fixture, pinned = f.stepPins.at(-1);
    if (!pinned?.pin?.pinId) throw Error(`Actual step pin failed: ${JSON.stringify(pinned)}`);
    f.selection = f.live.captureForManualSend({ pins: [pinned.pin], threadId: pinned.thread, userMessageId: `manual-${operationId}`, cwd: f.cwd, mode: "edit" });
    if (f.selection.state !== "ready") throw Error(JSON.stringify(f.selection));
    f.readOperationId = operationId;
    f.read = f.live.execute(f.selection.scope, { scopeId: f.selection.scope.scopeId, operationId, input: { action: "read_live" } });
    return { receipt: f.read, tag: pinned.tag, scope: f.selection.scope };
  }, operationId);
}
async function edit(page: Page, value: string, operationId = "source-step-edit") {
  return page.evaluate(({ value, operationId }) => {
    const f = (window as any).fixture, pinned = f.stepPins.at(-1);
    f.command = { scopeId: f.selection.scope.scopeId, operationId, input: { action: "edit_live", readOperationId: f.readOperationId,
      expectedRevision: f.read.revision, stepId: pinned.tag.designerStepId, note: value } };
    return f.live.execute(f.selection.scope, f.command);
  }, { value, operationId });
}
async function hashes(directory: string) {
  return Object.fromEntries(await Promise.all(["program.source.yaml", "quicker.source.json", ".qkrpc/baseline.json", "files/default.txt"]
    .map(async name => [name, hash(await readFile(path.join(directory, name)))])));
}
async function userSave(page: Page) {
  const button = doc(page).locator(".action-project-data-editor-save"); await button.click(); await page.waitForFunction(() => {
    const button = document.querySelector('[data-workspace-document]:not([hidden]) .action-project-data-editor-save') as HTMLButtonElement | null;
    return button?.disabled === true && button.textContent?.includes("保存到工作区");
  });
}

test("Source step +chat uses codec identity, preserves a human draft through one Undo, and saves/reopens only locally", { timeout: 180_000 }, async () => {
  const fixture = await openFixture(), { page } = fixture;
  try {
    const original = fixture.initialDocument, before = await hashes(fixture.directory);
    const identities = original.stepIdentity?.steps;
    assert.ok(Array.isArray(identities), "The explicitly built actual codec must supply step provenance");
    const native = identities.find((row: any) => row.editorId === nativeStepId);
    const local = identities.find((row: any) => row.sourceRowAnchor?.path === "/steps/1");
    assert.equal(original.stepIdentity.authorizesLive, false);
    assert.equal(native?.nativeCheckpointIdProven, true, "A real native ID resembling the generated prefix remains proven");
    assert.equal(native.nativeCheckpointId, nativeStepId);
    assert.ok(local?.editorId); assert.equal(local.documentLocalIdentityProven, true); assert.equal(local.nativeIdentity, "unknown");

    await selectStep(page, native.editorId); await note(page).fill("human unblurred Note");
    assert.equal(await note(page).evaluate(element => element === document.activeElement), true);
    await pinStep(page);
    await page.evaluate(() => { const f = (window as any).fixture; f.originalEndpoint = f.endpoints.at(-1); if (!f.originalEndpoint) throw Error("Actual registered endpoint was not observed"); });
    const read = await captureRead(page);
    assert.equal(read.receipt.ok, true, JSON.stringify(read.receipt)); assert.equal(read.scope.target.format, "source-bundle");
    assert.equal(read.scope.target.owner.path, sourceFile); assert.equal(read.scope.target.identity.projectBinding, undefined);
    assert.equal(read.scope.target.source.hostBinding.hostSessionId, binding.hostSessionId);
    assert.equal(JSON.parse(read.receipt.content).steps[0].note, "human unblurred Note", "Pin flushes the actual focused Note editor into the original Session");
    const changed = await edit(page, "Agent Note in original Session");
    assert.equal(changed.ok, true, JSON.stringify(changed)); assert.equal(changed.persisted, false);
    await page.waitForFunction(() => (document.querySelector(".program-editor-surface .step-form-note-input") as HTMLInputElement)?.value === "Agent Note in original Session");
    assert.deepEqual(await hashes(fixture.directory), before, "Renderer live edits do not write YAML, managed files or resource bytes");
    await doc(page).locator('[title="撤销 (Ctrl+Z)"]').click();
    assert.equal(await note(page).inputValue(), "human unblurred Note", "One Undo removes only the Agent transaction");
    await doc(page).locator('[title^="重做 ("]').click();
    assert.equal(await note(page).inputValue(), "Agent Note in original Session");
    assert.equal(fixture.calls.filter(call => call.op === "save-program-document").length, 0);

    await userSave(page);
    assert.equal(await page.evaluate(() => { const f = (window as any).fixture; return f.endpoints.at(-1) === f.originalEndpoint; }), true, "a source catalog refresh must not reset the Session's row-lifetime observer");
    const saved = await sourceInspect(fixture.directory);
    assert.match(saved.editorJson, /Agent Note in original Session/); assert.equal(saved.pending.status, "pending");
    assert.equal(saved.stepIdentity.steps.find((row: any) => row.editorId === nativeStepId)?.nativeCheckpointId, nativeStepId);
    const stale = await edit(page, "old Save proof must fail", "post-save-old-proof");
    assert.equal(stale.ok, false); assert.equal(stale.application, "not_applied");

    // An idless original row has document-local identity, never a manufactured native ID.
    await selectStep(page, local.editorId); await pinStep(page);
    const localRead = await captureRead(page, "document-local-read"); assert.equal(localRead.receipt.ok, true, JSON.stringify(localRead.receipt));
    const localChanged = await edit(page, "idless local Agent Note", "document-local-edit"); assert.equal(localChanged.ok, true, JSON.stringify(localChanged));
    await userSave(page);
    const final = await sourceInspect(fixture.directory), finalLocal = final.stepIdentity.steps.find((row: any) => row.sourceRowAnchor?.path === "/steps/1");
    assert.equal(finalLocal?.nativeIdentity, "unknown"); assert.equal(finalLocal.nativeCheckpointIdProven, false);
    assert.equal(finalLocal.sourceIdProven, false); assert.equal(finalLocal.documentLocalIdentityProven, true);
    const text = await readFile(path.join(fixture.directory, "program.source.yaml"), "utf8");
    assert.match(text, /Agent Note in original Session/); assert.match(text, /idless local Agent Note/);
    assert.match(text, new RegExp(integer)); assert.match(text, /0\.12345678901234567890123456789/);
    assert.match(text, /default\.file: files\/default\.txt/); assert.match(text, /nil: null/); assert.match(text, /empty: \{\}/);
    const after = await hashes(fixture.directory);
    for (const name of ["quicker.source.json", ".qkrpc/baseline.json", "files/default.txt"]) assert.equal(after[name], before[name], `${name} remains byte-identical`);
    assert.equal(await readFile(path.join(fixture.directory, "data.json"), "utf8").then(() => true, () => false), false, "Source Save never creates the legacy JSON path");

    await page.evaluate(file => { (window as any).fixture.close(file); }, sourceFile); await doc(page).waitFor({ state: "hidden" });
    await page.evaluate(file => { (window as any).fixture.open(file); }, sourceFile);
    await selectStep(page, nativeStepId); assert.equal(await note(page).inputValue(), "Agent Note in original Session");
    assert.equal(await page.evaluate(() => { const f = (window as any).fixture; return f.endpoints.at(-1) === f.originalEndpoint; }), false, "an explicit reopen creates a new Session observer");
    await selectStep(page, finalLocal.editorId); assert.equal(await note(page).inputValue(), "idless local Agent Note");
    const reopenedStale = await edit(page, "closed owner must fail", "post-reopen-old-proof"); assert.equal(reopenedStale.ok, false); assert.equal(reopenedStale.application, "not_applied");
    assert.equal(fixture.calls.filter(call => call.op === "save-program-document").length, 2);
    assert.equal(fixture.calls.some(call => /sync|write|run/.test(String(call.op))), false); assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test("an older Source response without stepIdentity denies step pins but retains variable live and ordinary local Save", { timeout: 120_000 }, async () => {
  const fixture = await openFixture({ omitStepIdentity: true }), { page } = fixture;
  try {
    const before = await hashes(fixture.directory);
    await selectStep(page, nativeStepId); await note(page).fill("ordinary human Note without step provenance"); await pinStep(page);
    assert.equal(await page.evaluate(() => (window as any).fixture.stepPins.filter((row: any) => row.pin?.pinId).length), 0);
    assert.equal(await note(page).inputValue(), "ordinary human Note without step provenance");
    assert.equal(await page.evaluate(() => (window as any).fixture.sourceClients.at(-1).getState().document.stepIdentity), undefined);

    await surface(page).getByRole("button", { name: "打开变量面板", exact: true }).click();
    await surface(page).locator(`[data-variable-id="${sourceId}"]`).click();
    await surface(page).getByRole("button", { name: "添加变量到对话", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
    const variableRead = await page.evaluate(() => {
      const f = (window as any).fixture, pinned = f.pins.at(-1);
      if (!pinned?.pin?.pinId) throw Error("Existing variable identity was broken by the missing optional step descriptor");
      const selected = f.live.captureForManualSend({ pins: [pinned.pin], threadId: pinned.thread, userMessageId: "old-codec-variable-turn", cwd: f.cwd, mode: "read" });
      if (selected.state !== "ready") throw Error(JSON.stringify(selected));
      return f.live.execute(selected.scope, { scopeId: selected.scope.scopeId, operationId: "old-codec-variable-read", input: { action: "read_live", variableFor: { surface: pinned.tag.surface, variableId: pinned.tag.variableId } } });
    });
    assert.equal(variableRead.ok, true, JSON.stringify(variableRead)); assert.equal(variableRead.variable.variableId, sourceId);
    await userSave(page);
    assert.match(await readFile(path.join(fixture.directory, "program.source.yaml"), "utf8"), /ordinary human Note without step provenance/);
    const after = await hashes(fixture.directory);
    for (const name of ["quicker.source.json", ".qkrpc/baseline.json", "files/default.txt"]) assert.equal(after[name], before[name]);
    assert.equal(fixture.calls.filter(call => call.op === "save-program-document").length, 1); assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});
