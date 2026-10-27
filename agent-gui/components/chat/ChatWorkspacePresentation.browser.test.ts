import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium, type Page } from "playwright";

// Real ChatPanel/SDK, shell, dock, retained document Host, Session and CSS.
// Only network data, native chrome and external assets are isolated.
const fixture = `
import React,{StrictMode,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ChatPanel} from '@/components/chat/Chat';
import {AgentWorkbenchShell} from '@/components/shell/AgentWorkbenchShell';
import {WorkspaceExplorerShellProvider,WorkspaceExplorerPanelProvider,useWorkspaceExplorerEditor,useWorkspaceExplorerShell} from '@/lib/workspace-explorer';
import {WorkspaceDocumentHost} from '@/components/workspace/WorkspaceDocumentHost';
import {AppMainWorkspaceSplit} from '@/components/workspace/AppMainWorkspaceSplit';
import {AppConfirmHost} from '@/components/AppConfirmHost';
import '@/app/globals.css';
const cwd='C:/fixture/narrow-workbench',action='11111111-1111-4111-8111-111111111111';
const file='.quicker/actions/'+action+'/data.json';
const body=JSON.stringify({steps:[{stepId:'owned-step',stepRunnerKey:'sys:fixture',note:'original document note',inputParams:{}}],variables:[{id:'owned-variable',key:'message',varType:0,desc:'original variable description',defaultValue:'original value'}],subPrograms:[],future:9007199254740991});
const state=window.fixture={cwd,file,calls:[],chatRequests:[],persisted:[],pendingSaves:[],pendingMentions:[],mentionCalls:0,pins:[],variablePins:[],unexpected:[],files:new Map([[file,body]]),deferSave:false,deferMention:false};
const emptyTree=rootPath=>({rootPath,children:[]});
const options=[{kind:'profile',selection:'profile:fixture/model-a',profileId:'fixture',profileTitle:'Fixture',label:'Fixture',description:'Synthetic profile',modelId:'model-a',profileModels:['model-a'],configured:true,contextLimit:128000}];
window.EventSource=class{close(){}};
window.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.href);
 const request=init.body?JSON.parse(init.body):Object.fromEntries(url.searchParams);
 if(url.pathname==='/api/workspace'){
  if(request.op==='tree')return Response.json({ok:true,tree:emptyTree('.quicker/actions'),subprogramTree:emptyTree('.quicker/subprograms')});
  if(request.op==='list')return Response.json({ok:true,entries:[],truncated:false});
  if(request.op==='program-document-target')return Response.json({ok:true,projectDirectory:request.path.replace(/\\/data.json$/,''),projectBinding:null});
  if(request.op==='read')return Response.json({ok:true,path:request.path,truncated:false,content:state.files.get(request.path)??(/info.json$/.test(request.path)?JSON.stringify({kind:'action',id:action,title:'Synthetic retained action',editVersion:1}):'ordinary text')});
  if(request.op==='save-program-document'){
   state.calls.push(request);
   const finish=()=>{state.files.set(request.path,request.content);if(request.metadata)state.files.set(request.path.replace(/data.json$/,'info.json'),request.metadata.content);return Response.json({ok:true});};
   return state.deferSave?await new Promise(resolve=>state.pendingSaves.push(()=>resolve(finish()))):finish();
  }
 }
 if(url.pathname==='/api/llm')return Response.json({options,directOverride:false,activeSelection:options[0].selection,defaultSelection:options[0].selection});
 if(url.pathname==='/api/agent-defs')return Response.json({ok:true,commands:[{name:'fixture-command',description:'Synthetic command',argumentHint:null,scope:'workspace'}],skills:[],agents:[]});
 if(url.pathname==='/api/actions/recent')return Response.json({ok:true,items:[]});
 if(url.pathname==='/api/actions/mention-search'){
  state.mentionCalls++;
  const finish=()=>Response.json({ok:true,items:[]});
  return state.deferMention?await new Promise(resolve=>state.pendingMentions.push(()=>resolve(finish()))):finish();
 }
 if(url.pathname==='/api/chat'){
  state.chatRequests.push(request);
  const events=[{type:'start',messageId:'fixture-response'},{type:'text-start',id:'reply'},{type:'text-delta',id:'reply',delta:'synthetic SDK reply'},{type:'text-end',id:'reply'},{type:'finish'}];
  return new Response(events.map(event=>'data: '+JSON.stringify(event)+'\\n\\n').join('')+'data: [DONE]\\n\\n',{headers:{'content-type':'text/event-stream','x-vercel-ai-ui-message-stream':'v1'}});
 }
 if(url.pathname.startsWith('/api/step-runner/')||url.pathname==='/api/subprogram/list'||url.pathname.startsWith('/api/fa/')||url.pathname.startsWith('/api/designer/resources/'))return Response.json({ok:false,code:'HOST_CAPABILITY_UNAVAILABLE',error:'Synthetic fixture has no native catalog',retryable:false},{status:503});
 state.unexpected.push(url.pathname+':'+request.op);throw Error('Unexpected fixture request '+url.pathname);
};
function Controls(){const editor=useWorkspaceExplorerEditor(),shell=useWorkspaceExplorerShell();useEffect(()=>{
 state.open=()=>editor.openFile(file);
 state.active=()=>editor.activeTab;
 state.instances=()=>editor.documentInstances.getSnapshot().map(row=>({instanceId:row.owner.instanceId,path:row.owner.path}));
 state.fold=()=>shell.setPanelOpen(false);
 state.expand=()=>shell.setPanelOpen(true);
});return null;}
const messages=[{id:'chat-a-u1',role:'user',parts:[{type:'text',text:'first user message'}]},{id:'chat-a-a1',role:'assistant',parts:[{type:'text',text:'first answer'}]},{id:'chat-a-u2',role:'user',parts:[{type:'text',text:'editable second message'}]},{id:'chat-a-a2',role:'assistant',parts:[{type:'text',text:'existing answer'}]}];
function observeRegistry(registry){
 state.live=registry;
 if(state.observedRegistry!==registry){state.observedRegistry=registry;const pin=registry.pin,pinVariable=registry.pinVariable;
  registry.pin=(...args)=>{const result=pin(...args);state.pins.push({tagId:args[1],stepId:args[2],threadId:args[3],result});return result;};
  registry.pinVariable=(...args)=>{const result=pinVariable(...args);state.variablePins.push({tagId:args[1],variable:args[2],threadId:args[3],result});
   if(state.holdVariableReveal&&result.pinId){state.holdVariableReveal=false;
    const frame=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window);state.heldFrames=[];
    window.requestAnimationFrame=callback=>{window.requestAnimationFrame=frame;state.heldFrames.push(callback);return -1001;};
    window.cancelAnimationFrame=id=>{if(id===-1001)state.heldFrames=[];else cancel(id);};
    state.restoreFrames=()=>{window.requestAnimationFrame=frame;window.cancelAnimationFrame=cancel;state.heldFrames=[];};
    state.releaseFrames=()=>{const held=state.heldFrames.splice(0);state.restoreFrames();for(const callback of held)frame(callback);};
   }return result;};
 }
 return()=>{if(state.live===registry)state.live=null;};
}
function App(){const[sidebarCollapsed,setSidebarCollapsed]=useState(true);state.setSidebarCollapsed=setSidebarCollapsed;
 const[secondChat,setSecondChat]=useState(false),[activeChat,setActiveChat]=useState('chat-a');
 state.mountSecondChat=()=>setSecondChat(true);state.switchChat=id=>setActiveChat(id);
 return <WorkspaceExplorerShellProvider><WorkspaceExplorerPanelProvider cwd={cwd}><WorkspaceDocumentHost onLiveProgramDocumentRegistry={observeRegistry}>
 <Controls/><AgentWorkbenchShell sidebarCollapsed={sidebarCollapsed} sidebar={<nav>Synthetic navigation</nav>} className="agent-workbench"><div className="app-content-row"><div className="app-main-shell"><AppMainWorkspaceSplit>
 {['chat-a',...(secondChat?['chat-b']:[])].map(id=><section key={id} data-chat-panel={id}><ChatPanel threadId={id} initialMessages={id==='chat-a'?messages:[]} workingDirectory={cwd} visible={id===activeChat} threadTitle="Fixture chat" threadUpdatedAt={1} titleGenerated titleManual ping={{status:'error',ok:false,message:'Synthetic offline host'}} connectTick={0} settingsOpen={false}
 onToggleSettings={()=>{}} onOpenSettings={()=>{}} onPersist={(thread,messages)=>state.persisted.push({thread,messages})} onAutoTitle={()=>{}}/></section>)}
 </AppMainWorkspaceSplit></div></div></AgentWorkbenchShell><AppConfirmHost/>
 </WorkspaceDocumentHost></WorkspaceExplorerPanelProvider></WorkspaceExplorerShellProvider>;}
const root=createRoot(document.getElementById('root'));state.unmount=()=>root.unmount();root.render(<StrictMode><App/></StrictMode>);
`;

