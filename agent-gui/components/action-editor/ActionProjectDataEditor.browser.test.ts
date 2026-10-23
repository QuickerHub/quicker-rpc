import assert from "node:assert/strict";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { after, before, test } from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

// The complete editor/controller graph is real. Only host/file/chrome boundaries
// are replaced, and browser requests can never reach a server or user workspace.
const fixture = `
import React, { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ActionProjectDataEditor } from '@/components/action-editor/ActionProjectDataEditor';
import { StepRunnerItem } from '@/lib/action-editor/types/action_query';
import '@/app/globals.css';
const pathFor = id => '.quicker/actions/'+(id==='a'?'11111111-1111-4111-8111-111111111111':'22222222-2222-4222-8222-222222222222')+'/data.json';
const step = (id, note) => ({stepId:id,stepRunnerKey:'sys:fixture_note',note,inputParams:{'script.file':'files/script.cs'},fixtureStep:{keep:true}});
const body = id => ({steps:[step('s-'+id, id+' initial')],variables:[{id:'v-'+id,key:'var_'+id,varType:'Text','default.file':'files/default.txt',fixtureVariable:{keep:true}}]});
const makeDocument = id => JSON.stringify({...body(id),subPrograms:[{id:'child',name:'Child',kind:1,...body('child'),subPrograms:[{id:'nested',name:'Nested',kind:1,...body('nested'),subPrograms:[]}]}],fixtureRoot:{keep:true}},null,2)+'\\n';
const makeInfo = id => '{"kind":"action","id":"'+pathFor(id).split('/').at(-2)+'","title":"Fixture action","description":"original description","icon":"iconify:mdi:code-tags","editVersion":9223372036854775807,"fixtureFuture":9007199254740993}';
const runner = StepRunnerItem.fromPartial({key:'sys:fixture_note',name:'Fixture module',icon:'iconify:mdi:code-tags',inputParamDefs:[],outputParamDefs:[]});
const capability = StepRunnerItem.fromPartial({key:'sys:fixture_capability',name:'Fixture capability',category:'Text',secondaryCategories:['System'],inputParamDefs:[{key:'mode',name:'Mode',isControlField:true,varType:9,variableMode:1,allowInput:true,selectionItems:[{value:'copy',name:'Copy fixture'}]},{key:'text',name:'Text',varType:0,variableMode:1,allowInput:true}],outputParamDefs:[]});
const state = window.fixture = {calls:[],saved:[],requests:[],unexpected:[],pending:[],mode:'success',pathFor,makeDocument};
const bindingFor=id=>({schemaVersion:1,kind:'action',actionId:pathFor(id).split('/').at(-2),hostBinding:{hostInstanceId:'instance-'+id,hostSessionId:(id==='a'?'a':'b').repeat(32),endpoint:'QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_'+(id==='a'?'a':'b').repeat(32),protocolVersion:1,schemaVersion:1,hostKind:id==='a'?'v1':'v2',quickerVersion:window.fixtureOptions?.invalidVersion?{future:true}:'fixture-'+id,capabilities:{'action.legacyBody.read':true,'action.legacyBody.write':true}}});
state.targetFiles=Object.fromEntries(['a','b'].map(id=>[pathFor(id),bindingFor(id)]));state.targetMode=window.fixtureOptions?.targetMode||'bound';state.targetPending=[];state.transportCalls=[];
state.infoFiles=Object.fromEntries(['a','b'].map(id=>[pathFor(id).replace(/data.json$/,'info.json'),makeInfo(id)]));
state.documentCalls=[];state.documentPending=[];state.documentMode='success';
state.syncCalls=[];state.syncPending=[];state.syncMode='success';
state.syncStatusMode='success';state.statusPending=[];
state.deferInfoRead=false;state.infoPending=[];state.infoReadError=null;
state.syncStatus={state:'in_sync',message:'fixture in sync',localEditVersion:1,remoteEditVersion:1};
state.commitDocument=(request,outcome)=>{if(request.metadata&&(outcome.ok||outcome.persistedParts?.metadata))state.infoFiles[request.path.replace(/data.json$/,'info.json')]=request.metadata.content;return outcome;};
window.fetch = async (input, init) => {
 const url = new URL(typeof input==='string'?input:input.url,'http://fixture.invalid');
 state.requests.push(url.pathname);
 let value;
 let syncRequest;
 if(url.pathname==='/api/workspace' && url.searchParams.get('op')==='program-document-target') {
   const path=url.searchParams.get('path');
   const result=state.targetMode==='error'?{ok:false,code:'unsafe_path',error:'fixture unsafe target'}:{ok:true,projectDirectory:path.replace(/\\/data.json$/,''),projectBinding:state.targetMode==='unbound'?null:state.targetFiles[path]};
   value=state.targetMode==='defer'?await new Promise(resolve=>state.targetPending.push({path,resolve:()=>resolve(result)})):result;
 }
 else if(url.pathname==='/api/workspace' && init?.method==='POST') {
   const request=JSON.parse(init.body);state.transportCalls.push(request);value=await state.legacySave(request.content);
 }
 else if(url.pathname==='/api/workspace/action-sync') {
   const request=JSON.parse(init?.body||'{}');state.syncCalls.push(request);
   syncRequest=request;
   if(request.op==='status' && state.syncStatusMode==='defer')value=await new Promise(resolve=>state.statusPending.push({request,resolve}));
   else if(request.op==='status')value={ok:true,status:state.syncStatus};
   else if(request.op==='push' && state.syncMode==='defer')value=await new Promise(resolve=>state.syncPending.push({request,resolve}));
   else if(request.op==='push')value={ok:true,message:'fixture synced',editVersion:2};
   else {state.unexpected.push('sync:'+request.op);throw new Error('Unexpected sync operation');}
 }
 else if(url.pathname==='/api/step-runner/list') value={ok:true,items:[runner,capability]};
 else if(url.pathname==='/api/step-runner/get' && url.searchParams.get('key')==='sys:fixture_note') value={ok:true,item:runner};
 else if(url.pathname==='/api/step-runner/get' && url.searchParams.get('key')==='sys:fixture_capability') value={ok:true,item:capability};
 else if(url.pathname==='/api/step-runner/toolbox-search') value={ok:true,json:JSON.stringify({items:[{kind:'runner',id:'r:sys:fixture_capability:copy',label:'Copy fixture',parentLabel:'Fixture capability',payload:{stepRunnerKey:'sys:fixture_capability',name:'Fixture capability',controlFieldValue:'copy',inputPresets:{mode:'copy',text:'preset text'}}}],totalCount:1,hasMore:false})};
 else if(url.pathname==='/api/step-runner/summaries') {const request=JSON.parse(init?.body||'{}');value={ok:true,items:(request.steps||[]).map(row=>({stepId:row.stepId,summary:'Fixture summary'}))};}
 else if(url.pathname==='/api/subprogram/list') value={ok:true,items:[]};
 else {state.unexpected.push(url.pathname+url.search);throw new Error('Unexpected fixture request: '+url.pathname+url.search);}
 if(syncRequest?.expectedProjectBinding&&value.ok)value={...value,projectBinding:syncRequest.expectedProjectBinding,projectDirectory:syncRequest.projectDirectory};
 return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
};
function Fixture(){
 const [document,setDocument]=useState({path:pathFor('a'),content:makeDocument('a')});
 const [documentSaveEnabled,setDocumentSaveEnabled]=useState(false);
 const [generation,setGeneration]=useState(0);
 const documentRef=useRef(document);documentRef.current=document;
 const onSave=useCallback(async content=>{
   const call={path:document.path,content};state.calls.push(call);
   if(state.mode==='fail') return {ok:false,error:'fixture save rejected'};
   if(state.mode==='defer') return new Promise(resolve=>state.pending.push({call,resolve}));
   return {ok:true};
 },[document.path]);
 state.legacySave=onSave;
 const onSaveDocument=useCallback(async request=>{
   state.documentCalls.push(request);
   if(state.documentMode==='defer')return new Promise(resolve=>state.documentPending.push({request,resolve:outcome=>resolve(state.commitDocument(request,outcome))}));
   if(state.documentMode==='partial')return state.commitDocument(request,{ok:false,error:'fixture metadata write failed',persistedParts:{body:true}});
   if(state.documentMode==='conflict')return {ok:false,code:'metadata_conflict',error:'fixture external metadata conflict'};
   if(state.documentMode==='identity')return {ok:false,code:'identity_conflict',error:'fixture external target changed'};
   return state.commitDocument(request,{ok:true});
 },[]);
 const onSaved=useCallback(()=>state.saved.push(document.path),[document.path]);
 useEffect(()=>{
   state.current=()=>documentRef.current;
   state.setDocument=(id,content)=>setDocument({path:pathFor(id),content:content??makeDocument(id)});
   state.replaceContent=content=>setDocument(current=>({...current,content}));
   state.echoPending=index=>{const pending=state.pending[index];setDocument(current=>current.path===pending.call.path?{...current,content:pending.call.content}:current)};
   state.resolvePending=(index,outcome)=>state.pending[index].resolve(outcome);
   state.enableDocumentSave=()=>setDocumentSaveEnabled(true);
   state.remountEditor=()=>setGeneration(value=>value+1);
   state.resolveDocumentPending=(index,outcome)=>state.documentPending[index].resolve(outcome);
 },[]);
 return <div className="fixture-shell" data-fixture-path={document.path}><ActionProjectDataEditor key={generation} path={document.path} content={document.content} cwd="C:/fixture-workspace" onSave={onSave} onSaveDocument={documentSaveEnabled?onSaveDocument:undefined} onSaved={onSaved}/></div>;
}
createRoot(document.getElementById('root')).render(<StrictMode><Fixture/></StrictMode>);
`;

