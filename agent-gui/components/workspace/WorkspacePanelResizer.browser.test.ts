import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium, type Page } from "playwright";

const fixture = `
import React,{StrictMode,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WorkspacePanelResizer} from '@/components/workspace/WorkspacePanelResizer';
import '@/app/globals.css';
const state=window.fixture={calls:[],handlers:{}};
window.addEventListener('pointerdown',event=>{state.pointerId=event.pointerId},true);
const add=document.addEventListener;
document.addEventListener=function(type,listener,...rest){
 if(type==='pointermove'||type==='pointerup')state.handlers[type]=listener;
 return add.call(this,type,listener,...rest);
};
function App(){const[owner,setOwner]=useState('a'),[mounted,setMounted]=useState(true),[width,setWidth]=useState(600);
 useEffect(()=>{Object.assign(state,{setOwner,setMounted});});
 return <div className="app-main-body" style={{width:1200,height:140,display:'flex',position:'relative'}}>
 <div className="app-main-chat-column" style={{width,flexShrink:0}}>original chat</div>
 <aside className="workspace-explorer" style={{position:'relative',width:600,flexShrink:0}}>
 {mounted&&<WorkspacePanelResizer key={owner} chatColumnWidth={width} setChatColumnWidth={(next,container,persist)=>{
 state.calls.push({owner,width:next,container,persist});setWidth(next);
 }}/>}</aside></div>;
}
createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);
`;

