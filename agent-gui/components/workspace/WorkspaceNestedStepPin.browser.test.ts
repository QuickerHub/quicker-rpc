import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium, type Page } from "playwright";

// Real file host, APDE, retained editor surfaces, private registry and Session.
// Files/native chrome are fake; every real browser request is denied.
const fixture = `
import React,{StrictMode,useEffect,useMemo} from 'react';
import {createRoot} from 'react-dom/client';
import {WorkspaceExplorerPanelProvider,WorkspaceExplorerShellProvider,useWorkspaceExplorerEditor} from '@/lib/workspace-explorer';
import {WorkspaceDocumentHost} from '@/components/workspace/WorkspaceDocumentHost';
import {WorkspaceExplorerPanel} from '@/components/workspace/WorkspaceExplorerPanel';
import '@/app/globals.css';
const action='11111111-1111-4111-8111-111111111111';
const file='.quicker/actions/'+action+'/data.json',second='.quicker/actions/22222222-2222-4222-8222-222222222222/data.json';
const step=(id,note)=>({stepId:id,stepRunnerKey:'sys:fixture',note,inputParams:{msg:'before'},outputParams:{errMessage:'result'}});
const program=(id,name,steps,subPrograms=[],kind=1)=>({id,name,kind,steps,variables:[],subPrograms});
const body=duplicate=>JSON.stringify({steps:[step(duplicate?'nested':'main','main original')],variables:[],subPrograms:[program('foreign','Foreign cache',[step('cached','foreign')],[program('foreign-child','Foreign child',[step('cached-child','foreign descendant')])],2),program('outer','Outer',[step('outer-step','outer')],[program('inner','Inner',[{...step('nested','nested original'),future:'INT64',decimal:'DECIMAL'}])])]},null,2).replace('"INT64"','9007199254740993').replace('"DECIMAL"','0.12345678901234567890123456789');
const cwd='C:/nested-browser-fixture';
const state=window.fixture={file,second,cwd,body,pins:[],requests:[],unexpected:[],writes:[],files:new Map()};
state.files.set(file,body(Boolean(window.fixtureDuplicate)));state.files.set(second,JSON.stringify({steps:[step('second','second original')],variables:[],subPrograms:[]}));
window.EventSource=class{close(){}};
window.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input.url,'http://fixture.invalid');
 const request=init?.body?JSON.parse(init.body):Object.fromEntries(url.searchParams);state.requests.push({path:url.pathname,...request});
 if(url.pathname==='/api/workspace'){
  if(request.op==='program-document-target')return Response.json({ok:true,projectDirectory:request.path.replace(/\\/data.json$/,''),projectBinding:null});
  if(request.op==='tree')return Response.json({ok:true,tree:{rootPath:'.quicker/actions',children:[]},subprogramTree:{rootPath:'.quicker/subprograms',children:[]}});
  if(request.op==='list')return Response.json({ok:true,entries:[],truncated:false});
  if(request.op==='read')return Response.json({ok:true,path:request.path,content:state.files.get(request.path)??JSON.stringify({kind:'action',id:request.path.split('/').at(-2),title:'Nested fixture',icon:'',editVersion:1}),truncated:false});
 }
 state.unexpected.push(url.pathname+':'+request.op);throw Error('Unexpected fake request '+url.pathname+':'+request.op);
};
function Controls(){const editor=useWorkspaceExplorerEditor();useEffect(()=>{state.open=p=>editor.openFile(p,state.files.get(p));state.active=()=>editor.activeTab;});return null;}
function Dock(){const presentation=useMemo(()=>({threadId:'chat',pinStep:(tag,pin)=>state.pins.push({tag,pin})}),[]);return <WorkspaceExplorerPanel chatPresentation={presentation}/>;}
const publish=registry=>{state.live=registry;return()=>{if(state.live===registry)state.live=null;};};
createRoot(document.getElementById('root')).render(<StrictMode><WorkspaceExplorerShellProvider><WorkspaceExplorerPanelProvider cwd={cwd}><WorkspaceDocumentHost onLiveProgramDocumentRegistry={publish}><Controls/><Dock/></WorkspaceDocumentHost></WorkspaceExplorerPanelProvider></WorkspaceExplorerShellProvider></StrictMode>);
`;