async function compile() {
  const children = "export const Provider=({children})=>children;";
  const leaves: Record<string, string> = {
    "@/lib/use-browser-panel-message-sync": "export function useBrowserPanelMessageSync(){}",
    "@/lib/action-project-import-from-messages": "export function useActionProjectImportFromMessages(){}",
    "@/lib/program-data-reload-from-tools": "export function useReloadProgramDataFromToolMessages(){}",
    "@/lib/release-preview.client": "export const useDevExperienceEnabled=()=>true;export const useReleasePreview=()=>false;export const useReleasePreviewToggle=()=>({enabled:false,toggle:()=>{}});",
    "@/lib/docs-viewer": `${children}export const DocsViewerProvider=Provider;export const useDocsViewer=()=>({activeDoc:null,clearActiveTopic:()=>{}});export const useOptionalDocsViewer=()=>null;`,
    "@/lib/embedded-browser-context": `${children}export const EmbeddedBrowserProvider=Provider;const data={open:false,snapshot:{title:'',url:''},setOpen:()=>{throw Error('Native browser prohibited')}};export const useEmbeddedBrowser=()=>data;export const useEmbeddedBrowserOptional=()=>null;`,
    "@/lib/embedded-terminal-context": `${children}export const EmbeddedTerminalProvider=Provider;export const useEmbeddedTerminal=()=>({open:false,setOpen:()=>{throw Error('Native terminal prohibited')}});`,
    "@/lib/embedded-browser-tabs": `${children}export const EmbeddedBrowserTabsProvider=Provider;export const useEmbeddedBrowserTabs=()=>({tabs:[],closeTab:()=>{throw Error('Native browser tabs prohibited')}});`,
    "@/lib/embedded-terminal-tabs": `${children}export const EmbeddedTerminalTabsProvider=Provider;export const useEmbeddedTerminalTabs=()=>({tabs:[]});export const setTerminalAllTabsClosedHandler=()=>{};`,
    "@/lib/action-command-client": "export const isQuickerActionMissingError=()=>false;export function invokeActionCommand(){throw Error('Native action commands prohibited')}",
    "@/lib/action-trace-client": "export function startActionTrace(){throw Error('Native trace prohibited')}",
    "@/components/browser/WorkspaceEmbeddedBrowser": "export const WorkspaceEmbeddedBrowser=()=>null;",
    "@/components/terminal/WorkspaceEmbeddedTerminal": "export const WorkspaceEmbeddedTerminal=()=>null;",
    "@/components/action-trace/ActionTracePanel": "export const ActionTracePanel=()=>null;",
    "@/components/workspace/WorkspaceResourceManager": "export const WorkspaceResourceManager=()=>null;",
    "@/components/chat/DocsViewerTabs": "export const DocsViewerPanel=()=>null;",
    "@/components/chat/ActionIcon": "export const ActionIcon=()=>null;",
    "@/components/chat/FaIconProvider": "export const FaIconProvider=({children})=>children;",
    "@/components/chat/ContextUsage": "export const ContextUsage=()=>null;",
  };
  const compiled = await build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false,
    outfile: "narrow-chat-fixture.js", platform: "browser", format: "iife", jsx: "automatic", tsconfig: path.join(process.cwd(), "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" }, plugins: [{ name: "owned-narrow-workbench-environment", setup(builder) {
      builder.onLoad({ filter: /[\\/]components[\\/]chat[\\/]Chat\.tsx$/ }, async args => ({
        contents: `${await readFile(args.path, "utf8")}\nexport { ChatPanel };`, loader: "tsx", resolveDir: path.dirname(args.path),
      }));
      builder.onResolve({ filter: /shared\/IconControl$/ }, args => ({ path: args.path, namespace: "narrow-icon" }));
      builder.onLoad({ filter: /.*/, namespace: "narrow-icon" }, () => ({ contents: "export const IconControl=()=>null;", loader: "js" }));
      builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(leaves, args.path) ? { path: args.path, namespace: "narrow-boundary" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "narrow-boundary" }, args => ({ contents: leaves[args.path]!, loader: "js" }));
    } }] });
  return { js: compiled.outputFiles.find(file => file.path.endsWith(".js"))!.text, css: compiled.outputFiles.find(file => file.path.endsWith(".css"))!.text };
}
let compilation: ReturnType<typeof compile> | undefined;
const composer = (page: Page) => page.locator('.composer-inline-input[contenteditable="true"]');
const documentRoot = (page: Page) => page.locator('[data-workspace-document]:not([hidden])');
const note = (page: Page) => documentRoot(page).locator(".step-form-note-input");
const save = (page: Page) => documentRoot(page).locator(".action-project-data-editor-save");
const fold = (page: Page) => page.locator(".workspace-side-panel-head-trailing .workspace-explorer-toggle");

