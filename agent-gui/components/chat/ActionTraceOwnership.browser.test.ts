import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

const fixture = `
import React,{StrictMode,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ActionTraceMessageProvider,ActionTraceToolSync} from '@/components/chat/ActionTraceToolSync';
import {ActionTracePanel} from '@/components/action-trace/ActionTracePanel';
import {switchActionTraceThread,useActionTraceTabs,getActionTraceTabs} from '@/lib/action-trace-overlay';
const binding={hostInstanceId:'fixture',hostSessionId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',endpoint:'QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',hostKind:'v1',protocolVersion:1,schemaVersion:1,capabilities:{}};
const state=window.fixture={feeds:[],reads:[],pending:[],unexpected:[],focus:[],messages:{},live:{},selected:'',thread:'A',files:new Map(),deferFiles:false};
state.cwds={A:'cwd-A',B:'cwd-B',H:'cwd-H'};
const legacyInput={id:'same-action'},legacyOutput={ok:true,exitCode:0,source:'qkrpc',data:{traceRef:{path:'legacy.json',format:'action-trace-v1'}}};
state.owner=(runId,threadId='A')=>({version:1,runId,executionId:'exec-'+threadId,threadId,cwd:'cwd-'+threadId,actionId:'same-action',param:'same-param',hostBinding:binding,toolCallId:'call_0',invocationPath:[]});
window.fetch=async(input,init)=>{
 const url=new URL(String(input),'http://fixture.invalid');
 if(url.pathname==='/api/actions/trace/feed'){
  const owner=JSON.parse(url.searchParams.get('owner'));
  const entry={owner,signal:init.signal,controller:null};state.feeds.push(entry);
  return new Response(new ReadableStream({start(controller){entry.controller=controller;init.signal.addEventListener('abort',()=>{try{controller.error(init.signal.reason)}catch{}})}}));
 }
 if(url.pathname==='/api/workspace'&&url.searchParams.get('op')==='read'){
  const cwd=url.searchParams.get('cwd'),path=url.searchParams.get('path');state.reads.push({cwd,path});
  const response=()=>Response.json({ok:true,content:state.files.get(path)});
  if(state.deferFiles)return await new Promise(resolve=>state.pending.push(()=>resolve(response())));
  return response();
 }
 state.unexpected.push(url.pathname);throw new Error('Unexpected request '+url.pathname);
};
state.event=(runId,type,data)=>{const feed=[...state.feeds].reverse().find(f=>f.owner.runId===runId&&!f.signal.aborted);if(!feed)throw new Error('Missing feed '+runId);feed.controller.enqueue(new TextEncoder().encode('event: '+type+'\\ndata: '+JSON.stringify(data)+'\\n\\n'));if(type==='done')feed.controller.close()};
function App(){
 const [messages,setMessages]=useState({}),[thread,setThread]=useState('A'),[selected,setSelected]=useState('');const tabs=useActionTraceTabs();
 state.setMessages=setMessages;state.select=id=>{state.selected=id;setSelected(id)};
 state.changeCwd=(id,cwd)=>{state.cwds[id]=cwd;setMessages({...state.messages})};
 state.switch=next=>{state.thread=next;switchActionTraceThread(next);setThread(next);const tab=getActionTraceTabs().at(-1);state.select(tab?.tabId||'')};
 state.append=(owner,kind,data)=>{state.messages[owner.threadId]??={id:'message-'+owner.threadId,role:'assistant',metadata:{executionId:owner.executionId},parts:[]};const m=state.messages[owner.threadId];m.parts=[...m.parts,{type:'data-actionTrace',data:{kind,owner,...(data?{data}:{})}}];setMessages({...state.messages})};
 state.start=owner=>{state.live[owner.threadId]=true;state.append(owner,'start')};
 state.history=()=>{state.messages.H={id:'legacy-message',role:'assistant',parts:[]};state.live.H=false;setMessages({...state.messages})};
 state.tabs=()=>getActionTraceTabs();
 return <><nav>{['A','B','H'].map(id=><button key={id} onClick={()=>state.switch(id)}>Thread {id}</button>)}</nav>
  {Object.entries(messages).map(([id,message])=><ActionTraceMessageProvider key={id} threadId={id} cwd={state.cwds[id]} message={message} live={!!state.live[id]}>
   {id==='H'?<ActionTraceToolSync toolName='qkrpc_action_debug' input={legacyInput} output={legacyOutput} isRunning={false} partKey='call_0'/>:null}
  </ActionTraceMessageProvider>)}
  <div data-tabs>{tabs.map(tab=><button data-tab={tab.tabId} key={tab.tabId} onClick={()=>state.select(tab.tabId)}>{tab.owner?.runId||'legacy'}</button>)}</div>
  <ActionTracePanel tabId={selected}/></>;
}
switchActionTraceThread('A');createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);
`;