async function ownedFixture() {
  const compiled = await build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "workspace-panel-resizer.js", format: "iife", platform: "browser", jsx: "automatic",
    tsconfig: path.join(process.cwd(), "tsconfig.json"), define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 720 } });
    page.setDefaultTimeout(5_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/*", route => {
      if (route.request().url() === "http://fixture.test/" && route.request().isNavigationRequest()) {
        return route.fulfill({ contentType: "text/html", body: '<html data-theme="dark"><head><link rel="icon" href="data:,"></head><body><div id="root"></div></body></html>' });
      }
      errors.push(`Unexpected network: ${route.request().url()}`); return route.abort();
    });
    await page.goto("http://fixture.test/");
    await page.addStyleTag({ content: compiled.outputFiles.find(file => file.path.endsWith(".css"))!.text });
    await page.addScriptTag({ content: compiled.outputFiles.find(file => file.path.endsWith(".js"))!.text });
    await page.waitForFunction(() => Boolean((window as any).fixture.setMounted));
    return { browser, page, errors };
  } catch (error) { await browser.close(); throw error; }
}

async function startDrag(page: Page, delta: number) {
  const box = await page.getByRole("separator", { name: "调整侧栏宽度" }).boundingBox();
  assert.ok(box);
  const x = box.x + box.width / 2, y = box.y + Math.min(box.height / 2, 30);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + delta, y);
  await page.waitForFunction(() => (window as any).fixture.calls.length > 0);
}

test("retiring a workspace resize owner releases global drag state and rejects its late callbacks", { timeout: 45_000 }, async (t) => {
  const { browser, page, errors } = await ownedFixture();
  try {
    await startDrag(page, 40);
    await page.evaluate(() => { const s=(window as any).fixture; s.retired={...s.handlers,pointerId:s.pointerId}; s.setMounted(false); });
    await page.waitForFunction(() => !document.querySelector('[role="separator"]'));
    assert.equal(await page.evaluate(() => document.body.classList.contains("workspace-explorer-resizing")), false);
    const before = await page.evaluate(() => (window as any).fixture.calls.length);
    await page.evaluate(() => {
      const s=(window as any).fixture;
      document.dispatchEvent(new PointerEvent('pointermove',{clientX:1000,pointerId:s.retired.pointerId}));
      document.dispatchEvent(new PointerEvent('pointerup',{pointerId:s.retired.pointerId}));
      s.retired.pointermove(new PointerEvent('pointermove',{clientX:1100,pointerId:s.retired.pointerId}));
      s.retired.pointerup(new PointerEvent('pointerup',{pointerId:s.retired.pointerId}));
    });
    assert.equal(await page.evaluate(() => (window as any).fixture.calls.length), before);
    assert.equal(await page.evaluate(() => localStorage.getItem('agent-gui-chat-column-width')), null);
    await page.mouse.up();
    await page.evaluate(() => { const s=(window as any).fixture; s.setOwner('b'); s.setMounted(true); document.documentElement.dataset.theme='light'; });
    await page.getByRole("separator", { name: "调整侧栏宽度" }).waitFor();
    await startDrag(page, 30);
    await page.evaluate(() => { const s=(window as any).fixture; s.retired.pointerup(new PointerEvent('pointerup',{pointerId:s.retired.pointerId})); });
    assert.equal(await page.evaluate(() => document.body.classList.contains('workspace-explorer-resizing')), true);
    await page.mouse.up();
    assert.equal(await page.evaluate(() => document.body.classList.contains('workspace-explorer-resizing')), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('agent-gui-chat-column-width')), '670');
    assert.equal(await page.evaluate(() => (window as any).fixture.calls.at(-1).owner), 'b');
    assert.deepEqual(errors, []);
  } finally { if (errors.length) t.diagnostic(JSON.stringify(errors)); await browser.close(); }
});

test("pointer cancellation ends a resize without persisting and a later drag still commits", { timeout: 45_000 }, async (t) => {
  const { browser, page, errors } = await ownedFixture();
  try {
    await startDrag(page, 25);
    const before = await page.evaluate(() => (window as any).fixture.calls.length);
    await page.evaluate(() => {
      const pointerId=(window as any).fixture.pointerId+1;
      document.dispatchEvent(new PointerEvent('pointermove',{pointerId,clientX:1100}));
      document.dispatchEvent(new PointerEvent('pointerup',{pointerId}));
      document.dispatchEvent(new PointerEvent('pointercancel',{pointerId}));
    });
    assert.equal(await page.evaluate(() => (window as any).fixture.calls.length), before);
    assert.equal(await page.evaluate(() => document.body.classList.contains('workspace-explorer-resizing')), true);
    await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel',{pointerId:(window as any).fixture.pointerId})));
    assert.equal(await page.evaluate(() => document.body.classList.contains('workspace-explorer-resizing')), false);
    const count = await page.evaluate(() => (window as any).fixture.calls.length);
    await page.mouse.move(900, 30); await page.mouse.up();
    assert.equal(await page.evaluate(() => (window as any).fixture.calls.length), count);
    assert.equal(await page.evaluate(() => localStorage.getItem('agent-gui-chat-column-width')), null);
    await startDrag(page, 15); await page.mouse.up();
    assert.equal(await page.evaluate(() => localStorage.getItem('agent-gui-chat-column-width')), '640');
    assert.deepEqual(errors, []);
  } finally { if (errors.length) t.diagnostic(JSON.stringify(errors)); await browser.close(); }
});

test("a retained resize bar becoming hidden retires its drag before another pointer event", { timeout: 45_000 }, async (t) => {
  const { browser, page, errors } = await ownedFixture();
  try {
    await startDrag(page, 20);
    const count = await page.evaluate(() => (window as any).fixture.calls.length);
    await page.evaluate(() => { document.querySelector<HTMLElement>('[role="separator"]')!.style.display='none'; });
    await page.waitForFunction(() => !document.body.classList.contains('workspace-explorer-resizing'));
    await page.mouse.move(1000, 30); await page.mouse.up();
    assert.equal(await page.evaluate(() => (window as any).fixture.calls.length), count);
    assert.equal(await page.evaluate(() => localStorage.getItem('agent-gui-chat-column-width')), null);
    assert.deepEqual(errors, []);
  } finally { if (errors.length) t.diagnostic(JSON.stringify(errors)); await browser.close(); }
});
