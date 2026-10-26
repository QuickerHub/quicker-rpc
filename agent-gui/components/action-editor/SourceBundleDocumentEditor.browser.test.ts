import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, before, test } from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

// The native target is synthetic. Source projection, preview, local writes,
// ownership, APDE and history are production implementations. Native catalog
// reads are unavailable; the mocked native commit always returns unknown.
const actionId = "91b53f26-0101-4101-8101-000000000001";
const stepId = "source-dom-real-step";
const resource = "line one\r\nline two\r\nline three\r\nline four\r\nline five\r\n";
const body = '{"Steps":[{"StepRunnerKey":"sys:comment","StepId":"source-dom-real-step","Note":"source fixture initial note","Disabled":true,"unknownStep":{"integer":9007199254740993123456789,"decimal":0.12345678901234567890123456789}}],"Variables":[{"Id":"source-dom-real-variable","Key":"message","Type":0,"DefaultValue":' + JSON.stringify(resource) + ',"unknownVariable":null}],"SubPrograms":[],"unknownRoot":{"keep":true}}';
const caw = '{"steps":[{"key":"sys:comment","stepId":"source-dom-real-step","note":"source fixture initial note","disabled":true,"unknownStep":{"integer":9007199254740993123456789,"decimal":0.12345678901234567890123456789}}],"variables":[{"id":"source-dom-real-variable","key":"message","varType":"text","default":' + JSON.stringify(resource) + ',"unknownVariable":null}],"subPrograms":[],"unknownRoot":{"keep":true},"$schema":"quicker.action.v1"}';
const yaml = `# synthetic browser acceptance fixture\r\n$schema: quicker.program.source.v1\r\nvariables:\r\n  - id: source-dom-real-variable\r\n    key: message\r\n    varType: text\r\n    default.file: files/default.txt\r\n    unknownVariable: null\r\nsteps:\r\n  - key: "sys:comment"\r\n    stepId: source-dom-real-step\r\n    note: source fixture initial note\r\n    disabled: true\r\n    unknownStep:\r\n      integer: 9007199254740993123456789\r\n      decimal: 0.12345678901234567890123456789\r\nsubPrograms: []\r\nunknownRoot:\r\n  keep: true\r\n`;
const binding = { hostInstanceId: "source-dom-synthetic-instance", hostSessionId: "0123456789abcdef0123456789abcdef",
  endpoint: "QuickerRpc_User_000000000000000000000000_0123456789abcdef0123456789abcdef", protocolVersion: 1,
  schemaVersion: 1, hostKind: "v1", quickerVersion: "synthetic", capabilities: { "action.source.read": true, "action.source.write": true } };
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex").toUpperCase();
const taskRoot = path.resolve(process.cwd(), "../.tmp/source-bundle-designer");
let cli = "";
let handlers: typeof import("../../app/api/workspace/route");
let sourceServer: typeof import("../../lib/source-bundle-document.server");
let requestContext: typeof import("../../lib/qkrpc-request-context");
let compiled: { js: string; css: string } | undefined;
let isolatedProfile = "";
const oldEnvironment: Record<string, string | undefined> = {};