test("owned Agent trace DOM isolates background runs, terminal/close, delayed files and legacy history", { timeout: 45_000 }, async () => {
  const result = await build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", tsconfig: "tsconfig.json", define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "trace-dom-boundaries", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/workspace-explorer$/ }, () => ({ path: "explorer", namespace: "inert" }));
      builder.onResolve({ filter: /^\.\/tool-output$/ }, () => ({ path: "tool-output", namespace: "inert" }));
      builder.onLoad({ filter: /.*/, namespace: "inert" }, (args) => ({ contents: args.path === "explorer"
        ? "export const workspaceExplorerActionsRef={current:{focusSidePanelView(id){window.fixture.focus.push(id);window.fixture.select(id)},setActiveSideView(){window.fixture.select('')}}}"
        : "export function readQkrpcToolOutputData(output){return output?.displayData??output?.data??null}", loader: "js" }));
    } }] });
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } }); page.setDefaultTimeout(6000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (entry) => { if (entry.type() === "error") errors.push(entry.text()); });
    await page.route("**/*", (route) => { errors.push(`network:${route.request().url()}`); return route.abort(); });
    await page.setContent('<html><body><div id="root"></div></body></html>');
    await page.addStyleTag({ content: "body{font:14px system-ui;margin:12px;background:#161616;color:#eee}button{margin:4px}.action-trace-panel{border:1px solid #666;padding:12px}.action-trace-panel__body{max-height:550px;overflow:auto}" });
    await page.addScriptTag({ content: result.outputFiles[0].text });
    await page.getByRole("button", { name: "Thread A", exact: true }).waitFor();
    await page.evaluate(() => { const f = (window as any).fixture; f.start(f.owner("run-A")); });
    await page.waitForFunction(() => (window as any).fixture.feeds.some((f: any) => f.owner.runId === "run-A" && !f.signal.aborted));
    await page.evaluate(() => (window as any).fixture.event("run-A", "trace", { sequence: 1, kind: "info", message: "A first" }));
    const beforeCwdChange = await page.evaluate(() => (window as any).fixture.feeds.length);
    await page.evaluate(() => (window as any).fixture.changeCwd("A", "cwd-A-new-presentation"));
    await page.waitForFunction((previous) => { const f = (window as any).fixture; return f.feeds.length > previous && f.feeds.some((feed: any) => feed.owner.runId === "run-A" && feed.owner.cwd === "cwd-A" && !feed.signal.aborted); }, beforeCwdChange);
    await page.getByRole("button", { name: "Thread B", exact: true }).click();
    await page.evaluate(() => { const f = (window as any).fixture; f.start(f.owner("run-B", "B")); });
    await page.waitForFunction(() => (window as any).fixture.feeds.some((f: any) => f.owner.runId === "run-B" && !f.signal.aborted));
    await page.evaluate(() => { const f = (window as any).fixture;
      f.event("run-A", "trace", { sequence: 2, kind: "info", message: "A background" });
      f.event("run-B", "trace", { sequence: 1, kind: "info", message: "B only" });
      f.event("run-A", "done", { ok: true, traceOwner: f.owner("run-A"), eventCount: 2 });
      f.event("run-B", "done", { ok: false, traceOwner: f.owner("run-B", "B"), error: "WRITE_RESULT_UNKNOWN", message: "B result unknown" });
    });
    await page.getByText("B only", { exact: true }).waitFor();
    assert.equal(await page.getByText("A background", { exact: true }).count(), 0);
    await page.getByText("结果未知", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Thread A", exact: true }).click();
    await page.getByText("A background", { exact: true }).waitFor();
    assert.equal(await page.getByText("B only", { exact: true }).count(), 0);
    await page.getByRole("tab", { name: "终端", exact: true }).click();
    await page.locator(".action-trace-terminal__text").filter({ hasText: "A background" }).waitFor();
    await page.getByRole("button", { name: "关闭 trace 标签", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.tabs().length === 0);

    await page.evaluate(() => { const f = (window as any).fixture; f.start(f.owner("run-C")); });
    await page.waitForFunction(() => (window as any).fixture.feeds.some((f: any) => f.owner.runId === "run-C" && !f.signal.aborted));
    await page.evaluate(() => { const f = (window as any).fixture, owner = f.owner("run-C");
      f.event("run-C", "done", { ok: true, traceOwner: owner }); f.deferFiles = true;
      f.files.set("C.json", JSON.stringify({ version: 1, actionId: owner.actionId, param: owner.param, traceOwner: owner, ok: true, events: [{ kind: "info", message: "late C file" }] }));
      f.append(owner, "result", { ok: true, traceOwner: owner, traceRef: { path: "C.json", format: "action-trace-v1", owner } });
    });
    await page.waitForFunction(() => (window as any).fixture.pending.length === 1);
    await page.getByRole("button", { name: "关闭 trace 标签", exact: true }).click();
    await page.evaluate(() => { const f = (window as any).fixture; f.start(f.owner("run-D")); });
    await page.waitForFunction(() => (window as any).fixture.tabs().some((t: any) => t.owner?.runId === "run-D"));
    await page.evaluate(() => (window as any).fixture.pending.shift()());
    await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    assert.equal(await page.getByText("late C file", { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => (window as any).fixture.tabs().some((t: any) => t.owner?.runId === "run-C")), false);

    await page.evaluate(() => { const f = (window as any).fixture; f.start(f.owner("zero-events")); });
    await page.waitForFunction(() => (window as any).fixture.feeds.some((f: any) => f.owner.runId === "zero-events" && !f.signal.aborted));
    await page.evaluate(() => { const f = (window as any).fixture; f.feeds.find((item: any) => item.owner.runId === "zero-events" && !item.signal.aborted).controller.error(new Error("observer disconnected")); });
    await page.getByText("结果未知", { exact: true }).waitFor();
    await page.evaluate(() => { const f = (window as any).fixture, owner = f.owner("zero-events"); f.append(owner, "terminal", { ok: true, eventCount: 0, traceOwner: owner }); });
    await page.getByText("调试完成", { exact: true }).waitFor();

    const feedCount = await page.evaluate(() => (window as any).fixture.feeds.length);
    await page.evaluate(() => { const f = (window as any).fixture; f.deferFiles = false;
      f.files.set("legacy.json", JSON.stringify({ version: 1, actionId: "same-action", ok: true, events: [{ kind: "info", message: "legacy readonly history" }] })); f.history(); });
    await page.getByRole("button", { name: "Thread H", exact: true }).click();
    await page.getByRole("button", { name: "legacy", exact: true }).click();
    await page.getByText("legacy readonly history", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => (window as any).fixture.feeds.length), feedCount);
    await page.evaluate(() => { const f = (window as any).fixture; f.append(f.owner("start-only", "H"), "start"); });
    await page.getByRole("button", { name: "start-only", exact: true }).click();
    await page.getByText("无持久化终态，原生结果未知", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => (window as any).fixture.feeds.length), feedCount);
    await page.evaluate(() => { const f = (window as any).fixture, owner = f.owner("start-only", "H"); f.append(owner, "terminal", { ok: true, eventCount: 0, traceOwner: owner }); });
    await page.getByText("调试完成", { exact: true }).waitFor();
    assert.equal(await page.getByText("无持久化终态，原生结果未知", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "关闭 trace 标签", exact: true }).click();
    await page.evaluate(() => { const f = (window as any).fixture, owner = f.owner("start-only", "H"); f.append(owner, "result", { ok: true, eventCount: 0, traceOwner: owner }); });
    await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    assert.equal(await page.evaluate(() => (window as any).fixture.tabs().some((tab: any) => tab.owner?.runId === "start-only")), false);
    await page.getByRole("button", { name: "Thread A", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.tabs().find((tab: any) => tab.owner?.runId === "run-D").status), "running");
    assert.equal(await page.evaluate(() => (window as any).fixture.tabs().find((tab: any) => tab.owner?.runId === "run-D").resultUnknown), undefined);
    assert.equal(await page.evaluate(() => (window as any).fixture.feeds.length), feedCount);
    assert.equal(await page.evaluate(() => (window as any).fixture.reads.find((r: any) => r.path === "C.json").cwd), "cwd-A");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
