import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium, type Page } from "playwright";

// Real provider, dock/outlet, file pane, APDE, Session, Workspace and editor leaves.
// Only native panels, file/network data, resource tree and external icon assets are fake.
const fixture = `
import React,{StrictMode,useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WorkspaceExplorerPanelProvider,WorkspaceExplorerShellProvider,useWorkspaceExplorerEditor,useWorkspaceExplorerShell,workspaceExplorerActionsRef} from '@/lib/workspace-explorer';
import {WorkspaceDocumentHost} from '@/components/workspace/WorkspaceDocumentHost';
import {WorkspaceExplorerPanel} from '@/components/workspace/WorkspaceExplorerPanel';
import '@/app/globals.css';
const action='11111111-1111-4111-8111-111111111111';
const file='.quicker/actions/'+action+'/data.json';
const second='.quicker/actions/22222222-2222-4222-8222-222222222222/data.json';
const body=label=>JSON.stringify({steps:[{stepId:'step',stepRunnerKey:'sys:fixture',note:label,inputParams:{}}],variables:[],subPrograms:[],future:'__int64__'}).replace('"__int64__"','9007199254740993');
const state=window.fixture={file,second,body,calls:[],pins:[],unexpected:[],pending:[],defer:false,deferReads:false,readPending:[],files:new Map(),deletedProjects:new Set(),reads:[],syncCalls:[],syncPending:[],syncMode:'success',syncState:'in_sync',deletePending:[],bound:false,resourceOpens:[],openPending:[],openMode:'success',exportCount:0,bindings:new Map(),projectRemoved:owner=>workspaceExplorerActionsRef.current.notifyProjectRemoved(owner)};
const key=(cwd,path)=>cwd+'::'+path;
const hostBinding={hostInstanceId:'fixture-v1',hostSessionId:'a'.repeat(32),endpoint:'QuickerRpc_User_'+'A'.repeat(24)+'_'+'a'.repeat(32),protocolVersion:1,schemaVersion:1,hostKind:'v1',quickerVersion:'fixture',capabilities:{'resource.action.page.read':true,'action.legacyBody.read':true}};
const record=(cwd,directory)=>state.bindings.get(key(cwd,directory))??{schemaVersion:1,kind:'action',actionId:directory.split('/').at(-1),hostBinding};
for(const cwd of ['C:/fixture/a','C:/fixture/b'])for(const p of [file,second])state.files.set(key(cwd,p),body(cwd+(p===second?' second':' initial')));
const tree=rootPath=>({rootPath,children:[]});
window.EventSource=class{close(){}};
window.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input.url,'http://fixture.invalid');
 const request=init?.body?JSON.parse(init.body):Object.fromEntries(url.searchParams);
 if(url.pathname==='/api/workspace'){
  if(request.op==='program-document-target'){const dir=request.path.replace(/\\/data.json$/,'');return Response.json({ok:true,projectDirectory:dir,projectBinding:state.bound?record(request.cwd,dir):null});}
  if(request.op==='tree')return Response.json({ok:true,tree:tree('.quicker/actions'),subprogramTree:tree('.quicker/subprograms')});
  if(request.op==='read'){
    state.reads.push(request);
    if([...state.deletedProjects].some(project=>key(request.cwd,request.path).startsWith(project+'/')))return Response.json({ok:false,error:'fixture deleted project'});
    const content=state.files.get(key(request.cwd,request.path))??(/info.json$/.test(request.path)?JSON.stringify({kind:'action',id:state.bound?record(request.cwd,request.path.replace(/\\/info.json$/,'')).actionId:action,title:'Fixture',icon:'iconify:mdi:code-tags',editVersion:1}):'');
    if(state.deferReads&&/data.json$/.test(request.path))return await new Promise(resolve=>state.readPending.push({cwd:request.cwd,path:request.path,finish:()=>resolve(Response.json({ok:true,path:request.path,content,truncated:false}))}));
    return Response.json({ok:true,path:request.path,content,truncated:false});
  }
  if(request.op==='list')return Response.json({ok:true,entries:[],truncated:false});
  if(request.op==='save-program-document'||request.op==='write'){
    state.calls.push(request);
    const finish=()=>{state.files.set(key(request.cwd,request.path),request.content);if(request.metadata)state.files.set(key(request.cwd,request.path.replace(/data.json$/,'info.json')),request.metadata.content);return {ok:true};};
    const result=state.defer?await new Promise(resolve=>state.pending.push(()=>resolve(finish()))):finish();
    return Response.json(result);
  }
  if(request.op==='delete-project'){state.calls.push(request);return Response.json(await new Promise(resolve=>state.deletePending.push(()=>{const prefix=key(request.cwd,request.projectPath);state.deletedProjects.add(prefix);for(const file of state.files.keys())if(file.startsWith(prefix+'/'))state.files.delete(file);resolve({ok:true});})));}
 }
 if(url.pathname==='/api/workspace/action-sync'){
  state.syncCalls.push(request);
  if(request.op==='status')return Response.json({ok:true,status:{state:state.syncState,message:'fake status',localEditVersion:1,remoteEditVersion:2}});
  const result=state.syncMode==='defer'?await new Promise(resolve=>state.syncPending.push(()=>resolve({ok:true,message:'fake synced',editVersion:2}))):{ok:true,message:'fake synced',editVersion:2};
  return Response.json(result);
 }
 if(state.bound&&url.pathname==='/api/designer/resources/page'){
   const ids=['22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777'];
   return Response.json({ok:true,kind:'action',scope:'runtimeCatalog',query:request.query,skip:0,take:100,totalCount:6,hasMore:false,snapshotId:'resource-snapshot',
    items:ids.map((id,index)=>({id,title:'Target '+['B','C','D','keys','unknown','waiting'][index],description:'raw summary',icon:'',editVersion:'1',actionType:index===4?null:index===3?'SendKeys':'XAction',callIdentifier:null}))});
 }
 if(state.bound&&url.pathname==='/api/designer/resources/open-action'){
   state.resourceOpens.push(request);
   const dir=request.actionId.startsWith('2222')?second.replace(/\\/data.json$/,''):'.quicker/actions/open-'+request.requestId;
   const existing=request.actionId.startsWith('2222');
   const result=state.openMode==='blocked'?{ok:false,code:'RESOURCE_OPEN_BLOCKED',error:'Preceding result needs checking',retryable:false,localPersistence:'none',
     blockedBy:{actionId:request.actionId,requestId:'88888888-8888-4888-8888-888888888888',sourceOwner:{...request.sourceOwner,instanceId:999},code:'WRITE_RESULT_UNKNOWN',error:'Prior acknowledgement lost',localPersistence:'unknown',projectDirectory:'.quicker/actions/open-88888888-8888-4888-8888-888888888888'}}
    :state.openMode==='unknown'?{ok:false,code:'RESOURCE_OPEN_RESULT_UNKNOWN',error:'Export result unknown',retryable:false,localPersistence:'unknown',projectDirectory:dir}
    :{ok:true,actionId:request.actionId,projectDirectory:dir,path:dir+'/data.json',projectBinding:{schemaVersion:1,kind:'action',actionId:request.actionId,hostBinding},origin:existing?'existing':'exported',localPersistence:existing?'unchanged':'confirmed'};
   if(state.openMode!=='blocked'&&!existing&&!state.resourceOpens.slice(0,-1).some(r=>r.requestId===request.requestId))state.exportCount++;
   if(result.ok&&!existing){state.files.set(key(request.catalogContext.cwd,dir+'/data.json'),body('exported target'));state.bindings.set(key(request.catalogContext.cwd,dir),result.projectBinding);}
   if(state.openMode==='defer')return await new Promise(resolve=>state.openPending.push(()=>resolve(Response.json(result))));
   return Response.json(result,{status:result.ok?200:409});
 }
 if(state.bound&&url.pathname.startsWith('/api/step-runner/'))return Response.json({ok:true,items:[]});
 state.unexpected.push(url.pathname+':'+request.op);throw new Error('Unexpected fake request '+url.pathname);
};
function Controls({setCwd,setThread}){
 const editor=useWorkspaceExplorerEditor(),shell=useWorkspaceExplorerShell();
 useEffect(()=>{state.cwd=editor.cwd;state.instances=()=>editor.documentInstances.getSnapshot().map(x=>({key:x.owner.key,instanceId:x.owner.instanceId,path:x.owner.path}));
 state.open=p=>editor.openFile(p,state.files.get(key(editor.cwd,p)));
 state.close=()=>editor.activeTab&&editor.closeTab(editor.activeTab.id);
 state.reload=()=>editor.loadFileContent(file,{force:true});
 state.refresh=()=>{const owner=editor.documentInstances.getSnapshot().find(item=>item.owner.cwd===editor.cwd&&item.owner.path===file)?.owner;return owner&&editor.refreshDocumentFile(owner);};
 state.view=view=>shell.setActiveSideView(view);
 state.fold=()=>shell.setPanelOpen(false);state.expand=()=>shell.setPanelOpen(true);
 state.setCwd=setCwd;state.setThread=setThread;
 state.active=()=>editor.activeTab;
 });
 return null;
}
function Dock({thread}){const presentation=useMemo(()=>({threadId:thread,pinStep:tag=>state.pins.push({thread,tag})}),[thread]);return <section data-chat={thread} style={{height:'100%'}}><WorkspaceExplorerPanel chatPresentation={presentation}/></section>;}
function App(){const[cwd,setCwd]=useState('C:/fixture/a'),[thread,setThread]=useState('chat-a');return <WorkspaceExplorerShellProvider><WorkspaceExplorerPanelProvider cwd={cwd}><WorkspaceDocumentHost><Controls setCwd={setCwd} setThread={setThread}/><Dock key={thread} thread={thread}/></WorkspaceDocumentHost></WorkspaceExplorerPanelProvider></WorkspaceExplorerShellProvider>;}
const root=createRoot(document.getElementById('root'));state.unmount=()=>root.unmount();root.render(<StrictMode><App/></StrictMode>);
`;