function owned(directory: string): void {
  const relative = path.relative(taskRoot, directory);
  assert.ok(relative && !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`), "Test files must stay within their owned temporary root");
}
async function removeOwned(directory: string): Promise<void> {
  owned(directory);
  const actual = await realpath(directory), actualRoot = await realpath(taskRoot);
  const relative = path.relative(actualRoot, actual);
  assert.ok(relative && !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`), "Resolved cleanup target escaped the owned temporary root");
  await rm(actual, { recursive: true, force: true });
}
async function makeFixture() {
  await mkdir(taskRoot, { recursive: true });
  const cwd = await mkdtemp(path.join(taskRoot, "ui-fixture-probe-")); owned(cwd);
  const directory = path.join(cwd, "bundle");
  await mkdir(path.join(directory, ".qkrpc"), { recursive: true });
  await mkdir(path.join(directory, "files"));
  await writeFile(path.join(directory, "program.source.yaml"), yaml);
  await writeFile(path.join(directory, "files/default.txt"), resource);
  await writeFile(path.join(directory, "quicker.source.json"), JSON.stringify({ schema: "quicker.source-bundle.v1", kind: "action", actionId,
    title: "Synthetic source DOM fixture", editVersion: "7", hostBinding: binding, storageIdentity: null, readSource: "catalog" }));
  // Hash the exact compact fixture JSON text; no native or YAML codec is implemented here.
  const baseline = '{"schema":"qkrpc.native-baseline.v1","actionId":' + JSON.stringify(actionId)
    + ',"hostBinding":' + JSON.stringify(binding) + ',"editVersion":"7","bodyHash":' + JSON.stringify(hash(body))
    + ',"body":' + body + ',"cawHash":' + JSON.stringify(hash(caw)) + ',"caw":' + caw + ',"storageIdentity":null}';
  await writeFile(path.join(directory, ".qkrpc/baseline.json"), baseline);
  return { cwd, directory, file: "bundle/program.source.yaml", close: () => removeOwned(cwd) };
}
async function invoke(args: string[], input?: unknown) {
  assert.ok((args[0] === "source" && args[1] === "document") || (args[0] === "action" && args[1] === "save" && args.includes("--dry-run")), "The fixture cannot dispatch a native operation");
  const child = spawn(cli, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, QKRPC_HOST_BINDING: "offline-operation-must-not-read-this", QKRPC_HOST_SESSION: "must-not-connect" } });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
  child.stdout.on("data", value => { stdout += value; }); child.stderr.on("data", value => { stderr += value; });
  const completion = new Promise<number | null>((done, reject) => { child.once("error", reject); child.once("close", done); });
  child.stdin.end(input === undefined ? undefined : JSON.stringify(input));
  const timer = setTimeout(() => child.kill(), 30_000);
  let code: number | null;
  try { code = await completion; } finally { clearTimeout(timer); }
  const parsed = JSON.parse(stdout);
  return { ok: code === 0 && parsed.ok === true, stdout, stderr, parsed, code };
}
async function inspect(directory: string) {
  const result = await invoke(["source", "document", "--json"], { mode: "inspect", dir: directory });
  assert.ok(result.ok, result.parsed.message ?? result.stderr); return result.parsed.data;
}
async function hashes(directory: string) {
  return Object.fromEntries(await Promise.all(["program.source.yaml", "quicker.source.json", ".qkrpc/baseline.json", "files/default.txt"]
    .map(async name => [name, hash(await readFile(path.join(directory, name)))])));
}

