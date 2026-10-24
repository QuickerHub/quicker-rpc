import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

const fixture = `
import React,{StrictMode,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ManualTracePresentationProvider,useManualTracePresentation} from '@/lib/action-trace-presentation';
import {startActionTrace} from '@/lib/action-trace-client';
import {ActionProjectToolbar} from '@/components/workspace/ActionProjectToolbar';
import {ToolTestActionTracePanel} from '@/components/tool-test/ToolTestActionTracePanel';
import {ActionTracePanel} from '@/components/action-trace/ActionTracePanel';
import {getActionTraceTabs,useActionTraceTabs,switchActionTraceThread,prepareHistoricalTraceView} from '@/lib/action-trace-overlay';
const actionId='11111111-1111-4111-8111-111111111111';
const binding={hostInstanceId:'fixture',hostSessionId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',endpoint:'QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',hostKind:'v1',protocolVersion:1,schemaVersion:1,capabilities:{}};
const state=window.fixture={posts:[],feeds:[],focus:[],unexpected:[],selected:'',thread:'A',rejectNext:false};
window.fetch=async(input,init)=>{
 const url=new URL(String(input),'http://fixture.invalid');
 if(url.pathname==='/api/actions/trace/stream'&&init.method==='POST'){
  if(state.rejectNext){state.rejectNext=false;return Response.json({ok:false,code:'HOST_BINDING_REQUIRED',error:'Project is unbound; no action dispatched',dispatchStatus:'not-dispatched',retryable:false},{status:409})}
  const body=JSON.parse(init.body),index=state.posts.length+1;
  const executionId='manual-execution-'+index;
  const owner={version:1,runId:'manual-run-'+index,executionId,threadId:'manual:'+executionId,cwd:body.cwd,actionId:body.xaction?'ephemeral:'+executionId:body.actionId,param:body.param?.trim()||undefined,hostBinding:binding,invocationPath:[]};
  return new Promise(resolve=>state.posts.push({body,owner,signal:init.signal,ack:()=>resolve(Response.json({ok:true,owner}))}));
 }
 if(url.pathname==='/api/actions/trace/feed'){
  const owner=JSON.parse(url.searchParams.get('owner')); const entry={owner,signal:init.signal,controller:null};state.feeds.push(entry);
  return new Response(new ReadableStream({start(controller){entry.controller=controller;init.signal.addEventListener('abort',()=>{try{controller.error(init.signal.reason)}catch{}})}}));
 }
 state.unexpected.push(url.pathname);throw new Error('Unexpected request '+url.pathname);
};
state.event=(runId,type,data)=>{const feed=state.feeds.find(f=>f.owner.runId===runId&&!f.signal.aborted);if(!feed)throw Error('No feed '+runId);feed.controller.enqueue(new TextEncoder().encode('event: '+type+'\\ndata: '+JSON.stringify(data)+'\\n\\n'));if(type==='done')feed.controller.close()};
function TitledTrigger(){const presentation=useManualTracePresentation();return <button onClick={()=>startActionTrace({actionId,actionTitle:'Explicit action title',presentation})}>Titled trace</button>}
function App(){
 const [thread,setThread]=useState('A'),[selected,setSelected]=useState(''),[cwds,setCwds]=useState({A:'cwd-A',B:'cwd-B',I:'cwd-I'});const tabs=useActionTraceTabs();
 state.changeCwd=(id,cwd)=>setCwds(value=>({...value,[id]:cwd}));
 state.select=id=>{state.selected=id;setSelected(id)};
 state.tabs=()=>getActionTraceTabs();
 state.switch=next=>{state.thread=next;switchActionTraceThread(next);setThread(next);state.select(getActionTraceTabs().at(-1)?.tabId||'')};
 state.history=()=>{const view=prepareHistoricalTraceView({threadId:state.thread,cwd:'cwd-'+state.thread,messageId:'old-message',partKey:'old-call',actionId});view.hydrate({ok:true,events:[{kind:'info',message:'readonly history'}]});state.select(view.tabId)};
 return <><nav>{['A','B','I'].map(id=><button key={id} onClick={()=>state.switch(id)}>Thread {id}</button>)}</nav>
  {['A','B','I'].map(id=><ManualTracePresentationProvider key={id} threadId={id} cwd={cwds[id]} active={thread===id}>
   <section data-owner={id} hidden={thread!==id} inert={thread!==id}>
    {id==='I'?<ToolTestActionTracePanel/>:<><ActionProjectToolbar actionId={actionId} layout='inline'/>{id==='A'?<TitledTrigger/>:null}</>}
   </section>
  </ManualTracePresentationProvider>)}
  <div data-tabs>{tabs.map(tab=><button key={tab.tabId} onClick={()=>state.select(tab.tabId)}>{tab.owner?.runId||'pending'}</button>)}</div>
  <ActionTracePanel tabId={selected}/></>;
}
switchActionTraceThread('A');createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);
`;
test("real manual Toolbar and inline DOM isolate pending ACK, background runs, close and history", { timeout: 45_000 }, async () => {
  const bundle = await build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", tsconfig: "tsconfig.json", define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "manual-trace-boundaries", setup(b) {
    b.onResolve({ filter: /^@\/lib\/workspace-explorer$/ }, () => ({ path: "explorer", namespace: "inert" }));
    b.onLoad({ filter: /.*/, namespace: "inert" }, () => ({ contents: "export const workspaceExplorerActionsRef={current:{focusSidePanelView(id){window.fixture.focus.push(id);window.fixture.select(id)},setActiveSideView(){window.fixture.select('')}}}", loader: "js" }));
  } }] });
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 780 } }); page.setDefaultTimeout(6000);
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (entry) => { if (entry.type() === "error") errors.push(entry.text()); });
    await page.route("**/*", (route) => { errors.push(`network:${route.request().url()}`); return route.abort(); });
    await page.setContent('<html><body><div id="root"></div></body></html>');
    await page.addStyleTag({ content: "body{font:14px system-ui;margin:12px;background:#161616;color:#eee}button{margin:4px}.action-trace-panel{border:1px solid #666;padding:12px}.action-trace-panel__body{max-height:500px;overflow:auto}" });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const toolbar = (id: string) => page.locator(`[data-owner="${id}"]`);
    await toolbar("A").getByRole("button", { name: "调试", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.posts.length === 1);
    await page.getByRole("button", { name: "关闭 trace 标签", exact: true }).click();
    await page.evaluate(() => (window as any).fixture.posts[0].ack());
    await page.waitForFunction(() => !(document.querySelector('[data-owner="A"] button[title="调试：在右侧侧栏查看步骤输出"]') as HTMLButtonElement)?.disabled);
    assert.equal(await page.evaluate(() => (window as any).fixture.tabs().length), 0);
    assert.equal(await page.evaluate(() => (window as any).fixture.feeds.length), 0);
    assert.equal(await page.evaluate(() => (window as any).fixture.posts[0].signal.aborted), true);

    await toolbar("A").getByRole("button", { name: "调试", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.posts.length === 2);
    await page.getByRole("button", { name: "Thread B", exact: true }).click();
    const focusCount = await page.evaluate(() => (window as any).fixture.focus.length);
    await page.evaluate(() => (window as any).fixture.posts[1].ack());
    await page.waitForFunction(() => (window as any).fixture.feeds.length === 1);
    assert.equal(await page.evaluate(() => (window as any).fixture.tabs().length), 0);
    assert.equal(await page.evaluate(() => (window as any).fixture.focus.length), focusCount);
    await toolbar("B").getByRole("button", { name: "调试", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.posts.length === 3);
    await page.evaluate(() => (window as any).fixture.posts[2].ack());
    await page.waitForFunction(() => (window as any).fixture.feeds.length === 2);
    await page.evaluate(() => { const f = (window as any).fixture;
      f.event('manual-run-2', 'trace', { sequence: 1, kind: 'info', message: 'A background only' });
      f.event('manual-run-2', 'done', { ok: true, traceOwner: f.posts[1].owner });
      f.event('manual-run-3', 'trace', { sequence: 1, kind: 'info', message: 'B foreground only' });
    });
    await page.getByText("B foreground only", { exact: true }).waitFor();
    assert.equal(await page.getByText("A background only", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "关闭 trace 标签", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.feeds[1].signal.aborted), true);
    assert.equal(await page.evaluate(() => (window as any).fixture.posts[2].signal.aborted), false);
    await page.getByRole("button", { name: "Thread A", exact: true }).click();
    await page.getByText("A background only", { exact: true }).waitFor();
    const posts = await page.evaluate(() => (window as any).fixture.posts.length);
    await page.evaluate(() => (window as any).fixture.history()); await page.getByText("readonly history", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => (window as any).fixture.posts.length), posts);

    await page.getByRole("button", { name: "Thread I", exact: true }).click();
    await toolbar("I").locator(".tool-test-action-trace-case--standalone").first().click();
    await page.waitForFunction(() => (window as any).fixture.posts.length === 4);
    assert.equal(await page.evaluate(() => (window as any).fixture.posts[3].body.cwd), "cwd-I");
    assert.equal(await page.evaluate(() => Array.isArray((window as any).fixture.posts[3].body.xaction.steps)), true);
    assert.equal(await page.evaluate(() => Array.isArray((window as any).fixture.posts[3].body.xaction.variables)), true);
    await page.evaluate(() => (window as any).fixture.posts[3].ack());
    await page.waitForFunction(() => (window as any).fixture.feeds.length === 3);
    await page.evaluate(() => { const f = (window as any).fixture; f.event('manual-run-4', 'done', { ok: true, traceOwner: f.posts[3].owner, returnResult: 'inline complete' }); });
    await page.getByText("调试完成", { exact: true }).waitFor();
    assert.equal(await page.locator('.action-trace-panel__subtitle').innerText(), await page.evaluate(() => (window as any).fixture.posts[3].body.xaction.title));
    await page.getByRole("tab", { name: "终端", exact: true }).click();
    assert.equal(await page.locator('.action-trace-terminal__cmd code').innerText(), 'qkrpc action run --xaction-file <program.json> --trace');
    assert.equal(await page.evaluate(() => Object.hasOwn((window as any).fixture.posts[3].owner, 'actionTitle')), false);
    await page.getByRole("button", { name: "Thread A", exact: true }).click();
    await page.evaluate(() => { (window as any).fixture.rejectNext = true; });
    await toolbar("A").getByRole("button", { name: "调试", exact: true }).click();
    await page.getByText("调试失败", { exact: true }).waitFor();
    await page.getByRole("tab", { name: "终端", exact: true }).click();
    await page.locator('.action-trace-terminal__text').filter({ hasText: 'Project is unbound; no action dispatched' }).waitFor();
    assert.equal(await page.getByText("结果未知", { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => (window as any).fixture.tabs().at(-1).resultUnknown), false);
    await toolbar("A").getByRole("button", { name: "Titled trace", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.posts.length === 5);
    await page.getByText('Explicit action title', { exact: true }).waitFor();
    await page.evaluate(() => (window as any).fixture.changeCwd('A', 'cwd-A-next'));
    const beforeCwdAckFocus = await page.evaluate(() => (window as any).fixture.focus.length);
    await page.evaluate(() => (window as any).fixture.posts[4].ack());
    await page.waitForFunction(() => (window as any).fixture.feeds.length === 4);
    assert.equal(await page.evaluate(() => (window as any).fixture.focus.length), beforeCwdAckFocus);
    assert.equal(await page.evaluate(() => (window as any).fixture.tabs().at(-1).owner.cwd), "cwd-A");
    assert.equal(await page.evaluate(() => (window as any).fixture.feeds.at(-1).owner.cwd), "cwd-A");
    await page.getByRole('button', { name: 'manual-run-5', exact: true }).click();
    await page.getByText('Explicit action title', { exact: true }).waitFor();
    await page.getByRole("tab", { name: "终端", exact: true }).click();
    assert.equal(await page.locator('.action-trace-terminal__cmd code').innerText(), 'qkrpc action run --id 11111111-1111-4111-8111-111111111111 --trace');
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []); assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