const fileBoundary = `
export async function fetchWorkspaceFile(_cwd,path){
 const f=window.fixture;
 if(path.endsWith('/info.json')){
  if(f.infoReadError)return{ok:false,error:f.infoReadError};
  const result={ok:true,path,content:f.infoFiles[path],truncated:false};
  if(f.deferInfoRead)return await new Promise(resolve=>f.infoPending.push({path,resolve:()=>resolve(result)}));
  return result;
 }
 if(path.endsWith('/files/script.cs'))return{ok:true,path,content:'// fixture only',truncated:false};
 if(path.endsWith('/files/default.txt'))return{ok:true,path,content:'fixture default',truncated:false};
 if(path===f.pathFor('a')||path===f.pathFor('b'))return{ok:true,path,content:path===f.current().path?f.current().content:f.makeDocument(path===f.pathFor('a')?'a':'b'),truncated:false};
 f.unexpected.push('file:'+path);return{ok:false,error:'Unknown fixture file'};
}
export async function fetchWorkspaceFileList(){return{ok:true,entries:[{path:'data.json',kind:'file'},{path:'info.json',kind:'file'},{path:'files/script.cs',kind:'file'},{path:'files/default.txt',kind:'file'}]}}
export async function writeWorkspaceFileApi(){throw new Error('No fixture file writes allowed')}
export async function deleteActionProjectApi(_cwd,path){const f=window.fixture;f.localDeletes=(f.localDeletes||[]).concat(path);return{ok:true}}
`;

let browser: Browser;
let javascript = "";
let stylesheet = "";
const requestedScreenshotDirectory = process.env.QKRPC_ACTION_EDITOR_SCREENSHOTS;
const screenshotDirectory = requestedScreenshotDirectory ? path.resolve(requestedScreenshotDirectory) : undefined;