async function compile() {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  const result = await build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", outfile: "fixture.js", tsconfig: "tsconfig.json",
    define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "nested-pin-boundaries", setup(builder) {
      builder.onResolve({ filter: /^@iconify\/icons-mdi\// }, (args) => ({ path: require.resolve(args.path) }));
      builder.onResolve({ filter: /(^@\/components\/(browser\/WorkspaceEmbeddedBrowser|terminal\/WorkspaceEmbeddedTerminal|action-trace\/ActionTracePanel|workspace\/WorkspaceResourceManager|chat\/(FileEditorCard|DocsViewerTabs|ActionIcon|FaIconProvider))$|shared\/IconControl$|^@\/lib\/(docs-viewer|embedded-terminal-context|action-command-client|action-trace-client)$)/ }, (args) => ({ path: args.path, namespace: "boundary" }));
      builder.onLoad({ filter: /.*/, namespace: "boundary" }, (args) => {
        if (args.path.endsWith("docs-viewer")) return { contents: "export const useDocsViewer=()=>({activeDoc:null});", loader: "js" };
        if (args.path.endsWith("embedded-terminal-context")) return { contents: "export const useEmbeddedTerminal=()=>({open:false});", loader: "js" };
        if (args.path.endsWith("action-command-client")) return { contents: "export const isQuickerActionMissingError=()=>false;export function invokeActionCommand(){throw Error('Host prohibited')}", loader: "js" };
        if (args.path.endsWith("action-trace-client")) return { contents: "export function startActionTrace(){throw Error('Trace prohibited')}", loader: "js" };
        if (args.path.endsWith("IconControl")) return { contents: "export const IconControl=()=>null;", loader: "js" };
        if (args.path.endsWith("FaIconProvider")) return { contents: "export const FaIconProvider=p=>p.children;", loader: "js" };
        if (args.path.endsWith("ActionIcon")) return { contents: "export const ActionIcon=()=>null;", loader: "js" };
        if (args.path.endsWith("FileEditorCard")) return { contents: "import React from 'react';export const FileEditorCard=p=><pre>{p.content}</pre>;", loader: "jsx", resolveDir: process.cwd() };
        if (args.path.endsWith("DocsViewerTabs")) return { contents: "export const DocsViewerPanel=()=>null;", loader: "js" };
        const name = args.path.split("/").at(-1)!;
        return { contents: `export const ${name}=()=>null;`, loader: "js" };
      });
    } }] });
  return { js: result.outputFiles.find((file) => file.path.endsWith(".js"))!.text,
    css: result.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "" };
}
let compilation: ReturnType<typeof compile> | undefined;