async function openFixture() {
  const bundle = await (compilation ??= compile());
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } }); page.setDefaultTimeout(10_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const origin = "http://localhost/narrow-workbench-fixture";
  await page.route("**/*", route => route.request().url() === origin
    ? route.fulfill({ contentType: "text/html", body: '<!doctype html><html data-theme="light"><head><link rel="icon" href="data:,"></head><body><div id="root"></div></body></html>' })
    : (errors.push(`Unexpected network ${route.request().url()}`), route.abort()));
  try {
    await page.goto(origin);
    await page.evaluate(() => localStorage.setItem("agent-gui-chat-column-width", "560"));
    await page.addStyleTag({ content: bundle.css + "\nhtml,body,#root{height:100%;margin:0}" });
    await page.addScriptTag({ content: bundle.js });
    await composer(page).waitFor();
    await page.waitForFunction(() => Boolean((window as any).fixture?.open));
    return { browser, page, errors };
  } catch (error) { await browser.close(); throw error; }
}
async function openDocument(page: Page) {
  await page.evaluate(() => (window as any).fixture.open());
  await note(page).waitFor();
}
async function settleLayout(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function expectWorkspaceOnly(page: Page) {
  await page.locator(".app-main--workspace-only").waitFor();
  const geometry = await page.locator(".app-main:not(.app-main--hidden) > .app-main-body").evaluate(body => {
    const frame = body.getBoundingClientRect(), dock = body.querySelector(".workspace-side-panel")!.getBoundingClientRect();
    const chat = body.querySelector<HTMLElement>(".app-main-chat-column")!;
    return { fills: Math.abs(frame.left - dock.left) <= 1 && Math.abs(frame.right - dock.right) <= 1,
      contained: dock.left >= 0 && dock.right <= innerWidth + 1, hidden: chat.hidden, inert: chat.inert, chatWidth: chat.getBoundingClientRect().width };
  });
  assert.deepEqual(geometry, { fills: true, contained: true, hidden: true, inert: true, chatWidth: 0 });
}

test("narrow workbench fixture compiles the real Chat, dock and retained document graph", { timeout: 60_000 }, async () => {
  const bundle = await (compilation ??= compile());
  assert.ok(bundle.css.length > 0); assert.match(bundle.js, /WorkspaceDocumentHost/); assert.match(bundle.js, /useAppMainSplit/);
});

async function actualSplit(page: Page) {
  return page.locator(".app-main:not(.app-main--hidden) > .app-main-body").evaluate(body => {
    const chat = body.querySelector<HTMLElement>(".app-main-chat-column")!, dock = body.querySelector<HTMLElement>(".workspace-side-panel")!;
    return { body: body.getBoundingClientRect().width, chat: chat.getBoundingClientRect().width,
      dock: dock.getBoundingClientRect().width, preference: localStorage.getItem("agent-gui-chat-column-width") };
  });
}
async function dragChatTo(page: Page, width: number) {
  const split = await actualSplit(page), handle = await page.locator(".workspace-explorer-resizer").boundingBox(); assert.ok(handle);
  const x = handle.x + handle.width / 2, y = handle.y + Math.min(handle.height / 2, 60);
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + width - split.chat, y, { steps: 4 }); await page.mouse.up();
  await settleLayout(page);
}