async function compile() {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  const result = await build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", outfile: "fixture.js", tsconfig: "tsconfig.json",
    define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "owned-file-boundaries", setup(builder) {
      builder.onResolve({ filter: /^@iconify\/icons-mdi\// }, (args) => ({ path: require.resolve(args.path) }));
      builder.onResolve({ filter: /(^@\/components\/(browser\/WorkspaceEmbeddedBrowser|terminal\/WorkspaceEmbeddedTerminal|action-trace\/ActionTracePanel|workspace\/WorkspaceResourceManager|chat\/(FileEditorCard|DocsViewerTabs|ActionIcon|FaIconProvider))$|shared\/IconControl$|^@\/lib\/(docs-viewer|embedded-terminal-context|action-command-client|action-trace-client)$)/ }, (args) => ({ path: args.path, namespace: "boundary" }));
      builder.onLoad({ filter: /.*/, namespace: "boundary" }, (args) => {
        if (args.path.endsWith("docs-viewer")) return { contents: "export const useDocsViewer=()=>({activeDoc:null});", loader: "js" };
        if (args.path.endsWith("embedded-terminal-context")) return { contents: "export const useEmbeddedTerminal=()=>({open:false});", loader: "js" };
        if (args.path.endsWith("action-command-client")) return { contents: "export const isQuickerActionMissingError=()=>false;export function invokeActionCommand(){throw new Error('Host commands prohibited')}", loader: "js" };
        if (args.path.endsWith("action-trace-client")) return { contents: "export function startActionTrace(){throw new Error('Host trace prohibited')}", loader: "js" };
        if (args.path.endsWith("IconControl")) return { contents: `import React from 'react';
          import {IconifyIconSlot} from '@/lib/action-editor/shared/IconifyIconSlot';
          import {parseIconifyIconId} from '@/lib/action-editor/shared/parseIconifySpec';
          import {parseQuickerAssetIcon} from '@/lib/action-editor/shared/parseQuickerAssetIcon';
          import {resolveResIconToIconifyId} from '@/lib/action-editor/shared/resIconCatalog';
          import {faVectorSpecToBundledIconifyId} from '@/lib/action-editor/shared/faVectorToIconifyFallback';
          export function IconControl(props){const spec=props.spec?.trim()||'',asset=parseQuickerAssetIcon(spec);
            const iconId=parseIconifyIconId(spec)||(asset&&resolveResIconToIconifyId(asset.path))||(/^fa:/i.test(spec)?faVectorSpecToBundledIconifyId(spec):null);
            return iconId?<IconifyIconSlot {...props} iconId={iconId}/>:props.fallback??null;}`, loader: "jsx", resolveDir: process.cwd() };
        if (args.path.endsWith("ActionIcon")) return { contents: "import React from 'react';import {IconControl} from '@/lib/action-editor/shared/IconControl';export const ActionIcon=p=><IconControl {...p} size={32}/>;", loader: "jsx", resolveDir: process.cwd() };
        if (args.path.endsWith("FaIconProvider")) return { contents: "export const FaIconProvider=p=>p.children;", loader: "js" };
        if (args.path.endsWith("FileEditorCard")) return { contents: "import React from 'react';export const FileEditorCard=p=><pre>{p.content}</pre>;", loader: "jsx", resolveDir: process.cwd() };
        if (args.path.endsWith("DocsViewerTabs")) return { contents: "export const DocsViewerPanel=()=>null;", loader: "js" };
        const name = args.path.split("/").at(-1)!;
        return { contents: `import React from 'react';export const ${name}=()=> <div data-boundary="${name}"/>;`, loader: "jsx", resolveDir: process.cwd() };
      });
    } }] });
  return { js: result.outputFiles.find((file) => file.path.endsWith(".js"))!.text, css: result.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "" };
}
let compilation: ReturnType<typeof compile> | undefined;