before(async () => {
  const requested = process.env.QKRPC_SOURCE_DOCUMENT_BIN?.trim();
  assert.ok(requested && path.isAbsolute(requested), "QKRPC_SOURCE_DOCUMENT_BIN must point to the explicitly built Console CLI; this suite never uses an installed CLI or silently skips");
  cli = requested;
  assert.equal((await stat(cli)).isFile(), true);
  await mkdir(taskRoot, { recursive: true });
  isolatedProfile = await mkdtemp(path.join(taskRoot, "ui-fixture-probe-profile-")); owned(isolatedProfile);
  for (const key of ["QKRPC_BIN", "QKRPC_TRANSPORT", "QUICKER_AGENT_DATA_DIR"]) oldEnvironment[key] = process.env[key];
  process.env.QKRPC_BIN = cli; process.env.QKRPC_TRANSPORT = "cli";
  process.env.QUICKER_AGENT_DATA_DIR = isolatedProfile;
  handlers = await import("../../app/api/workspace/route");
  sourceServer = await import("../../lib/source-bundle-document.server");
  requestContext = await import("../../lib/qkrpc-request-context");
});
after(async () => {
  for (const [key, value] of Object.entries(oldEnvironment)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  if (isolatedProfile) await removeOwned(isolatedProfile);
});

const browserEntry = `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SourceBundleDocumentEditor} from '@/components/action-editor/SourceBundleDocumentEditor';
import '@/app/globals.css';
const config=window.fixtureConfig, state=window.fixture={calls:[],replies:[],saved:0,pins:[]};
let sequence=0;
window.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url,'http://source-fixture.invalid');
 const nativeRead=url.pathname==='/api/subprogram/list'||['/api/step-runner/','/api/fa/','/api/designer/resources/'].some(prefix=>url.pathname.startsWith(prefix));
 if(url.pathname!=='/api/workspace'&&!nativeRead)throw Error('Unexpected browser boundary: '+url.pathname);
 if(init.signal?.aborted)throw new DOMException('Aborted','AbortError');
 const id=++sequence;
 const abort=()=>{void window.sourceApiCancel(id);};
 init.signal?.addEventListener('abort',abort,{once:true});
 const result=await window.sourceApiStart({id,url:url.href,method:init.method||'GET',body:init.body});
 state.replies.push({id,op:init.body?JSON.parse(init.body).op:url.searchParams.get('op')});
 if(result.stream){
  return new Response(new ReadableStream({async pull(controller){const part=await window.sourceApiRead(id);if(part.done){init.signal?.removeEventListener('abort',abort);controller.close();}else controller.enqueue(Uint8Array.from(atob(part.base64),v=>v.charCodeAt(0)));},async cancel(){init.signal?.removeEventListener('abort',abort);await window.sourceApiCancel(id);}}),{status:result.status,headers:result.headers});
 }
 init.signal?.removeEventListener('abort',abort);
 if(init.signal?.aborted)throw new DOMException('Aborted','AbortError');
 return new Response(result.body,{status:result.status,headers:result.headers});
};
function Fixture(){
 const [active,setActive]=useState(true),[mounted,setMounted]=useState(true),[generation,setGeneration]=useState(0);
 return <div className="fixture-shell"><nav><button onClick={()=>setActive(false)}>Hide owned document</button><button onClick={()=>setActive(true)}>Show owned document</button><button onClick={()=>setMounted(false)}>Close owned document</button><button onClick={()=>{setGeneration(v=>v+1);setMounted(true);setActive(true);}}>Reopen owned document</button></nav>
 <section hidden={!active} style={{flex:1,minHeight:0}}>{mounted&&<SourceBundleDocumentEditor key={generation} active={active} cwd={config.cwd} path={config.path} content={config.content} onSave={async()=>{throw Error('Legacy save must not run');}} onSaved={()=>{state.saved++;}} onPinStepToChat={tag=>state.pins.push(tag)}/>}</section></div>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;
async function browserBundle() {
  if (compiled) return compiled;
  const result = await build({ stdin: { contents: browserEntry, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", outfile: "source-browser-fixture.js", tsconfig: path.join(process.cwd(), "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "source-chrome-boundaries", setup(builder) {
      builder.onResolve({ filter: /(^@\/components\/chat\/(ActionIcon|FaIconProvider)$|shared\/IconControl$|^@\/lib\/(workspace-explorer|chat-composer-bridge|action-command-client|action-trace-client)$)/ }, args => ({ path: args.path, namespace: "source-chrome" }));
      builder.onLoad({ filter: /.*/, namespace: "source-chrome" }, args => {
        if (args.path.endsWith("workspace-explorer")) return { contents: "export const workspaceExplorerActionsRef={current:{notifyProjectRemoved(){}}};", loader: "js" };
        if (args.path.endsWith("chat-composer-bridge")) return { contents: "export const chatComposerActionsRef={current:{insertProgramStepTag(){throw Error('No source file line grant');},focusComposer(){}}};", loader: "js" };
        if (args.path.endsWith("action-command-client")) return { contents: "export const isQuickerActionMissingError=()=>false;export function invokeActionCommand(){throw Error('Native commands prohibited');}", loader: "js" };
        if (args.path.endsWith("action-trace-client")) return { contents: "export function startActionTrace(){throw Error('Native trace prohibited');}", loader: "js" };
        if (args.path.endsWith("FaIconProvider")) return { contents: "export const FaIconProvider=p=>p.children;", loader: "js" };
        return { contents: `export function ${args.path.endsWith("ActionIcon") ? "ActionIcon" : "IconControl"}(){return null}`, loader: "js" };
      });
    } }] });
  return compiled = { js: result.outputFiles.find(file => file.path.endsWith(".js"))!.text, css: result.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "" };
}

async function openBrowserFixture() {
  const fixture = await makeFixture();
  let browser: Browser | undefined;
  const streams = new Map<number, { controller: AbortController; reader?: ReadableStreamDefaultReader<Uint8Array> }>();
  const cancelled = new Set<number>();
  let saveGate: { entered: Promise<void>; enter(): void; wait: Promise<void>; release(): void } | undefined;
  const gates = new Set<NonNullable<typeof saveGate>>();
  const close = async () => {
    for (const gate of gates) gate.release(); gates.clear();
    for (const stream of streams.values()) { stream.controller.abort(); await stream.reader?.cancel().catch(() => {}); }
    streams.clear(); await browser?.close(); await fixture.close();
  };
  try {
  await inspect(fixture.directory);
  browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } }); page.setDefaultTimeout(10_000);
  const errors: string[] = [], calls: Record<string, unknown>[] = [];
  const nativeReads: Record<string, any>[] = [];
  let commits = 0;
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/*", route => { errors.push(`Unexpected network: ${route.request().url()}`); return route.abort(); });
  await page.exposeBinding("sourceApiStart", async (_, input: { id: number; url: string; method: string; body?: string }) => {
    const controller = new AbortController(), slot = { controller, reader: undefined as ReadableStreamDefaultReader<Uint8Array> | undefined };
    streams.set(input.id, slot); if (cancelled.delete(input.id)) controller.abort();
    const req = new Request(input.url, { method: input.method, ...(input.body === undefined ? {} : { body: input.body, headers: { "Content-Type": "application/json" } }), signal: controller.signal });
    const envelope = input.body ? JSON.parse(input.body) : Object.fromEntries(new URL(input.url).searchParams);
    calls.push(envelope);
    let response: Response;
    if (new URL(input.url).pathname !== "/api/workspace") {
      nativeReads.push(envelope);
      response = Response.json({ ok: false, code: "HOST_CAPABILITY_UNAVAILABLE", error: "Synthetic fixture has no native catalog", retryable: false }, { status: 503 });
    } else if (envelope.op === "sync-source-document") {
      const value = await requestContext.runWithAgentRequestContextAsync({ cwd: fixture.cwd, abortSignal: controller.signal }, () => sourceServer.syncSourceBundleDocument(envelope, {
        runSync: async (args, dryRun, document) => {
          if (dryRun) return invoke([...args, "--json"]);
          commits++;
          return { ok: false, stdout: "", stderr: "synthetic native acknowledgement lost", parsed: { ok: false, error: "WRITE_RESULT_UNKNOWN", data: { persisted: null, consumedSnapshot: document.sourceSnapshot.revision } } };
        },
      }));
      response = Response.json(value, { status: value.ok ? 200 : 409 });
    } else response = input.method === "POST" ? await handlers.POST(req) : await handlers.GET(req);
    const headers = Object.fromEntries(response.headers);
    if (headers["content-type"]?.startsWith("application/x-ndjson")) { slot.reader = response.body!.getReader(); return { status: response.status, headers, stream: true }; }
    const responseBody = await response.text();
    if (saveGate && envelope.op === "save-program-document") { const gate = saveGate; saveGate = undefined; gate.enter(); await gate.wait; gates.delete(gate); }
    streams.delete(input.id);
    return { status: response.status, headers, body: responseBody };
  });
  await page.exposeBinding("sourceApiRead", async (_, id: number) => {
    const stream = streams.get(id); if (!stream?.reader) return { done: true };
    const part = await stream.reader.read();
    if (part.done) streams.delete(id);
    return { done: part.done, ...(part.done ? {} : { base64: Buffer.from(part.value).toString("base64") }) };
  });
  await page.exposeBinding("sourceApiCancel", async (_, id: number) => {
    const stream = streams.get(id); if (!stream) { cancelled.add(id); return; }
    stream.controller.abort(); await stream.reader?.cancel().catch(() => {}); streams.delete(id);
  });
  const bundle = await browserBundle();
  await page.setContent('<html data-theme="light"><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: bundle.css + "\nhtml,body,#root,.fixture-shell{height:100%;margin:0}.fixture-shell{display:flex;flex-direction:column;padding:8px;box-sizing:border-box}.fixture-shell>section{display:flex;flex-direction:column}.fixture-shell>section[hidden]{display:none}" });
  await page.evaluate(config => { (window as any).fixtureConfig = config; }, { cwd: fixture.cwd, path: fixture.file, content: yaml });
  await page.addScriptTag({ content: bundle.js });
  await page.locator(`[data-step-id="${stepId}"]`).waitFor();
  return { ...fixture, page, errors, calls, nativeReads, commits: () => commits,
    deferSave() {
      let enter!: () => void, release!: () => void;
      const entered = new Promise<void>(done => { enter = done; }), wait = new Promise<void>(done => { release = done; });
      saveGate = { entered, enter, wait, release }; gates.add(saveGate); return { entered, release };
    },
    close,
  };
  } catch (error) { await close(); throw error; }
}
const note = (page: Page) => page.locator(".program-editor-surface:visible .step-form-note-input").first();
const save = (page: Page) => page.locator(".action-project-data-editor-save");
async function settleNote(page: Page, content: string) { await note(page).fill(content); await page.locator(".program-editor-surface:visible .step-row").first().focus(); }
async function saved(page: Page) { await page.waitForFunction(() => (document.querySelector(".action-project-data-editor-save") as HTMLButtonElement)?.disabled === true && !document.querySelector('.action-project-data-editor-tab[aria-selected="true"]')?.textContent?.includes("*")); }

test("synthetic bundle is accepted by the actual offline codec without installed or live host fallback", async () => {
  const fixture = await makeFixture();
  try {
    const before = await hashes(fixture.directory), document = await inspect(fixture.directory);
    assert.equal(document.pending.status, "clean"); assert.equal(document.pending.nativeState, "unobserved");
    assert.match(document.editorJson, /9007199254740993123456789/); assert.match(document.editorJson, /0\.12345678901234567890123456789/);
    assert.match(document.editorJson, /default\.file/); assert.match(document.editorJson, /"unknownVariable"\s*:\s*null/);
    const result = await invoke(["source", "document", "--json"], { mode: "save-local", dir: fixture.directory, expectedSnapshot: document.sourceSnapshot.revision, baselineEditorJson: document.editorJson, editorJson: document.editorJson });
    assert.ok(result.ok, result.parsed.message); assert.deepEqual(await hashes(fixture.directory), before);
  } finally { await fixture.close(); }
});

test("source APDE saves two real codec edits, preserves resources and unknown numbers, and previews readonly YAML", { timeout: 120_000 }, async () => {
  const fixture = await openBrowserFixture();
  try {
    const before = await hashes(fixture.directory);
    assert.equal(await fixture.page.locator(".action-project-meta-summary .project-info-title").innerText(), "Synthetic source DOM fixture");
    const target = fixture.page.locator("[data-source-bundle-target]");
    assert.match(await target.locator("summary").innerText(), /来源目标：V1 · Quicker synthetic.*当前宿主状态未核验/);
    await target.locator("summary").click();
    assert.deepEqual(await target.locator("dd").allTextContents(), [actionId, binding.hostInstanceId, binding.hostSessionId, binding.endpoint]);
    await target.locator("summary").click();
    assert.equal(fixture.commits(), 0);
    assert.equal(await fixture.page.getByRole("tab", { name: "属性", exact: true }).count(), 0);
    await note(fixture.page).fill("first unblurred source edit");
    // A real pointer can cause blur before click. Do not pre-blur the draft or
    // bypass browser event ordering with force/DOM-triggered clicks.
    const button = await save(fixture.page).boundingBox(); assert.ok(button);
    await fixture.page.mouse.click(button.x + button.width / 2, button.y + button.height / 2, { delay: 50 });
    await fixture.page.waitForFunction(() => (window as any).fixture.saved === 1);
    await saved(fixture.page);
    assert.match(await readFile(path.join(fixture.directory, "program.source.yaml"), "utf8"), /first unblurred source edit/);
    await settleNote(fixture.page, "second source edit"); await save(fixture.page).click(); await saved(fixture.page);
    const text = await readFile(path.join(fixture.directory, "program.source.yaml"), "utf8");
    assert.match(text, /second source edit/); assert.match(text, /9007199254740993123456789/); assert.match(text, /0\.12345678901234567890123456789/);
    assert.match(text, /default\.file: files\/default\.txt/); assert.match(text, /unknownVariable: null/);
    const after = await hashes(fixture.directory);
    for (const name of ["quicker.source.json", ".qkrpc/baseline.json", "files/default.txt"]) assert.equal(after[name], before[name]);
    await settleNote(fixture.page, "current draft YAML preview");
    await fixture.page.getByRole("tab", { name: "源码 YAML（只读）", exact: true }).click();
    const preview = fixture.page.locator(".action-project-data-editor-source-panel .cm-content");
    await preview.getByText("current draft YAML preview", { exact: false }).waitFor();
    assert.equal(await preview.getAttribute("contenteditable"), "false");
    assert.ok(fixture.calls.some(call => call.op === "preview-source-document"));
    assert.ok(fixture.nativeReads.length > 0, "The source catalog port was exercised at its unavailable native boundary");
    for (const read of fixture.nativeReads) {
      assert.equal(read.catalogContext?.format, "source-bundle"); assert.equal(read.catalogContext?.expectedProjectBinding, null);
      assert.equal(typeof read.catalogContext?.sourceBundle?.ownerToken, "string");
      assert.match(read.catalogContext?.sourceBundle?.expectedSnapshot ?? "", /^sha256:/);
      assert.equal(read.catalogContext?.sourceBundle?.hostBinding?.hostSessionId, binding.hostSessionId);
    }
    assert.doesNotMatch(await readFile(path.join(fixture.directory, "program.source.yaml"), "utf8"), /current draft YAML preview/);
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test("hidden source owner retains an unblurred draft and reopening reads pending from the actual checkpoint", { timeout: 120_000 }, async () => {
  const fixture = await openBrowserFixture();
  try {
    await note(fixture.page).fill("retained hidden source draft"); await fixture.page.getByRole("button", { name: "Hide owned document", exact: true }).click();
    const beforeBlockedWrite = await hashes(fixture.directory);
    const blocked = await handlers.POST(new Request("http://source-fixture.invalid/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "write", cwd: fixture.cwd, path: fixture.file, content: "must not replace owned source" }) }));
    const writeFailure = await blocked.json();
    assert.equal(writeFailure.ok, false); assert.match(writeFailure.error, /该源码包正由设计器持有/);
    assert.deepEqual(await hashes(fixture.directory), beforeBlockedWrite);
    const other = await handlers.GET(new Request(`http://source-fixture.invalid/api/workspace?${new URLSearchParams({ op: "open-source-document", cwd: fixture.cwd, path: fixture.file, ownerKey: "another-chat" })}`));
    assert.equal(other.status, 409); assert.equal((await other.json()).code, "SOURCE_DOCUMENT_OPEN");
    await fixture.page.getByRole("button", { name: "Show owned document", exact: true }).click(); assert.equal(await note(fixture.page).inputValue(), "retained hidden source draft");
    await save(fixture.page).click(); await saved(fixture.page);
    await fixture.page.getByRole("button", { name: "Close owned document", exact: true }).click();
    await fixture.page.waitForFunction(() => !document.querySelector(".action-project-data-editor-save"));
    await fixture.page.getByRole("button", { name: "Reopen owned document", exact: true }).click();
    await note(fixture.page).waitFor(); assert.equal(await note(fixture.page).inputValue(), "retained hidden source draft");
    assert.match(await fixture.page.locator("[data-source-bundle-status]").innerText(), /本地待同步.*当前宿主状态未核验/s);
    await fixture.page.getByRole("button", { name: "同步到 Quicker", exact: true }).click();
    await fixture.page.getByText(/同步派发后|synthetic native acknowledgement lost|结果未确认/).first().waitFor();
    assert.equal(fixture.commits(), 1); assert.equal(await fixture.page.getByRole("button", { name: "同步到 Quicker", exact: true }).isDisabled(), true);
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test("a delayed real local-save ACK advances only its ticket and keeps a newer APDE draft and history", { timeout: 120_000 }, async () => {
  const fixture = await openBrowserFixture();
  try {
    await settleNote(fixture.page, "first saved source ticket");
    const deferred = fixture.deferSave(); await save(fixture.page).click(); await deferred.entered;
    assert.match(await readFile(path.join(fixture.directory, "program.source.yaml"), "utf8"), /first saved source ticket/);
    await settleNote(fixture.page, "newer source draft during ACK"); deferred.release();
    await fixture.page.waitForFunction(() => !(document.querySelector(".action-project-data-editor-save") as HTMLButtonElement)?.disabled);
    assert.equal(await note(fixture.page).inputValue(), "newer source draft during ACK");
    await save(fixture.page).click(); await saved(fixture.page);
    assert.match(await readFile(path.join(fixture.directory, "program.source.yaml"), "utf8"), /newer source draft during ACK/);
    const undo = fixture.page.getByRole("button", { name: /撤销/, exact: false }).first(); await undo.click();
    assert.equal(await note(fixture.page).inputValue(), "first saved source ticket");
    await save(fixture.page).click(); await saved(fixture.page);
    assert.match(await readFile(path.join(fixture.directory, "program.source.yaml"), "utf8"), /first saved source ticket/);
    await fixture.page.getByRole("toolbar", { name: "文档历史", exact: true }).getByTitle("重做 (Ctrl+Y / Ctrl+Shift+Z)", { exact: true }).click();
    assert.equal(await note(fixture.page).inputValue(), "newer source draft during ACK");
    await save(fixture.page).click(); await saved(fixture.page);
    assert.match(await readFile(path.join(fixture.directory, "program.source.yaml"), "utf8"), /newer source draft during ACK/);
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test("closing and reopening a source owner cannot let an old completed-write ACK alter the new Session", { timeout: 120_000 }, async () => {
  const fixture = await openBrowserFixture();
  try {
    await settleNote(fixture.page, "old source owner saved ticket");
    const deferred = fixture.deferSave(); await save(fixture.page).click(); await deferred.entered;
    await fixture.page.getByRole("button", { name: "Close owned document", exact: true }).click();
    await fixture.page.waitForFunction(() => !document.querySelector(".action-project-data-editor-save"));
    await fixture.page.getByRole("button", { name: "Reopen owned document", exact: true }).click();
    await note(fixture.page).waitFor(); assert.equal(await note(fixture.page).inputValue(), "old source owner saved ticket");
    await settleNote(fixture.page, "new owner draft remains current");
    deferred.release();
    await fixture.page.waitForFunction(() => (window as any).fixture.replies.some((reply: any) => reply.op === "save-program-document"));
    assert.equal(await note(fixture.page).inputValue(), "new owner draft remains current");
    assert.equal(await fixture.page.evaluate(() => (window as any).fixture.saved), 0, "The departed APDE cannot publish an onSaved callback into its replacement");
    assert.equal(await save(fixture.page).isDisabled(), false);
    await save(fixture.page).click(); await saved(fixture.page);
    const storedDocument = await inspect(fixture.directory);
    assert.equal(storedDocument.pending.status, "pending");
    assert.match(storedDocument.editorJson, /new owner draft remains current/);
    assert.match(storedDocument.editorJson, /source-dom-real-step/);
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});
