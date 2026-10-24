import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

const fixture = `
import React,{StrictMode,useRef,useState}from'react';import{createRoot}from'react-dom/client';
import{useMessagesStickScroll}from'@/lib/use-messages-stick-scroll';
const frames=new Map();let next=0;window.requestAnimationFrame=cb=>{frames.set(++next,cb);return next};window.cancelAnimationFrame=id=>frames.delete(id);
const state=window.fixture={listeners:new Set(),flush(){const pending=[...frames];frames.clear();for(const[,cb]of pending)cb(0)},pending:()=>frames.size};
function App(){const[visible,setVisible]=useState(true),[revision,setRevision]=useState(0),ref=useRef(null),turn=useRef(null);
 const api=useMessagesStickScroll(ref,{visible,threadId:'fixture-thread',revision:String(revision),turnRef:turn});
 state.visible=setVisible;state.bump=()=>setRevision(v=>v+1);state.api=api;
 return <div id='scroll' data-visible={String(visible)} data-revision={revision} ref={element=>{
 ref.current=element;if(element&&!element.instrumented){element.instrumented=true;const add=element.addEventListener.bind(element),remove=element.removeEventListener.bind(element);
 element.addEventListener=(type,cb,...rest)=>{if(type==='scroll')state.listeners.add(cb);add(type,cb,...rest)};
 element.removeEventListener=(type,cb,...rest)=>{if(type==='scroll')state.listeners.delete(cb);remove(type,cb,...rest)};}}}
 style={{height:120,width:300,overflow:'auto'}}><div style={{height:600}}/><div ref={turn}><div className='msg-turn__prompt'>Prompt</div></div><div style={{height:600}}/></div>;
}const root=createRoot(document.getElementById('root'));root.render(<StrictMode><App/></StrictMode>);state.dispose=()=>root.unmount();
`;

test("retired chat frames cannot attach listeners or scroll, including nested prompt frames", { timeout: 30_000 }, async () => {
  const compiled = await build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
    tsconfig: path.join(process.cwd(), "tsconfig.json"), define: { "process.env.NODE_ENV": '"development"' } });
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
  try {
    const page = await browser.newPage(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => route.abort());
    await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: compiled.outputFiles[0].text });
    await page.locator('#scroll[data-visible="true"]').waitFor();
    await page.waitForFunction(() => (window as any).fixture.pending() > 0);
    const flush = () => page.evaluate(() => (window as any).fixture.flush());
    const hide = async () => { await page.evaluate(() => (window as any).fixture.visible(false)); await page.locator('#scroll[data-visible="false"]').waitFor(); };
    const show = async () => { await page.evaluate(() => (window as any).fixture.visible(true)); await page.locator('#scroll[data-visible="true"]').waitFor(); for (let i = 0; i < 3; i++) await flush(); };

    await flush(); await hide(); await flush(); await flush();
    assert.equal(await page.evaluate(() => (window as any).fixture.listeners.size), 0,
      "hide between the outer and inner attach frame must leave no listener");

    await show();
    assert.equal(await page.evaluate(() => (window as any).fixture.listeners.size), 1, "StrictMode leaves one current listener");
    await page.evaluate(() => (window as any).fixture.api.pinToBottom()); await hide();
    await page.evaluate(() => { document.getElementById("scroll")!.scrollTop = 23; }); await flush();
    assert.equal(await page.locator("#scroll").evaluate((element) => element.scrollTop), 23, "a queued manual pin belongs to the retired owner");

    await show();
    await page.evaluate(() => { const s=(window as any).fixture;s.api.pinToLastTurnPrompt();s.bump(); });
    await page.locator('#scroll[data-revision="1"]').waitFor(); await flush(); await hide();
    await page.evaluate(() => { document.getElementById("scroll")!.scrollTop = 31; }); await flush();
    assert.equal(await page.locator("#scroll").evaluate((element) => element.scrollTop), 31, "hidden nested prompt frame cannot move the scrollport");

    await show();
    await page.evaluate(() => { const s=(window as any).fixture;s.api.pinToLastTurnPrompt();s.bump(); });
    await page.locator('#scroll[data-revision="2"]').waitFor(); await flush();
    await page.evaluate(() => (window as any).fixture.bump()); await page.locator('#scroll[data-revision="3"]').waitFor();
    await page.evaluate(() => { document.getElementById("scroll")!.scrollTop = 37; }); await flush();
    assert.equal(await page.locator("#scroll").evaluate((element) => element.scrollTop), 37, "a newer layout cancels the previous prompt's second frame");

    await page.evaluate(() => (window as any).fixture.dispose()); await flush();
    assert.equal(await page.evaluate(() => (window as any).fixture.listeners.size), 0);
    assert.equal(await page.evaluate(() => (window as any).fixture.pending()), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