const note = (page: Page) => page.locator('[data-workspace-document]:visible .step-form-note-input');
const save = (page: Page) => page.locator('[data-workspace-document]:visible .action-project-data-editor-save');
async function call(page: Page, command: string, argument?: string) { await page.evaluate(([key, arg]) => (window as any).fixture[key!](arg), [command, argument]); }
async function edit(page: Page, value: string) {
  await note(page).fill(value);
  await page.locator('[data-workspace-document]:visible .action-project-data-editor-tab').filter({ hasText: "可视化" }).click();
}

async function captureNarrow(page: Page, name: string) {
  const directory = process.env.WORKSPACE_DOCUMENT_SCREENSHOTS_DIR;
  if (!directory) return;
  const relative = path.relative(path.resolve(process.cwd(), "..", ".tmp"), directory);
  assert.equal(path.isAbsolute(directory) && !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`), true, "Screenshots belong to this checkout's .tmp");
  await mkdir(directory, { recursive: true });
  await page.setViewportSize({ width: 480, height: 900 });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
    const clipped = await page.locator('[data-workspace-document]:visible').evaluate((element) => {
      const control = element.querySelector<HTMLElement>('.action-project-data-editor-save,.project-info-save-btn');
      if (!control) return 'missing save control';
      const bounds = control.getBoundingClientRect();
      if (bounds.x < 0 || bounds.right > innerWidth || bounds.y < 0 || bounds.bottom > innerHeight) return 'save outside viewport';
      for (let parent = control.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), frame = parent.getBoundingClientRect();
        if (/(hidden|clip|auto|scroll)/.test(style.overflowX) && (bounds.left < frame.left - 1 || bounds.right > frame.right + 1)) return parent.className;
        if (/(hidden|clip|auto|scroll)/.test(style.overflowY) && (bounds.top < frame.top - 1 || bounds.bottom > frame.bottom + 1)) return parent.className;
      }
      return null;
    });
    assert.equal(clipped, null, `Save clipped in ${name}/${theme}: ${clipped}`);
    await page.screenshot({ path: path.join(directory, `${name}-480-${theme}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

test("resource action opens reuse dirty file instances and do not let late export receipts steal a new presentation", { timeout: 60_000 }, async () => {
  const { browser, page, errors } = await ownedFixture();
  try {
    await page.evaluate(() => { const f = (window as any).fixture; f.bound = true; f.open(f.file); });
    await note(page).waitFor(); await edit(page, "A unsaved");
    await page.evaluate(() => { const f = (window as any).fixture; f.open(f.second); });
    await page.waitForFunction(() => document.querySelector<HTMLInputElement>('[data-workspace-document]:not([hidden]) .step-form-note-input')?.value?.includes("second"));
    await edit(page, "B unsaved");
    await page.evaluate(() => { const f = (window as any).fixture; f.targetElement = document.querySelector('[data-workspace-document]:not([hidden]) .step-form-note-input');
      f.readsBeforeOpen = f.reads.filter(r => r.path === f.second).length; f.open(f.file); });
    await page.waitForFunction(() => document.querySelector<HTMLInputElement>('[data-workspace-document]:not([hidden]) .step-form-note-input')?.value === "A unsaved");
    await page.locator('[data-workspace-document]:visible').getByRole("tab", { name: "动作", exact: true }).click();
    const resource = () => page.locator('[data-workspace-document]:visible').getByRole("region", { name: "动作目录", exact: true });
    await resource().getByRole("option", { name: "Target B" }).click();
    await resource().getByRole("button", { name: "在工作区打开" }).click();
    await page.waitForFunction(() => document.querySelector('[data-workspace-document]:not([hidden]) .step-form-note-input') === (window as any).fixture.targetElement);
    assert.equal(await note(page).inputValue(), "B unsaved");
    assert.equal(await page.evaluate(() => { const f = (window as any).fixture; return f.reads.filter(r => r.path === f.second).length === f.readsBeforeOpen; }), true,
      "focusing an existing project does not reload its file or replace its baseline");
    assert.equal(await page.evaluate(() => (window as any).fixture.exportCount), 0);
    await page.locator('[data-workspace-document]:visible [title="撤销 (Ctrl+Z)"]').click();
    assert.match(await note(page).inputValue(), /second/);
    await page.locator('[data-workspace-document]:visible [title="重做 (Ctrl+Y / Ctrl+Shift+Z)"]').click();
    assert.equal(await note(page).inputValue(), "B unsaved");

    await page.evaluate(() => { const f = (window as any).fixture; f.openMode = 'defer'; f.open(f.file); });
    await page.locator('[data-workspace-document]:visible').getByRole("tab", { name: "动作", exact: true }).click();
    await resource().getByRole("option", { name: "Target C" }).click();
    await resource().getByRole("button", { name: "在工作区打开" }).click();
    await page.waitForFunction(() => (window as any).fixture.openPending.length === 1);
    await call(page, "setThread", "chat-b");
    await page.evaluate(() => (window as any).fixture.openPending.shift()());
    await resource().getByRole("status").filter({ hasText: "本地导出已确认" }).waitFor();
    assert.equal(await page.evaluate(() => { const f = (window as any).fixture; return f.active().path === f.file; }), true);
    assert.equal(await note(page).inputValue(), "A unsaved");
    assert.equal(await page.evaluate(() => (window as any).fixture.exportCount), 1);
    await page.evaluate(() => { (window as any).fixture.openMode = 'success'; });
    await resource().getByRole("button", { name: "在工作区打开" }).click();
    await page.waitForFunction(() => (window as any).fixture.active().path.includes('/open-'));
    assert.equal(await page.evaluate(() => { const calls = (window as any).fixture.resourceOpens; return calls.at(-1).requestId === calls.at(-2).requestId; }), true);
    assert.equal(await page.evaluate(() => (window as any).fixture.exportCount), 1, "confirmed export recovery never dispatches another export");

    await page.evaluate(() => { const f = (window as any).fixture; f.openMode = 'unknown'; f.open(f.file); });
    await page.locator('[data-workspace-document]:visible').getByRole("tab", { name: "动作", exact: true }).click();
    await resource().getByRole("option", { name: "Target D" }).click();
    await resource().getByRole("button", { name: "在工作区打开" }).click();
    await resource().getByRole("alert").filter({ hasText: "Export result unknown" }).waitFor();
    await resource().getByRole("button", { name: "核对本地结果" }).click();
    await page.waitForFunction(() => (window as any).fixture.resourceOpens.length === 5);
    assert.equal(await page.evaluate(() => { const calls = (window as any).fixture.resourceOpens; return calls.at(-1).requestId === calls.at(-2).requestId; }), true);
    assert.equal(await page.evaluate(() => (window as any).fixture.exportCount), 2);
    assert.equal(await page.evaluate(() => { const f = (window as any).fixture; return f.active().path === f.file; }), true);
    assert.equal(await note(page).inputValue(), "A unsaved");
    assert.equal(await page.evaluate(() => (window as any).fixture.calls.length), 0, "opening resources never saves either document");
    for (const type of ["keys", "unknown"]) {
      await resource().getByRole("option", { name: `Target ${type}` }).click();
      await resource().getByText("当前仅支持打开组合动作（XAction）；其它或未知类型保留只读摘要。").waitFor();
      assert.equal(await resource().getByRole("button", { name: "在工作区打开" }).count(), 0);
      assert.equal(await page.evaluate(() => (window as any).fixture.resourceOpens.length), 5, `${type} selection never dispatches an action open`);
    }
    await page.evaluate(() => { (window as any).fixture.openMode = 'blocked'; });
    await resource().getByRole("option", { name: "Target waiting" }).click();
    await resource().getByRole("button", { name: "在工作区打开" }).click();
    await resource().getByRole("alert").filter({ hasText: "本次未派发导出" }).waitFor();
    const blocked = resource().getByRole("button", { name: "请先核对前置结果" });
    assert.equal(await blocked.isDisabled(), true);
    assert.equal(await resource().getByRole("button", { name: "核对本地结果" }).count(), 0);
    assert.match(await resource().getByRole("alert").filter({ hasText: "本次未派发导出" }).innerText(), /open-88888888-8888-4888-8888-888888888888/);
    await blocked.evaluate((button: HTMLButtonElement) => button.click());
    assert.equal(await page.evaluate(() => (window as any).fixture.resourceOpens.length), 6);
    assert.equal(await page.evaluate(() => (window as any).fixture.exportCount), 2);
    assert.deepEqual(errors, []);
  } catch (error) {
    console.log("resource-open fixture", { errors, state: await page.evaluate(() => ({ active: (window as any).fixture.active()?.path,
      opens: (window as any).fixture.resourceOpens, alerts: [...document.querySelectorAll('[role="alert"]')].map(item => item.textContent),
      summary: document.querySelector('[data-workspace-document]:not([hidden]) .designer-resource-summary')?.textContent })) });
    throw error;
  } finally { await browser.close(); }
});

async function ownedFixture() {
  const compiled = await (compilation ??= compile());
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(5_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/*", (route) => { errors.push(`network:${route.request().url()}`); return route.abort(); });
    await page.setContent('<html data-theme="dark"><body><div id="root"></div></body></html>');
    await page.evaluate("(()=>{const entries=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)}})})()");
    await page.addStyleTag({ content: compiled.css + "\nhtml,body,#root{height:100%;margin:0}.workspace-side-panel{width:100%;height:100%}" });
    await page.addScriptTag({ content: compiled.js });
    await page.waitForFunction(() => Boolean((window as any).fixture?.open));
    return { browser, page, errors };
  } catch (error) { await browser.close(); throw error; }
}

test("one file host retains dirty history across tabs, panels, Chats and cwd; storage and Pin keep their distinct owners", { timeout: 60_000 }, async () => {
  const compiled = await (compilation ??= compile());
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(5_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/*", (route) => { errors.push(`network:${route.request().url()}`); return route.abort(); });
    await page.setContent('<html data-theme="light"><body><div id="root"></div></body></html>');
    await page.evaluate("(()=>{const entries=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)}})})()");
    await page.addStyleTag({ content: compiled.css + "\nhtml,body,#root{height:100%;margin:0}.workspace-side-panel{width:100%;height:100%}" });
    await page.addScriptTag({ content: compiled.js });
    await page.waitForFunction(() => Boolean((window as any).fixture?.open));
    await page.evaluate(() => (window as any).fixture.open((window as any).fixture.file));
    await note(page).waitFor();
    assert.equal(await save(page).isDisabled(), true);
    await edit(page, "dirty A first");
    await edit(page, "dirty A second");
    await note(page).evaluate((element) => { (window as any).originalNote = element; });
    await captureNarrow(page, "designer-host");
    await page.getByRole("button", { name: "添加步骤到对话", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.pins.map((item: any) => item.thread)), ["chat-a"]);

    for (const operation of ["other-file", "browser", "trace", "fold", "chat"]) {
      if (operation === "other-file") await page.evaluate(() => (window as any).fixture.open((window as any).fixture.second));
      if (operation === "browser") await call(page, "view", "__side_browser__:fixture");
      if (operation === "trace") await call(page, "view", "__side_trace__");
      if (operation === "fold") await call(page, "fold");
      if (operation === "chat") await call(page, "setThread", "chat-b");
      if (["browser", "trace", "fold"].includes(operation)) await page.locator('[data-workspace-document]:visible').waitFor({ state: "hidden" });
      await call(page, "expand");
      await page.evaluate(() => (window as any).fixture.open((window as any).fixture.file));
      await page.waitForFunction(() => document.querySelector('[data-workspace-document]:not([hidden]) .step-form-note-input') === (window as any).originalNote);
      assert.equal(await note(page).inputValue(), "dirty A second");
    }
    await page.locator('[data-workspace-document]:visible [title="撤销 (Ctrl+Z)"]').click();
    assert.equal(await note(page).inputValue(), "dirty A first");
    await page.locator('[data-workspace-document]:visible [title="重做 (Ctrl+Y / Ctrl+Shift+Z)"]').click();
    assert.equal(await note(page).inputValue(), "dirty A second");
    await page.getByRole("button", { name: "添加步骤到对话", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.pins.map((item: any) => item.thread)), ["chat-a", "chat-b"]);

    await page.getByRole("button", { name: "动作编辑器说明" }).click();
    await page.getByRole("dialog").waitFor();
    await call(page, "fold");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.deepEqual(await page.evaluate(() => {
      const events = [new KeyboardEvent("keydown", { key: "F1", bubbles: true, cancelable: true }), new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true })];
      return events.map(event => { (window as any).originalNote.dispatchEvent(event); return event.defaultPrevented; });
    }), [false, false]);
    await call(page, "expand");
    await page.getByRole("dialog").waitFor();
    await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).first().click();

    await page.evaluate(() => { (window as any).fixture.defer = true; });
    await save(page).click();
    await page.waitForFunction(() => (window as any).fixture.pending.length === 1);
    await call(page, "setCwd", "C:/fixture/b");
    await page.waitForFunction(() => (window as any).fixture.cwd === "C:/fixture/b");
    await page.evaluate(() => (window as any).fixture.open((window as any).fixture.file));
    await page.waitForFunction(() => document.querySelector('[data-workspace-document]:not([hidden]) .step-form-note-input')?.getAttribute('value')?.includes('fixture/b'));
    await edit(page, "dirty B");
    await page.evaluate(() => (window as any).fixture.pending.shift()());
    assert.equal(await note(page).inputValue(), "dirty B");
    assert.equal(await save(page).isDisabled(), false);
    await call(page, "setCwd", "C:/fixture/a");
    await page.waitForFunction(() => (window as any).fixture.cwd === "C:/fixture/a");
    await page.evaluate(() => (window as any).fixture.open((window as any).fixture.file));
    await page.waitForFunction(() => document.querySelector('[data-workspace-document]:not([hidden]) .step-form-note-input') === (window as any).originalNote);
    assert.equal(await note(page).inputValue(), "dirty A second");
    assert.equal(await save(page).isDisabled(), true);
    const calls = await page.evaluate(() => (window as any).fixture.calls);
    assert.equal(calls.length, 1); assert.equal(calls[0].cwd, "C:/fixture/a"); assert.match(calls[0].content, /dirty A second/);
    assert.match(calls[0].content, /9007199254740993/);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []);
    assert.deepEqual(errors, []);
    await call(page, "close");
    assert.equal(await page.evaluate(() => (window as any).originalNote.isConnected), false);
    await page.evaluate(() => (window as any).fixture.open((window as any).fixture.file));
    await note(page).waitFor();
    assert.equal(await note(page).evaluate((element) => element === (window as any).originalNote), false);
    await page.evaluate(() => (window as any).fixture.unmount());
    assert.equal(await page.locator('[data-workspace-document]').count(), 0);
  } finally { await browser.close(); }
});

test("closing a pending file creates a new owner and its late acknowledgement cannot replace the reopened draft", { timeout: 30_000 }, async () => {
  const { browser, page, errors } = await ownedFixture();
  try {
    await page.evaluate(() => (window as any).fixture.open((window as any).fixture.file));
    await note(page).waitFor();
    await edit(page, "old pending save");
    await note(page).evaluate((element) => { (window as any).oldNote = element; });
    await page.evaluate(() => { (window as any).fixture.defer = true; });
    await save(page).click();
    await page.waitForFunction(() => (window as any).fixture.pending.length === 1);
    await call(page, "close");
    await page.waitForFunction(() => !(window as any).oldNote.isConnected);
    await page.evaluate(() => (window as any).fixture.open((window as any).fixture.file));
    await note(page).waitFor();
    await edit(page, "reopened draft");
    await note(page).evaluate((element) => { (window as any).reopenedNote = element; });
    await page.evaluate(() => (window as any).fixture.pending.shift()());
    await page.waitForFunction(() => (window as any).fixture.files.get('C:/fixture/a::'+(window as any).fixture.file).includes('old pending save'));
    await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    assert.equal(await note(page).inputValue(), "reopened draft");
    assert.equal(await save(page).isDisabled(), false);
    assert.equal(await note(page).evaluate((element) => element === (window as any).reopenedNote), true);
    assert.equal(await page.evaluate(() => (window as any).fixture.calls.length), 1);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("Info draft and popup survive hiding; pending Sync and deletion keep the original cwd without stealing the new document", { timeout: 45_000 }, async () => {
  const { browser, page, errors } = await ownedFixture();
  try {
    await page.evaluate(() => (window as any).fixture.open((window as any).fixture.file.replace(/data.json$/, 'info.json')));
    const title = page.locator('[data-workspace-document]:visible .project-info-title');
    await title.waitFor();
    await title.fill("Info retained draft");
    await page.getByRole("button", { name: "图标", exact: true }).click();
    await page.getByRole("dialog", { name: "图标" }).waitFor();
    await call(page, "fold");
    await page.getByRole("dialog", { name: "图标" }).waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => { const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true }); document.dispatchEvent(event); return event.defaultPrevented; }), false);
    await call(page, "expand");
    await page.getByRole("dialog", { name: "图标" }).waitFor();
    assert.equal(await title.textContent(), "Info retained draft");
    await page.getByRole("button", { name: "图标", exact: true }).click();
    await captureNarrow(page, "info-host");
    await page.getByRole("button", { name: "保存到工作区", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-workspace-document]:not([hidden]) .project-info-save-footer') === null);
    await page.evaluate(() => { (window as any).fixture.syncMode = 'defer'; });
    await page.locator('[data-workspace-document]:visible .project-info-sync-btn').click();
    await page.waitForFunction(() => (window as any).fixture.syncPending.length === 1);
    await call(page, "fold");
    await page.evaluate(() => (window as any).fixture.syncPending.shift()());
    await call(page, "expand");
    await page.waitForFunction(() => document.querySelector('[data-workspace-document]:not([hidden]) .project-info-sync-btn')?.textContent?.trim() === '同步');
    assert.equal(await title.textContent(), "Info retained draft");
    assert.equal(await page.locator('[data-workspace-document]:visible .project-info-sync-btn').isDisabled(), false);

    await page.locator('[data-workspace-document]:visible .program-project-delete-btn').click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('checkbox').uncheck();
    await call(page, 'fold');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => { const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true }); window.dispatchEvent(event); return event.defaultPrevented; }), false);
    await call(page, 'expand');
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('checkbox').isChecked(), false);
    await dialog.getByRole('button', { name: '删除', exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.deletePending.length === 1);
    await page.evaluate(() => (window as any).fixture.open((window as any).fixture.second));
    await note(page).waitFor();
    await edit(page, 'same-cwd B survives A deletion');
    await note(page).evaluate((element) => { (window as any).sameCwdB = element; });
    await page.evaluate(() => (window as any).fixture.deletePending.shift()());
    await page.waitForFunction(() => (window as any).fixture.instances().every((item: any) => item.path !== (window as any).fixture.file.replace(/data.json$/, 'info.json')));
    assert.equal(await note(page).inputValue(), 'same-cwd B survives A deletion');
    assert.equal(await note(page).evaluate((element) => element === (window as any).sameCwdB), true);
    await call(page, 'projectRemoved'); // unknown legacy callback only refreshes
    assert.equal(await note(page).inputValue(), 'same-cwd B survives A deletion');
    await page.evaluate(() => (window as any).fixture.open((window as any).fixture.file.replace(/data.json$/, 'info.json')));
    await page.getByText('fixture deleted project', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-workspace-document]:visible .project-info-editor').count(), 0);
    await page.evaluate(() => (window as any).fixture.open((window as any).fixture.second));
    assert.equal(await note(page).inputValue(), 'same-cwd B survives A deletion');
    assert.equal(await note(page).evaluate((element) => element === (window as any).sameCwdB), true);
    await page.evaluate(() => (window as any).fixture.deletedProjects.clear()); // explicit fixture recreation before another deletion
    await page.evaluate(() => (window as any).fixture.open((window as any).fixture.file.replace(/data.json$/, 'info.json')));
    await title.waitFor();
    await page.locator('[data-workspace-document]:visible .program-project-delete-btn').click();
    await dialog.getByRole('checkbox').uncheck();
    await dialog.getByRole('button', { name: '删除', exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.deletePending.length === 1);
    await call(page, 'setCwd', 'C:/fixture/b');
    await page.waitForFunction(() => (window as any).fixture.cwd === 'C:/fixture/b');
    await page.evaluate(() => (window as any).fixture.open((window as any).fixture.file));
    await note(page).waitFor();
    await edit(page, 'B survives A deletion');
    await page.evaluate(() => (window as any).fixture.deletePending.shift()());
    await page.waitForFunction(() => (window as any).fixture.instances().every((item: any) => !(item.key.includes('C:/fixture/a') && item.path === (window as any).fixture.file.replace(/data.json$/, 'info.json'))));
    assert.equal(await note(page).inputValue(), 'B survives A deletion');
    assert.equal(await save(page).isDisabled(), false);
    assert.equal(await page.evaluate(() => (window as any).fixture.calls.find((item: any) => item.op === 'delete-project').cwd), 'C:/fixture/a');
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("a late Explorer load cannot overwrite a newer owner refresh or a successful Save", { timeout: 30_000 }, async () => {
  const { browser, page, errors } = await ownedFixture();
  try {
    await page.evaluate(() => (window as any).fixture.open((window as any).fixture.file));
    await note(page).waitFor();
    await page.evaluate(() => { const f = (window as any).fixture; f.deferReads = true; f.files.set('C:/fixture/a::'+f.file, f.body('older explorer load')); void f.reload(); });
    await page.waitForFunction(() => (window as any).fixture.readPending.length === 1);
    await page.evaluate(() => { const f = (window as any).fixture; f.files.set('C:/fixture/a::'+f.file, f.body('new owner refresh')); void f.refresh(); });
    await page.waitForFunction(() => (window as any).fixture.readPending.length === 2);
    await page.evaluate(() => (window as any).fixture.readPending[1].finish());
    await page.waitForFunction(() => document.querySelector<HTMLInputElement>('[data-workspace-document]:not([hidden]) .step-form-note-input')?.value === 'new owner refresh');
    await page.evaluate(() => (window as any).fixture.readPending[0].finish());
    await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    assert.equal(await note(page).inputValue(), 'new owner refresh');
    assert.equal(await page.evaluate(() => (window as any).fixture.active().content.includes('new owner refresh')), true);

    await page.evaluate(() => { const f = (window as any).fixture; f.readPending.length = 0; f.files.set('C:/fixture/a::'+f.file, f.body('stale before save')); void f.reload(); });
    await page.waitForFunction(() => (window as any).fixture.readPending.length === 1);
    await edit(page, 'saved latest');
    await save(page).click();
    await page.waitForFunction(() => (window as any).fixture.readPending.length === 2);
    await page.evaluate(() => (window as any).fixture.readPending[1].finish());
    await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('[data-workspace-document]:not([hidden]) .action-project-data-editor-save')?.disabled);
    await page.evaluate(() => (window as any).fixture.readPending[0].finish());
    await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    assert.equal(await note(page).inputValue(), 'saved latest');
    assert.equal(await page.evaluate(() => (window as any).fixture.active().content.includes('saved latest')), true);
    assert.equal(await page.locator('[role="alert"]:visible').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