before(async () => {
  if (screenshotDirectory) {
    const temporaryRoots = [path.resolve(process.cwd(), "../.tmp"), path.resolve(process.cwd(), "../../..", ".tmp")];
    assert.ok(path.isAbsolute(requestedScreenshotDirectory!) && temporaryRoots.some((root) => {
      const relative = path.relative(root, screenshotDirectory);
      return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
    }), "Screenshots must use an absolute directory inside workspace .tmp");
    await mkdir(screenshotDirectory, { recursive: true });
  }
  const compiled = await build({
    stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    outfile: "fixture.js",
    define: { "process.env.NODE_ENV": '"development"' },
    tsconfig: path.join(process.cwd(), "tsconfig.json"),
    plugins: [{ name: "offline-editor-boundaries", setup(builder) {
      builder.onResolve({ filter: /(^@\/components\/chat\/(FileEditorCard|ActionIcon|FaIconProvider)$|shared\/IconControl$|^@\/lib\/(workspace-file-tool|workspace-explorer-api|workspace-explorer|chat-composer-bridge|action-command-client|action-trace-client)$)/ }, (args) => ({ path: args.path, namespace: "fixture-boundary" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture-boundary" }, (args) => {
        if (args.path.endsWith("workspace-explorer-api")) return { contents: fileBoundary, loader: "js" };
        if (args.path.endsWith("workspace-file-tool")) return { contents: "export const basenamePath=value=>value.replace(/\\\\/g,'/').split('/').pop()||'';export const guessFileLanguage=()=> 'text';", loader: "js" };
        if (args.path.endsWith("chat-composer-bridge")) return { contents: "export const chatComposerActionsRef={current:{insertProgramStepTag(){},focusComposer(){}}};", loader: "js" };
        if (args.path.endsWith("action-command-client")) return { contents: "export function isQuickerActionMissingError(){return false}export function invokeActionCommand(){window.fixture.unexpected.push('unbound toolbar command');throw new Error('Toolbar must be gated')}", loader: "js" };
        if (args.path.endsWith("action-trace-client")) return { contents: "export function startActionTrace(){window.fixture.unexpected.push('unbound toolbar trace');throw new Error('Toolbar must be gated')}", loader: "js" };
        if (args.path.endsWith("workspace-explorer")) return { contents: "export const workspaceExplorerActionsRef={current:{notifyProjectRemoved(){}}};", loader: "js" };
        if (args.path.endsWith("IconControl")) return { contents: "export function IconControl(){return null}", loader: "js" };
        if (args.path.endsWith("ActionIcon")) return { contents: "export function ActionIcon(){return null}", loader: "js" };
        if (args.path.endsWith("FaIconProvider")) return { contents: "export function FaIconProvider(p){return p.children}", loader: "js" };
        if (args.path.endsWith("FileEditorCard")) return { contents: "import React from 'react';export function FileEditorCard(p){return <pre data-source-content data-source-path={p.path}>{p.content}</pre>}", loader: "jsx", resolveDir: process.cwd() };
        const name = args.path.split("/").at(-1)!;
        return { contents: `export function ${name}(){return null}`, loader: "js" };
      });
    } }],
  });
  javascript = compiled.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
  stylesheet = compiled.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "";
  browser = await chromium.launch({ channel: "msedge", headless: true });
});

after(async () => { await browser?.close(); });

async function openFixture(options?: { targetMode?: string; invalidVersion?: boolean }): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(5_000);
  const errors: string[] = [];
  await page.route("**/*", (route) => { errors.push(`network:${route.request().url()}`); return route.abort(); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.setContent('<html data-theme="light"><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: `${stylesheet}\nhtml,body,#root,.fixture-shell{height:100%;margin:0}body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--text)}.fixture-shell{display:flex;flex-direction:column;padding:12px;box-sizing:border-box}` });
  if (options) await page.evaluate((value) => { (window as any).fixtureOptions = value; }, options);
  await page.addScriptTag({ content: javascript });
  await page.waitForSelector('[data-step-id="s-a"]');
  await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  await page.locator(".program-editor-surface:visible .step-form-note-input").waitFor();
  return { page, errors };
}

const currentNote = (page: Page) => page.locator(".program-editor-surface:visible .step-form-note-input");
const saveButton = (page: Page) => page.locator(".action-project-data-editor-save");

async function editNote(page: Page, note: string): Promise<void> {
  await currentNote(page).fill(note);
  await page.locator(".program-editor-surface:visible .step-row").first().focus();
  await page.waitForFunction((value) => document.querySelector(".program-editor-surface:not([hidden]) .step-row")?.textContent?.includes(value), note);
}

async function waitSaveEnabled(page: Page): Promise<void> {
  await page.waitForFunction(() => !(document.querySelector(".action-project-data-editor-save") as HTMLButtonElement)?.disabled);
}

async function waitClean(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((document.querySelector(".action-project-data-editor-save") as HTMLButtonElement)?.disabled)
    && !document.querySelector('.action-project-data-editor-tab[aria-selected="true"]')?.textContent?.includes("*"));
}

async function assertIsolated(page: Page, errors: string[]): Promise<void> {
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []);
  assert.deepEqual(errors, []);
}

async function capture(page: Page, filename: string, theme: "light" | "dark"): Promise<void> {
  if (!screenshotDirectory) return;
  await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
  await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  await page.screenshot({ path: path.join(screenshotDirectory, filename), fullPage: true });
}

test("a delayed local identity read retains edits and saves the exact displayed full target", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture({ targetMode: "defer" });
  try {
    await editNote(page, "draft before target read");
    assert.equal(await saveButton(page).isDisabled(), true);
    assert.equal(await page.locator(".project-info-sync-btn").isDisabled(), true);
    for (const label of ["运行", "调试", "编辑", "悬浮"]) assert.equal(await page.getByRole("button", { name: label, exact: true }).isDisabled(), true);
    await page.evaluate(() => { for (const pending of (window as any).fixture.targetPending) pending.resolve(); });
    await waitSaveEnabled(page);
    assert.equal(await currentNote(page).inputValue(), "draft before target read");
    await page.locator(".action-project-target summary").click();
    assert.match(await page.locator(".action-project-target").innerText(), /V1.*fixture-a/s);
    assert.match(await page.locator(".action-project-target").innerText(), /instance-a/);
    assert.match(await page.locator(".action-project-target").innerText(), /QuickerRpc_User_A{24}_a{32}/);
    for (const label of ["运行", "调试", "编辑", "悬浮"]) assert.equal(await page.getByRole("button", { name: label, exact: true }).isDisabled(), true);
    await capture(page, "00-target-details-light.png", "light");
    await capture(page, "00-target-details-dark.png", "dark");
    await page.setViewportSize({ width: 420, height: 820 });
    const narrowTarget = await page.locator(".action-project-target dd").evaluateAll((elements) => elements.map((element) => ({ width: element.clientWidth, content: element.scrollWidth })));
    assert.ok(narrowTarget.every(({ width, content }) => content <= width), JSON.stringify(narrowTarget));
    const narrowButtonHeights = await page.locator(".action-project-data-editor-toolbar button").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
    assert.ok(narrowButtonHeights.every((height) => height <= 48), JSON.stringify(narrowButtonHeights));
    await capture(page, "00-target-details-narrow-light.png", "light");
    await capture(page, "00-target-details-narrow-dark.png", "dark");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.setViewportSize({ width: 1280, height: 900 });
    await saveButton(page).click();
    await waitClean(page);
    assert.equal(await page.evaluate(() => {
      const f = (window as any).fixture;
      return JSON.stringify(f.transportCalls.at(-1).expectedProjectBinding) === JSON.stringify(f.targetFiles[f.pathFor("a")]);
    }), true);
    await page.locator(".program-project-delete-btn").click();
    const deletion = page.getByRole("alertdialog");
    await deletion.waitFor();
    assert.equal(await deletion.getByRole("checkbox").count(), 0);
    assert.match(await deletion.innerText(), /Quicker 内的项目保留/);
    await deletion.getByRole("button", { name: "删除", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.localDeletes?.length === 1);
    assert.equal(await page.evaluate(() => (window as any).fixture.localDeletes[0]), await page.evaluate(() => (window as any).fixture.pathFor("a").replace(/\/data.json$/, "")));
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("unbound projects can save locally with null identity while invalid targets and identity conflicts retain the draft", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture({ targetMode: "unbound" });
  try {
    await editNote(page, "unbound local draft");
    await waitSaveEnabled(page);
    assert.match(await page.locator(".action-project-target").innerText(), /未绑定宿主/);
    assert.equal(await page.locator(".project-info-sync-btn").isDisabled(), true);
    assert.equal(await page.evaluate(() => (window as any).fixture.syncCalls.length), 0);
    await saveButton(page).click(); await waitClean(page);
    assert.equal(await page.evaluate(() => (window as any).fixture.transportCalls.at(-1).expectedProjectBinding), null);
    await page.evaluate(() => { const f = (window as any).fixture; f.enableDocumentSave(); f.documentMode = "identity"; });
    await editNote(page, "preserved on identity conflict"); await waitSaveEnabled(page);
    await saveButton(page).click();
    await page.getByRole("alert").filter({ hasText: "动作目标已在外部变更" }).waitFor();
    assert.equal(await currentNote(page).inputValue(), "preserved on identity conflict");
    assert.equal(await saveButton(page).isDisabled(), true);
    await assertIsolated(page, errors);
  } finally { await page.close(); }
  const invalid = await openFixture({ targetMode: "error" });
  try {
    await editNote(invalid.page, "unsafe target draft");
    await invalid.page.getByRole("alert").filter({ hasText: "无法确认动作目标" }).waitFor();
    assert.equal(await saveButton(invalid.page).isDisabled(), true);
    assert.equal(await invalid.page.evaluate(() => (window as any).fixture.syncCalls.length), 0);
    await assertIsolated(invalid.page, invalid.errors);
  } finally { await invalid.page.close(); }
  const future = await openFixture({ invalidVersion: true });
  try {
    await future.page.waitForFunction(() => document.querySelector(".action-project-target summary")?.textContent?.includes("版本未知"));
    await assertIsolated(future.page, future.errors);
  } finally { await future.page.close(); }
});

test("late status from the previous binding cannot clear a new document busy owner or show its status", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await page.locator(".action-project-target summary").waitFor();
    await page.evaluate(() => { (window as any).fixture.syncStatusMode = "defer"; });
    await page.locator(".project-info-sync-btn").click();
    await page.waitForFunction(() => (window as any).fixture.statusPending.length >= 1);
    await page.evaluate(() => { (window as any).fixture.setDocument("b"); });
    await page.locator('[data-step-id="s-b"]').waitFor();
    await page.waitForFunction(() => document.querySelector(".action-project-target summary")?.textContent?.includes("V2"));
    await page.locator(".project-info-sync-btn").click();
    await page.waitForFunction(() => (window as any).fixture.statusPending.filter((p: any) => p.request.expectedProjectBinding.hostBinding.hostKind === "v2").length >= 2);
    await page.evaluate(() => { const f = (window as any).fixture; for (const p of f.statusPending.filter((p: any) => p.request.expectedProjectBinding.hostBinding.hostKind === "v1")) p.resolve({ ok: false, error: "stale A status must stay hidden" }); });
    await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    assert.equal(await page.locator(".project-info-sync-btn").isDisabled(), true);
    assert.doesNotMatch(await page.locator(".action-project-data-editor").innerText(), /stale A status/);
    await page.evaluate(() => { const f = (window as any).fixture; for (const p of f.statusPending.filter((p: any) => p.request.expectedProjectBinding.hostBinding.hostKind === "v2")) p.resolve({ ok: true, status: f.syncStatus }); });
    await page.waitForFunction(() => !(document.querySelector(".project-info-sync-btn") as HTMLButtonElement)?.disabled);
    assert.equal(await currentNote(page).inputValue(), "b initial");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("StrictMode starts clean; real compact/variable edits and nested tabs retain the full latest document and history", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await waitClean(page);
    await capture(page, "01-main-light.png", "light");
    await capture(page, "02-main-dark.png", "dark");
    assert.equal(await page.getByRole("tab", { name: "可视化", exact: true }).count(), 1);
    await editNote(page, "main first");
    await editNote(page, "main latest");
    await waitSaveEnabled(page);
    await saveButton(page).click();
    await waitClean(page);
    let saved = await page.evaluate(() => JSON.parse((window as any).fixture.calls.at(-1).content));
    assert.equal(saved.steps[0].note, "main latest");
    assert.deepEqual(saved.fixtureRoot, { keep: true });
    assert.deepEqual(saved.steps[0].fixtureStep, { keep: true });
    assert.equal(saved.steps[0].inputParams["script.file"], "files/script.cs");

    await page.getByRole("button", { name: "打开变量面板", exact: true }).click();
    await page.locator('.variable-form input[title="备注"]').fill("variable latest");
    await page.locator(".variable-toolbar-btn--close").click();
    const addTab = page.locator('summary[aria-label="打开嵌入子程序"]');
    const nestedChoice = page.locator(".program-editor-tab-menu button").filter({ hasText: "Child / Nested" });
    await addTab.click();
    await nestedChoice.focus();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("details.program-editor-tab-add").getAttribute("open"), null);
    assert.equal(await addTab.evaluate((element) => document.activeElement === element), true);
    await page.keyboard.press("Enter");
    await nestedChoice.click();
    await editNote(page, "nested first");
    await editNote(page, "nested latest");
    await capture(page, "03-nested-light.png", "light");
    const mainTab = page.getByRole("tab", { name: "主程序", exact: true });
    const nestedTab = page.getByRole("tab", { name: "Nested", exact: true });
    await mainTab.focus();
    await page.keyboard.press("End");
    assert.equal(await nestedTab.getAttribute("aria-selected"), "true");
    assert.equal(await nestedTab.evaluate((element) => document.activeElement === element), true);
    await page.keyboard.press("Home");
    assert.equal(await mainTab.getAttribute("aria-selected"), "true");
    assert.equal(await currentNote(page).inputValue(), "main latest");
    await page.keyboard.press("ArrowRight");
    assert.equal(await nestedTab.getAttribute("aria-selected"), "true");
    await page.keyboard.press("ArrowRight");
    assert.equal(await mainTab.getAttribute("aria-selected"), "true");
    await page.keyboard.press("ArrowLeft");
    assert.equal(await nestedTab.getAttribute("aria-selected"), "true");
    assert.equal(await currentNote(page).inputValue(), "nested latest");
    await page.getByRole("button", { name: "关闭Nested标签", exact: true }).click();
    await page.locator('summary[aria-label="打开嵌入子程序"]').click();
    await page.locator(".program-editor-tab-menu button").filter({ hasText: "Child / Nested" }).click();
    assert.equal(await currentNote(page).inputValue(), "nested latest");
    await page.locator(".program-editor-surface:visible .step-row").first().focus();
    await page.keyboard.press("Control+z");
    assert.equal(await currentNote(page).inputValue(), "nested first");
    await page.getByRole("tab", { name: "源码 JSON", exact: true }).click();
    saved = JSON.parse(await page.locator("[data-source-content]").textContent() ?? "{}");
    assert.equal(saved.subPrograms[0].subPrograms[0].steps[0].note, "nested first");
    assert.equal(saved.variables[0].desc, "variable latest");
    assert.equal(saved.variables[0]["default.file"], "files/default.txt");
    await page.getByRole("tab", { name: /^可视化/ }).click();
    await page.locator(".program-editor-surface:visible .step-row").first().focus();
    await page.keyboard.press("Control+y");
    assert.equal(await currentNote(page).inputValue(), "nested latest");
    await saveButton(page).click();
    await waitClean(page);
    saved = await page.evaluate(() => JSON.parse((window as any).fixture.calls.at(-1).content));
    assert.equal(saved.subPrograms[0].subPrograms[0].steps[0].note, "nested latest");
    assert.deepEqual(saved.subPrograms[0].subPrograms[0].steps[0].fixtureStep, { keep: true });
    if (screenshotDirectory) {
      await page.setViewportSize({ width: 480, height: 760 });
      await editNote(page, "narrow editable");
      await waitSaveEnabled(page);
      await saveButton(page).click();
      await waitClean(page);
      await page.getByRole("tab", { name: "源码 JSON", exact: true }).click();
      assert.equal(JSON.parse(await page.locator("[data-source-content]").textContent() ?? "{}").subPrograms[0].subPrograms[0].steps[0].note, "narrow editable");
      await page.getByRole("tab", { name: /^可视化/ }).click();
      await mainTab.click();
      assert.equal(await currentNote(page).inputValue(), "main latest");
      await nestedTab.click();
      await capture(page, "04-nested-dark-480px.png", "dark");
    }
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("editing during a pending save keeps the newer draft dirty after its late acknowledgement; failed writes can retry", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await editNote(page, "saved ticket");
    await page.evaluate(() => { (window as any).fixture.mode = "defer"; });
    await waitSaveEnabled(page);
    await saveButton(page).click();
    await page.waitForFunction(() => (window as any).fixture.pending.length === 1);
    await editNote(page, "newer local draft");
    await page.evaluate(() => (window as any).fixture.echoPending(0));
    await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    await page.evaluate(() => (window as any).fixture.resolvePending(0, { ok: true }));
    await page.waitForFunction(() => document.querySelector(".action-project-data-editor-save")?.textContent?.includes("保存到工作区"));
    assert.deepEqual(await page.getByRole("alert").allTextContents(), [], "an owned in-flight content echo must not become an external conflict");
    await waitSaveEnabled(page);
    assert.equal(await currentNote(page).inputValue(), "newer local draft");
    assert.match(await page.getByRole("tab", { name: /^可视化/ }).textContent() ?? "", /\*/);
    await page.evaluate(() => { (window as any).fixture.mode = "fail"; });
    await saveButton(page).click();
    await page.getByText("fixture save rejected", { exact: true }).waitFor();
    await waitSaveEnabled(page);
    await page.evaluate(() => { (window as any).fixture.mode = "success"; });
    await saveButton(page).click();
    await waitClean(page);
    const calls = await page.evaluate(() => (window as any).fixture.calls.map((call: any) => JSON.parse(call.content).steps[0].note));
    assert.deepEqual(calls, ["saved ticket", "newer local draft", "newer local draft"]);
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("external content preserves a dirty draft and blocks overwrite; an old path save cannot mutate the new document", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await editNote(page, "local draft");
    await page.evaluate(() => {
      const f = (window as any).fixture;
      const remote = JSON.parse(f.makeDocument("a"));remote.steps[0].note = "remote change";
      f.replaceContent(JSON.stringify(remote));
    });
    await page.getByRole("alert").filter({ hasText: "工作区文件已在外部变更" }).waitFor();
    assert.equal(await currentNote(page).inputValue(), "local draft");
    assert.equal(await saveButton(page).isDisabled(), true);
    await page.getByRole("tab", { name: "源码 JSON", exact: true }).click();
    assert.equal(JSON.parse(await page.locator("[data-source-content]").textContent() ?? "{}").steps[0].note, "local draft");
    assert.equal(await page.evaluate(() => (window as any).fixture.calls.length), 0);

    // Restoring the original observed baseline clears the external-content conflict.
    await page.evaluate(() => { const f=(window as any).fixture;f.replaceContent(f.makeDocument("a"));f.mode="defer"; });
    await page.getByRole("tab", { name: /^可视化/ }).click();
    await waitSaveEnabled(page);
    await saveButton(page).click();
    await page.waitForFunction(() => (window as any).fixture.pending.length === 1);
    await page.evaluate(() => (window as any).fixture.setDocument("b"));
    await page.waitForSelector('[data-step-id="s-b"]');
    await waitClean(page);
    await page.evaluate(() => (window as any).fixture.resolvePending(0, { ok: true }));
    await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    assert.equal(await currentNote(page).inputValue(), "b initial");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.saved), []);
    await editNote(page, "b local latest");
    await page.evaluate(() => { (window as any).fixture.mode="success"; });
    await saveButton(page).click();
    await waitClean(page);
    const result = await page.evaluate(() => {
      const f=(window as any).fixture;return{path:f.calls.at(-1).path,body:JSON.parse(f.calls.at(-1).content),saved:f.saved};
    });
    assert.match(result.path, /22222222/);
    assert.equal(result.body.steps[0].stepId, "s-b");
    assert.equal(result.body.steps[0].note, "b local latest");
    assert.deepEqual(result.saved, [result.path]);
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("module catalog inserts a capability through the real popup, undo and controller save into the active surface", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    const toolbox = page.getByRole("region", { name: "模块工具箱" });
    await toolbox.getByRole("tab", { name: "Text", exact: true }).waitFor();
    await toolbox.getByPlaceholder("搜索模块…").fill("copy");
    await toolbox.locator(".toolbox-sub-item").filter({ hasText: "Copy fixture" }).dblclick();
    const popup = page.locator(".step-editor-popup");
    await popup.waitFor();
    assert.equal(await page.locator(".program-editor-surface:visible .step-row").count(), 1, "opening params is not a document mutation");
    await popup.getByRole("button", { name: "确定", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll(".program-editor-surface:not([hidden]) .step-row").length === 2);
    await waitSaveEnabled(page);
    await saveButton(page).click();
    await waitClean(page);
    let saved = await page.evaluate(() => JSON.parse((window as any).fixture.calls.at(-1).content));
    const inserted = saved.steps.find((step: any) => step.stepRunnerKey === "sys:fixture_capability");
    assert.equal(inserted.inputParams.mode, "copy");
    assert.equal(inserted.inputParams.text, "preset text");
    await page.locator(".program-editor-surface:visible .step-row").first().focus();
    await page.keyboard.press("Control+z");
    await page.waitForFunction(() => document.querySelectorAll(".program-editor-surface:not([hidden]) .step-row").length === 1);
    await page.keyboard.press("Control+y");
    await page.waitForFunction(() => document.querySelectorAll(".program-editor-surface:not([hidden]) .step-row").length === 2);
    await page.getByLabel("打开嵌入子程序", { exact: true }).click();
    await page.locator(".program-editor-tab-menu").getByRole("button", { name: "Child / Nested", exact: true }).click();
    await toolbox.locator(".toolbox-sub-item").filter({ hasText: "Copy fixture" }).dblclick();
    await popup.waitFor();
    await popup.getByRole("button", { name: "确定", exact: true }).click();
    await waitSaveEnabled(page);
    await saveButton(page).click();
    await waitClean(page);
    saved = await page.evaluate(() => JSON.parse((window as any).fixture.calls.at(-1).content));
    assert.equal(saved.steps.length, 2, "nested insert must not mutate the main body");
    assert.equal(saved.subPrograms[0].subPrograms[0].steps.length, 2);
    assert.equal(saved.subPrograms[0].subPrograms[0].steps.at(-1).inputParams.text, "preset text");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("appearance and body share save tickets, preserve native metadata and retain drafts through partial and late saves", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await page.evaluate(() => (window as any).fixture.enableDocumentSave());
    const properties = page.getByRole("tab", { name: "属性", exact: true });
    await properties.click();
    const appearance = page.getByRole("region", { name: "动作属性" });
    await appearance.getByLabel("标题", { exact: true }).fill("Appearance A");
    await appearance.getByLabel("说明", { exact: true }).fill("First line\nSecond line");
    await appearance.getByLabel("图标", { exact: true }).fill("iconify:mdi:check");
    assert.equal(await page.locator(".program-editor-catalog").isVisible(), false);
    if (screenshotDirectory) {
      await page.screenshot({ path: path.join(screenshotDirectory, "05-properties-light.png"), fullPage: true });
      await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
      await page.setViewportSize({ width: 480, height: 760 });
      await page.screenshot({ path: path.join(screenshotDirectory, "06-properties-dark-480px.png"), fullPage: true });
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    await page.getByRole("tab", { name: "主程序", exact: true }).click();
    await editNote(page, "body A");
    await saveButton(page).click();
    await waitClean(page);
    let calls = await page.evaluate(() => (window as any).fixture.documentCalls);
    assert.equal(calls.length, 1);
    assert.equal(JSON.parse(calls[0].content).steps[0].note, "body A");
    assert.equal(JSON.parse(calls[0].metadata.content).title, "Appearance A");
    assert.match(calls[0].metadata.content, /"editVersion":9223372036854775807/);
    assert.match(calls[0].metadata.content, /"fixtureFuture":9007199254740993/);
    assert.equal(await page.evaluate(() => (window as any).fixture.calls.length), 0, "one document save must not also invoke the legacy body writer");

    await editNote(page, "body B");
    await properties.click();
    await appearance.getByLabel("标题", { exact: true }).fill("Appearance B");
    await page.evaluate(() => { (window as any).fixture.documentMode = "partial"; });
    await saveButton(page).click();
    await page.getByText("fixture metadata write failed", { exact: true }).waitFor();
    await waitSaveEnabled(page);
    assert.equal(await appearance.getByLabel("标题", { exact: true }).inputValue(), "Appearance B");
    await page.evaluate(() => { (window as any).fixture.documentMode = "success"; });
    await saveButton(page).click();
    await waitClean(page);
    calls = await page.evaluate(() => (window as any).fixture.documentCalls);
    assert.equal(calls[2].expectedContent, calls[1].content, "retry uses only the body part known to have reached disk");
    assert.equal(calls[2].metadata.expectedContent, calls[0].metadata.content, "failed metadata keeps its earlier baseline");

    await appearance.getByLabel("标题", { exact: true }).fill("Pending C");
    await page.evaluate(() => { (window as any).fixture.documentMode = "defer"; });
    await saveButton(page).click();
    await page.waitForFunction(() => (window as any).fixture.documentPending.length === 1);
    await appearance.getByLabel("标题", { exact: true }).fill("Newer D");
    await page.evaluate(() => (window as any).fixture.resolveDocumentPending(0, { ok: true }));
    await waitSaveEnabled(page);
    assert.equal(await appearance.getByLabel("标题", { exact: true }).inputValue(), "Newer D");
    assert.deepEqual(await page.getByRole("alert").allTextContents(), []);
    await page.evaluate(() => { (window as any).fixture.documentMode = "success"; });
    await appearance.getByLabel("标题", { exact: true }).press("Control+s");
    await waitClean(page);
    calls = await page.evaluate(() => (window as any).fixture.documentCalls);
    assert.equal(JSON.parse(calls.at(-1).metadata.content).title, "Newer D");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("metadata callbacks remain bound to their document and server conflicts preserve the draft and block overwrite", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await page.evaluate(() => (window as any).fixture.enableDocumentSave());
    await page.getByRole("tab", { name: "属性", exact: true }).click();
    const appearance = page.getByRole("region", { name: "动作属性" });
    await appearance.getByLabel("标题", { exact: true }).fill("old document A");
    await page.evaluate(() => { (window as any).fixture.documentMode = "defer"; });
    await saveButton(page).click();
    await page.waitForFunction(() => (window as any).fixture.documentPending.length === 1);
    await page.evaluate(() => (window as any).fixture.setDocument("b"));
    await page.waitForSelector('[data-step-id="s-b"]');
    await waitClean(page);
    await page.evaluate(() => (window as any).fixture.resolveDocumentPending(0, { ok: true }));
    await page.getByRole("tab", { name: "属性", exact: true }).click();
    assert.equal(await appearance.getByLabel("标题", { exact: true }).inputValue(), "Fixture action");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.saved), []);
    await appearance.getByLabel("标题", { exact: true }).fill("new document B");
    await page.evaluate(() => { (window as any).fixture.documentMode = "success"; });
    await saveButton(page).click();
    await waitClean(page);
    const call = await page.evaluate(() => (window as any).fixture.documentCalls.at(-1));
    assert.match(call.path, /22222222/);
    assert.match(call.metadata.content, /22222222/);

    await appearance.getByLabel("标题", { exact: true }).fill("preserved conflict draft");
    await page.evaluate(() => { (window as any).fixture.documentMode = "conflict"; });
    await saveButton(page).click();
    await page.getByRole("alert").filter({ hasText: "动作属性已在外部变更" }).waitFor();
    assert.equal(await appearance.getByLabel("标题", { exact: true }).inputValue(), "preserved conflict draft");
    assert.equal(await saveButton(page).isDisabled(), true);
    await page.getByRole("tab", { name: "主程序", exact: true }).click();
    await editNote(page, "body after metadata conflict");
    assert.equal(await saveButton(page).isDisabled(), true, "body edits cannot clear an independent metadata conflict");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("explicit host sync keeps the current document inert until completion and cannot lock a different document", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await page.evaluate(() => (window as any).fixture.enableDocumentSave());
    await page.getByRole("tab", { name: "属性", exact: true }).click();
    const title = page.getByRole("region", { name: "动作属性" }).getByLabel("标题", { exact: true });
    await title.fill("local metadata before sync");
    await saveButton(page).click();
    await waitClean(page);
    assert.equal(await page.evaluate(() => (window as any).fixture.syncCalls.some((call: any) => call.op === "push")), false, "ordinary Save never writes to the host");
    await page.evaluate(() => { (window as any).fixture.syncMode = "defer"; });
    await page.getByRole("button", { name: "同步", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.syncPending.length === 1);
    await page.waitForFunction(() => document.querySelector(".action-project-data-editor-visual")?.hasAttribute("inert"));
    assert.equal(await title.isDisabled(), true);
    assert.equal(await saveButton(page).isDisabled(), true);
    await page.evaluate(() => {
      const f = (window as any).fixture;
      f.deferInfoRead = true;
      const infoPath = f.pathFor("a").replace(/data.json$/, "info.json");
      f.infoFiles[infoPath] = f.infoFiles[infoPath].replace("9223372036854775807", "2");
      f.syncPending[0].resolve({ ok: true, message: "fixture synced", editVersion: 2 });
    });
    await page.waitForFunction(() => (window as any).fixture.infoPending.length > 0);
    assert.equal(await title.isDisabled(), true, "host acknowledgement must not unlock edits before stamped info is adopted");
    assert.equal(await saveButton(page).isDisabled(), true);
    await page.evaluate(() => {
      const f = (window as any).fixture;
      f.deferInfoRead = false;
      f.infoPending.splice(0).forEach((pending: any) => pending.resolve());
    });
    await page.waitForFunction(() => !document.querySelector(".action-project-data-editor-visual")?.hasAttribute("inert"));
    assert.equal(await title.isDisabled(), false);
    await title.fill("second local metadata");
    await saveButton(page).click();
    await waitClean(page);
    assert.equal(await page.evaluate(() => JSON.parse((window as any).fixture.documentCalls.at(-1).metadata.expectedContent).editVersion), 2, "the next metadata save uses this Sync's adopted version");
    await page.getByRole("button", { name: "同步", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.syncPending.length === 2);
    await page.evaluate(() => (window as any).fixture.setDocument("b"));
    await page.waitForSelector('[data-step-id="s-b"]');
    await page.getByRole("tab", { name: "属性", exact: true }).click();
    assert.equal(await title.isDisabled(), false);
    await page.evaluate(() => (window as any).fixture.syncPending[1].resolve({ ok: true, message: "fixture old document synced", editVersion: 3 }));
    await title.fill("unlocked document B");
    await waitSaveEnabled(page);
    assert.equal(await title.inputValue(), "unlocked document B");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("a failed post-sync info refresh blocks local overwrite without replaying the host write", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await page.evaluate(() => (window as any).fixture.enableDocumentSave());
    await page.getByRole("tab", { name: "属性", exact: true }).click();
    const title = page.getByRole("region", { name: "动作属性" }).getByLabel("标题", { exact: true });
    await title.fill("preserved synced title");
    await saveButton(page).click();
    await waitClean(page);
    await page.evaluate(() => {
      const f = (window as any).fixture;
      f.syncMode = "defer";
    });
    await page.getByRole("button", { name: "同步", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.syncPending.length === 1);
    await page.evaluate(() => {
      const f = (window as any).fixture;
      f.infoReadError = "fixture post-sync info read failed";
      f.syncPending[0].resolve({ ok: true, message: "fixture synced", editVersion: 2 });
    });
    await page.getByText(/宿主已同步.*工作区刷新失败/).first().waitFor();
    await page.waitForFunction(() => !document.querySelector(".action-project-data-editor-visual")?.hasAttribute("inert"));
    assert.equal(await title.inputValue(), "preserved synced title");
    await title.fill("preserved newer draft after refresh failure");
    assert.equal(await saveButton(page).isDisabled(), true);
    assert.equal(await page.evaluate(() => (window as any).fixture.syncCalls.filter((call: any) => call.op === "push").length), 1);
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("Int64 sync versions keep push available and show distinct adjacent versions in the real conflict dialog", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await page.evaluate(() => {
      const f = (window as any).fixture;
      f.infoFiles[f.pathFor("a").replace(/data.json$/, "info.json")] = f.infoFiles[f.pathFor("a").replace(/data.json$/, "info.json")].replace("9223372036854775807", "9007199254740992");
      f.syncStatus = { state: "in_sync", message: "exact Int64 fixture", localEditVersion: "9007199254740992", remoteEditVersion: "9007199254740992" };
      f.enableDocumentSave();
    });
    await page.getByRole("tab", { name: "属性", exact: true }).click();
    const title = page.getByRole("region", { name: "动作属性" }).getByLabel("标题", { exact: true });
    await title.fill("Int64 local title");
    await saveButton(page).click();
    await waitClean(page);
    await page.evaluate(() => { (window as any).fixture.syncMode = "defer"; });
    await page.getByRole("button", { name: "同步", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.syncPending.length === 1);
    await page.evaluate(() => {
      const f = (window as any).fixture;
      const infoPath = f.pathFor("a").replace(/data.json$/, "info.json");
      f.infoFiles[infoPath] = f.infoFiles[infoPath].replace("9007199254740992", "9007199254740993");
      f.syncPending[0].resolve({ ok: true, message: "exact Int64 synced", editVersion: "9007199254740993" });
    });
    await page.locator(".project-info-sync-btn--in-sync").waitFor();
    await page.waitForFunction(() => !document.querySelector(".action-project-data-editor-visual")?.hasAttribute("inert"));
    await title.fill("unsynced Int64 title");
    await saveButton(page).click();
    await waitClean(page);
    await page.evaluate(() => {
      (window as any).fixture.syncStatus = { state: "quicker_ahead", message: "adjacent Int64 remote change", localEditVersion: "9007199254740993", remoteEditVersion: "9007199254740994" };
    });
    await page.getByRole("button", { name: "同步", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "同步冲突" });
    await dialog.waitFor();
    assert.equal(await dialog.getByText("工作区 v9007199254740993", { exact: true }).count(), 1);
    assert.equal(await dialog.getByText("Quicker v9007199254740994", { exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => (window as any).fixture.syncCalls.filter((call: any) => call.op === "push").length), 1, "a conflict never dispatches an implicit second write");
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(await title.inputValue(), "unsynced Int64 title");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});