test("a saved wide split reserves editable workspace width and restores its preference across constrained windows", { timeout: 90_000 }, async () => {
  const { browser, page, errors } = await openFixture();
  try {
    await page.setViewportSize({ width: 1440, height: 950 }); await openDocument(page); await settleLayout(page);
    await dragChatTo(page, 720);
    const wide = await actualSplit(page);
    assert.ok(Math.abs(wide.chat - 720) <= 1 && wide.dock >= 719); assert.equal(wide.preference, "720");

    await page.setViewportSize({ width: 1024, height: 720 }); await settleLayout(page);
    const constrained = await actualSplit(page);
    assert.ok(constrained.chat >= 400 && constrained.dock >= 559, JSON.stringify(constrained));
    assert.ok(Math.abs(constrained.chat - 464) <= 1); assert.equal(constrained.preference, "720");
    await page.locator(".workspace-explorer-resizer").click();
    assert.equal((await actualSplit(page)).preference, "720", "A pointer click with no drag cannot persist a temporary clamp");
    await dragChatTo(page, 444);
    const dragged = await actualSplit(page);
    assert.ok(Math.abs(dragged.chat - 444) <= 1, JSON.stringify(dragged));
    assert.equal(dragged.preference, "444", "Dragging begins at the actual 464px column, not its retained 720px preference");
    await page.setViewportSize({ width: 1440, height: 950 }); await settleLayout(page); await dragChatTo(page, 720);

    await page.setViewportSize({ width: 900, height: 420 }); await settleLayout(page); await expectWorkspaceOnly(page);
    assert.equal((await actualSplit(page)).preference, "720");
    const variables = documentRoot(page).getByRole("button", { name: "打开变量面板", exact: true });
    await variables.click();
    assert.equal(await documentRoot(page).getByRole("dialog", { name: "变量", exact: true }).count(), 1, "The catalog cannot cover the actual variable toggle");
    await documentRoot(page).getByRole("button", { name: "收起变量面板", exact: true }).click();
    await page.setViewportSize({ width: 420, height: 720 }); await settleLayout(page); await expectWorkspaceOnly(page);
    assert.equal((await actualSplit(page)).preference, "720");
    await page.setViewportSize({ width: 1440, height: 950 }); await settleLayout(page);
    const restored = await actualSplit(page);
    assert.equal(await page.locator(".app-main--workspace-only").count(), 0);
    assert.ok(Math.abs(restored.chat - 720) <= 1 && restored.dock >= 719, JSON.stringify(restored)); assert.equal(restored.preference, "720");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.calls), []);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.chatRequests), []);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []); assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("actual dock toggles and width changes preserve Chat, document history, pending save and wide split preference", { timeout: 90_000 }, async () => {
  const { browser, page, errors } = await openFixture();
  try {
    await composer(page).fill("retained human composer draft");
    await openDocument(page);
    await page.evaluate(() => {
      const f = (window as any).fixture;
      f.originalChat = document.querySelector(".app-main"); f.originalComposer = document.querySelector('.composer-inline-input[contenteditable="true"]');
      f.originalDocument = document.querySelector("[data-workspace-document]:not([hidden])");
    });
    await note(page).fill("saved snapshot before narrow mode");
    await documentRoot(page).locator(".action-project-data-editor-tab").filter({ hasText: "可视化" }).click();
    await page.evaluate(() => { (window as any).fixture.deferSave = true; });
    await save(page).click();
    await page.waitForFunction(() => (window as any).fixture.pendingSaves.length === 1);
    await note(page).fill("later draft while save is pending");
    await page.setViewportSize({ width: 420, height: 720 }); await settleLayout(page); await expectWorkspaceOnly(page);
    assert.equal(await note(page).inputValue(), "later draft while save is pending");
    await fold(page).click();
    await composer(page).waitFor({ state: "visible" });
    assert.equal(await composer(page).textContent(), "retained human composer draft");
    assert.equal(await page.evaluate(() => {
      const f = (window as any).fixture;
      return f.originalChat === document.querySelector(".app-main") && f.originalComposer === document.querySelector('.composer-inline-input[contenteditable="true"]')
        && f.originalDocument.isConnected && f.instances().length === 1;
    }), true);
    await page.getByRole("button", { name: "展开工作区侧栏", exact: true }).click();
    await note(page).waitFor(); await expectWorkspaceOnly(page);
    await page.evaluate(() => { (window as any).fixture.pendingSaves.shift()(); });
    await page.waitForFunction(() => (window as any).fixture.files.get((window as any).fixture.file).includes("saved snapshot before narrow mode"));
    assert.equal(await note(page).inputValue(), "later draft while save is pending", "Late ACK retains the later human draft");
    await documentRoot(page).locator(".action-project-data-editor-tab").filter({ hasText: "可视化" }).click();
    await documentRoot(page).locator('[title="撤销 (Ctrl+Z)"]').click();
    assert.equal(await note(page).inputValue(), "saved snapshot before narrow mode");
    await documentRoot(page).locator('[title^="重做 ("]').click();
    assert.equal(await note(page).inputValue(), "later draft while save is pending");
    await page.setViewportSize({ width: 1280, height: 950 }); await settleLayout(page);
    assert.equal(await page.locator(".app-main--workspace-only").count(), 0);
    const wide = await page.locator(".app-main-body").evaluate(body => {
      const chat = body.querySelector<HTMLElement>(".app-main-chat-column")!, dock = body.querySelector<HTMLElement>(".workspace-side-panel")!;
      const f = (window as any).fixture;
      return { chatWidth: chat.getBoundingClientRect().width, dockWidth: dock.getBoundingClientRect().width, hidden: chat.hidden, inert: chat.inert,
        preference: localStorage.getItem("agent-gui-chat-column-width"), sameDocument: f.originalDocument === document.querySelector("[data-workspace-document]:not([hidden])") };
    });
    assert.ok(wide.chatWidth > 0 && wide.dockWidth > 0); assert.ok(Math.abs(wide.chatWidth - 560) <= 1);
    assert.deepEqual({ ...wide, chatWidth: undefined, dockWidth: undefined }, { chatWidth: undefined, dockWidth: undefined, hidden: false, inert: false, preference: "560", sameDocument: true });
    await page.setViewportSize({ width: 1024, height: 950 }); await settleLayout(page);
    assert.equal(await page.locator(".app-main--workspace-only").count(), 0);
    await page.evaluate(() => (window as any).fixture.setSidebarCollapsed(false)); await settleLayout(page);
    await expectWorkspaceOnly(page);
    assert.equal(await page.evaluate(() => innerWidth), 1024, "The actual body, including the real navigation column, owns the breakpoint");
    assert.equal(await page.evaluate(() => localStorage.getItem("agent-gui-chat-column-width")), "560");
    assert.equal(await page.evaluate(() => (window as any).fixture.calls.length), 1);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.chatRequests), []);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []); assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("hidden Chat releases global editing and portals while a real private pin returns once to its original composer", { timeout: 90_000 }, async () => {
  const { browser, page, errors } = await openFixture();
  try {
    await page.locator('[data-message-id="chat-a-u2"]').click();
    await composer(page).fill("retained branch-edit draft");
    await openDocument(page);
    await page.locator(".model-picker-trigger").click();
    await page.getByRole("dialog", { name: "模型选择", exact: true }).waitFor();
    await page.setViewportSize({ width: 420, height: 720 }); await settleLayout(page); await expectWorkspaceOnly(page);
    await page.locator(".model-picker-float").waitFor({ state: "detached" });
    assert.equal(await page.locator(".model-picker-detail").count(), 0);
    await note(page).click();
    await documentRoot(page).getByRole("button", { name: "打开变量面板", exact: true }).click();
    await page.keyboard.press("Escape");
    assert.equal(await composer(page).textContent(), "retained branch-edit draft");
    assert.equal(await page.locator(".composer-edit-banner").count(), 1, "Designer pointer/Escape must not exit the hidden Chat edit owner");
    await fold(page).click(); await composer(page).waitFor({ state: "visible" });
    await page.evaluate(() => { (window as any).fixture.deferMention = true; });
    await composer(page).focus(); await page.keyboard.press("End"); await page.keyboard.type(" @narrow-late");
    await page.waitForFunction(() => (window as any).fixture.pendingMentions.length > 0);
    await openDocument(page); await expectWorkspaceOnly(page);
    await page.evaluate(() => { const f = (window as any).fixture; for (const finish of f.pendingMentions.splice(0)) finish(); });
    await settleLayout(page);
    assert.equal(await page.locator(".composer-mention-menu,.composer-tag-preview--portal,.model-picker-float").count(), 0, "Late candidates cannot reopen a portal belonging to hidden Chat");
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest(".app-main-chat-column")), false);
    await fold(page).click(); await composer(page).waitFor({ state: "visible" });
    assert.match(await composer(page).textContent() ?? "", /retained branch-edit draft/);
    await page.locator(".composer-test-prompts-trigger").click();
    await page.locator(".composer-test-prompts-panel--portal").waitFor();
    await openDocument(page); await expectWorkspaceOnly(page);
    await page.locator(".composer-test-prompts-panel--portal").waitFor({ state: "detached" });
    await fold(page).click(); await composer(page).waitFor({ state: "visible" });
    await page.locator(".composer-edit-banner").getByRole("button", { name: "完成", exact: true }).click();
    await openDocument(page); await expectWorkspaceOnly(page);
    await documentRoot(page).getByRole("button", { name: "添加步骤到对话", exact: true }).first().click();
    await composer(page).waitFor({ state: "visible" });
    await page.waitForFunction(() => document.activeElement?.classList.contains("composer-inline-input"));
    assert.equal(await composer(page).locator(".composer-prompt-tag--program-step").count(), 1);
    const grant = await page.evaluate(async () => {
      const f = (window as any).fixture, pin = f.pins.at(-1);
      if (!pin?.result.pinId) throw Error("Actual private pin was rejected: " + JSON.stringify(pin));
      const selection = f.live.captureForManualSend({ threadId: "chat-a", userMessageId: "fixture-manual-read", cwd: f.cwd, pins: [pin.result], mode: "read" });
      if (selection.state !== "ready") throw Error("Original private grant was lost: " + JSON.stringify(selection));
      return { pinCount: f.pins.length, threadId: pin.result.threadId, read: await f.live.execute(selection.scope, { scopeId: selection.scope.scopeId,
        operationId: "read-narrow-pin", input: { action: "read_live" } }) };
    });
    assert.equal(grant.pinCount, 1); assert.equal(grant.threadId, "chat-a"); assert.equal(grant.read.ok, true);
    assert.match(grant.read.content, /original document note/);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.chatRequests), [], "Pin insertion never automatically sends a model request");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.calls), []);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []); assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("a real variable pin reads the original Session and queued insertion cannot cross a Chat owner", { timeout: 90_000 }, async () => {
  const { browser, page, errors } = await openFixture();
  try {
    await page.evaluate(() => { (window as any).fixture.originalVariableComposer = document.querySelector('.composer-inline-input[contenteditable="true"]'); });
    await openDocument(page);
    await documentRoot(page).getByRole("button", { name: "打开变量面板", exact: true }).click();
    await documentRoot(page).locator('[data-variable-id="owned-variable"]').click();
    await documentRoot(page).locator('.variable-form input[title="备注"]').fill("unblurred variable Session draft");
    await page.setViewportSize({ width: 420, height: 720 }); await settleLayout(page); await expectWorkspaceOnly(page);
    await documentRoot(page).getByRole("button", { name: "添加变量到对话", exact: true }).click();
    await composer(page).waitFor({ state: "visible" });
    await page.waitForFunction(() => document.activeElement?.classList.contains("composer-inline-input"));
    assert.equal(await composer(page).locator(".composer-prompt-tag--program-variable").count(), 1);
    assert.equal(await composer(page).locator(".composer-prompt-tag--program-variable").getAttribute("data-variable-id"), "owned-variable");
    assert.equal(await page.locator(".workspace-side-panel").count(), 0, "The actual variable action folds the narrow dock");
    const original = await page.evaluate(() => {
      const f = (window as any).fixture, pin = f.variablePins[0];
      if (!pin?.result.pinId) throw Error("Actual variable pin failed: " + JSON.stringify(pin));
      const captured = f.live.captureForManualSend({ threadId: "chat-a", userMessageId: "variable-positive", cwd: f.cwd, pins: [pin.result], mode: "read" });
      if (captured.state !== "ready") throw Error("Original variable scope unavailable: " + JSON.stringify(captured));
      const read = f.live.execute(captured.scope, { scopeId: captured.scope.scopeId, operationId: "read-original-variable",
        input: { action: "read_live", variableFor: pin.variable } });
      const denied = f.live.execute(captured.scope, { scopeId: captured.scope.scopeId, operationId: "read-ungranted-variable",
        input: { action: "read_live", variableFor: { surface: "main", variableId: "ungranted-variable" } } });
      return { pinCount: f.variablePins.length, threadId: pin.result.threadId, selector: pin.variable,
        owner: captured.scope.target.owner, instanceId: f.instances()[0].instanceId, file: f.file, read, denied, disk: f.files.get(f.file),
        sameComposer: f.originalVariableComposer === document.querySelector('.composer-inline-input[contenteditable="true"]') };
    });
    assert.equal(original.pinCount, 1); assert.equal(original.threadId, "chat-a");
    assert.deepEqual(original.selector, { surface: "main", variableId: "owned-variable" });
    assert.equal(original.owner.path, original.file); assert.equal(original.owner.instanceId, original.instanceId);
    assert.equal(original.sameComposer, true); assert.equal(original.denied.ok, false); assert.equal(original.denied.code, "LIVE_VARIABLE_NOT_GRANTED");
    assert.equal(original.read.ok, true); assert.match(original.read.variable.variableJson, /unblurred variable Session draft/);
    assert.match(original.disk, /original variable description/); assert.doesNotMatch(original.disk, /unblurred variable Session draft/);

    await page.evaluate(() => (window as any).fixture.mountSecondChat());
    await page.locator('[data-chat-panel="chat-b"] .app-main--hidden').waitFor({ state: "attached" });
    const chatA = page.locator('[data-chat-panel="chat-a"] .composer-inline-input[contenteditable="true"]');
    const chatB = page.locator('[data-chat-panel="chat-b"] .composer-inline-input[contenteditable="true"]');
    await page.evaluate(() => (window as any).fixture.switchChat("chat-b"));
    await chatB.waitFor({ state: "visible" }); await chatB.fill("retained other Chat draft");
    await page.evaluate(() => (window as any).fixture.switchChat("chat-a")); await chatA.waitFor({ state: "visible" });
    await openDocument(page); await expectWorkspaceOnly(page);
    const pinButton = documentRoot(page).getByRole("button", { name: "添加变量到对话", exact: true });
    // The observer arms a one-frame latch only after the actual registry pin.
    // Playwright actionability, React rendering and every other frame stay native.
    await page.evaluate(() => { (window as any).fixture.holdVariableReveal = true; });
    await pinButton.click();
    assert.equal(await page.evaluate(() => (window as any).fixture.heldFrames.length), 1, "The real insertion is pending before the Chat switch");
    await page.evaluate(() => (window as any).fixture.switchChat("chat-b"));
    await page.waitForFunction(() => !document.querySelector('[data-chat-panel="chat-b"] .app-main')?.classList.contains("app-main--hidden"), undefined, { polling: 25 });
    await page.evaluate(() => (window as any).fixture.releaseFrames()); await settleLayout(page);
    await chatB.waitFor({ state: "visible" });
    assert.equal(await chatA.locator(".composer-prompt-tag--program-variable").count(), 1, "Late insertion cannot add a second chip to the hidden original Chat");
    assert.equal(await chatB.locator(".composer-prompt-tag--program-variable").count(), 0, "The new Chat receives no late variable reference");
    assert.equal(await chatB.textContent(), "retained other Chat draft");
    assert.equal(await chatB.evaluate(element => document.activeElement === element), true, "The late callback cannot steal the foreground Chat's focus");
    const late = await page.evaluate(() => {
      const f = (window as any).fixture, pin = f.variablePins.at(-1);
      return { pinCount: f.variablePins.length, threadId: pin.result.threadId,
        capture: f.live.captureForManualSend({ threadId: "chat-b", userMessageId: "wrong-chat-variable", cwd: f.cwd, pins: [pin.result], mode: "edit" }) };
    });
    assert.equal(late.pinCount, 2); assert.equal(late.threadId, "chat-a", "The synchronous pin still belongs to the original explicit action");
    assert.equal(late.capture.state, "unavailable"); assert.equal(late.capture.code, "LIVE_PIN_UNAVAILABLE");
    assert.equal(late.capture.retryable, false); assert.equal("scope" in late.capture, false, "The new Chat receives no variable authority");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.chatRequests), []);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.calls), []);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []); assert.deepEqual(errors, []);
  } finally {
    await page.evaluate(() => (window as any).fixture?.restoreFrames?.()).catch(() => {});
    await browser.close();
  }
});