async function openFixture(duplicate = false) {
  const compiled = await (compilation ??= compile());
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); page.setDefaultTimeout(5_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/*", (route) => { errors.push(`network:${route.request().url()}`); return route.abort(); });
    await page.setContent('<html data-theme="dark"><body><div id="root"></div></body></html>');
    await page.evaluate((value) => { (window as any).fixtureDuplicate = value; }, duplicate);
    await page.addScriptTag({ content: `(() => {
      const entries = new Map(); Object.defineProperty(window, "localStorage", { configurable: true, value: {
        getItem: key => entries.get(key) ?? null, setItem: (key, entry) => entries.set(key, entry), removeItem: key => entries.delete(key) } });
    })();` });
    await page.addStyleTag({ content: compiled.css + "\nhtml,body,#root{height:100%;margin:0}.workspace-side-panel{width:100%;height:100%}" });
    await page.addScriptTag({ content: compiled.js });
    await page.waitForFunction(() => Boolean((window as any).fixture?.open));
    await page.evaluate(() => { const f = (window as any).fixture; f.open(f.file); });
    await note(page).waitFor();
    await document(page).getByText("未绑定宿主 · 可保存到工作区，无法同步到 Quicker", { exact: true }).waitFor();
    return { browser, page, errors };
  } catch (error) { await browser.close(); throw error; }
}
const document = (page: Page) => page.locator('[data-workspace-document]:visible');
const note = (page: Page) => document(page).locator('.program-editor-surface:visible .step-form-note-input');
async function screenshot(page: Page, name: string) {
  const directory = process.env.WORKSPACE_DOCUMENT_SCREENSHOTS_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, `nested-pin-${name}.png`), fullPage: true });
}
async function openInner(page: Page) {
  await document(page).getByLabel("打开或新建内部子程序", { exact: true }).click();
  await document(page).getByRole("button", { name: "Outer / Inner", exact: true }).click();
  await document(page).getByRole("tabpanel", { name: "Inner", exact: true }).waitFor();
}

test("nested pin fixture compiles the actual host/APDE/editor graph", { timeout: 60_000 }, async () => {
  const compiled = await (compilation ??= compile());
  assert.match(compiled.js, /resolveProgramDocumentStepPin/); assert.match(compiled.js, /captureForManualSend/);
  assert.ok(compiled.css.length > 0);
});

test("a nested UI pin keeps its root owner, current human draft and one undo while another file is visible", {
  timeout: 60_000, skip: process.env.QK_NESTED_PIN_COMPILE_ONLY === "1" ? "compile only; real Edge acceptance remains pending" : false,
}, async () => {
  const { browser, page, errors } = await openFixture();
  try {
    await document(page).getByLabel("打开或新建内部子程序", { exact: true }).click();
    assert.equal(await document(page).getByRole("button", { name: /Foreign/ }).count(), 0);
    await document(page).getByRole("button", { name: "Outer / Inner", exact: true }).click();
    await note(page).fill("nested human without blur");
    await document(page).getByRole("button", { name: "添加步骤到对话", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
    const pinned = await page.evaluate(() => (window as any).fixture.pins.at(-1));
    assert.ok(pinned.pin.pinId); assert.equal(pinned.tag.programTarget, "action"); assert.equal(pinned.tag.programId, "11111111-1111-4111-8111-111111111111");
    assert.equal(pinned.tag.subProgramId, undefined); assert.equal(pinned.tag.nodePath, "subPrograms/1/subPrograms/0/steps/0");
    assert.match(pinned.tag.content, /nested human without blur/); assert.match(pinned.tag.content, /9007199254740993/);
    await note(page).fill("nested human after pin");
    await document(page).getByRole("tab", { name: "主程序", exact: true }).click();
    const read = await page.evaluate(() => {
      const f = (window as any).fixture; f.selection = f.live.captureForManualSend({ pins: [f.pins.at(-1).pin], cwd: f.cwd, threadId: "chat", userMessageId: "manual", mode: "edit" });
      if (f.selection.state !== "ready") throw Error(JSON.stringify(f.selection));
      f.proof = f.live.execute(f.selection.scope, { scopeId: f.selection.scope.scopeId, operationId: "read", input: { action: "read_live" } });
      return f.proof;
    });
    assert.equal(read.ok, true); assert.match(read.content, /nested human after pin/);
    await page.evaluate(() => { const f = (window as any).fixture; f.open(f.second); }); await note(page).waitFor();
    assert.equal(await note(page).inputValue(), "second original");
    const applied = await page.evaluate(() => { const f = (window as any).fixture, scope = f.selection.scope;
      return f.live.execute(scope, { scopeId: scope.scopeId, operationId: "edit", input: { action: "edit_live", readOperationId: "read", expectedRevision: f.proof.revision, stepId: "nested", note: "Agent nested" } }); });
    assert.equal(applied.ok, true); assert.equal(applied.persisted, false); assert.equal(await note(page).inputValue(), "second original");
    await page.evaluate(() => { const f = (window as any).fixture; f.open(f.file); });
    await document(page).getByRole("tab", { name: "Inner", exact: true }).click();
    assert.equal(await note(page).inputValue(), "Agent nested");
    await document(page).locator('[title="撤销 (Ctrl+Z)"]').click();
    assert.equal(await note(page).inputValue(), "nested human after pin");
    await screenshot(page, "human-undo");
    assert.equal(await page.evaluate(() => { const f = (window as any).fixture; return f.files.get(f.file) === f.body(false); }), true);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("a duplicate UUID in a different surface produces explicit UI feedback and no private pin", {
  timeout: 45_000, skip: process.env.QK_NESTED_PIN_COMPILE_ONLY === "1" ? "compile only; real Edge acceptance remains pending" : false,
}, async () => {
  const { browser, page, errors } = await openFixture(true);
  try {
    await openInner(page);
    await document(page).getByRole("button", { name: "添加步骤到对话", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
    await document(page).getByText("步骤标识在当前文档中不唯一，无法加入对话", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => (window as any).fixture.pins.length), 0);
    await screenshot(page, "duplicate-rejected");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []); assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
