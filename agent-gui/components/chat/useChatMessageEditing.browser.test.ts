import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

// Real React owners and production controller; only the SDK/composer/confirmation ports are fake.
// No service, storage, model, native dialog or host is contacted.
const fixture = `
import React, { StrictMode, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useChat } from '@ai-sdk/react';
import { useChatMessageEditing } from '@/components/chat/useChatMessageEditing';
import { replaceChatMessagesIfCurrent } from '@/lib/chat-message-edit-branch';
import { AppConfirmHost } from '@/components/AppConfirmHost';
window.fixture = { panels:{}, calls:[], confirmations:[], pending:{} };
const initial = id => [{id:id+'-u1',role:'user',parts:[{type:'text',text:'first '+id}]},
 {id:id+'-a1',role:'assistant',parts:[{type:'text',text:'answer'}]},
 {id:id+'-u2',role:'user',parts:[{type:'text',text:'second '+id}]},
 {id:id+'-a2',role:'assistant',parts:[{type:'text',text:'answer'}]}];
function Panel({id,visible,native}) {
 const {messages,setMessages:updateMessages} = useChat({id,messages:initial(id),experimental_throttle:100,
   transport:{sendMessages:()=>{throw Error('No model request is permitted')},reconnectToStream:async()=>null}});
 const input = useRef(null);
 const composerRef = useRef(null);
 composerRef.current = useMemo(()=>({getValue:()=>input.current?.value??'',setValue:value=>{input.current.value=value},clear:()=>{input.current.value=''}}),[]);
 const controller = useChatMessageEditing({threadId:id,visible,messages,composerRef,
   replaceMessagesIfCurrent:(expected,next)=>{
     const replaced=replaceChatMessagesIfCurrent(updateMessages,expected,next);
     if(replaced)window.fixture.calls.push({id,kind:'setMessages',ids:next.map(m=>m.id)});
     return replaced;
   },
   enqueueOrSend:text=>window.fixture.calls.push({id,kind:'enqueue',text}),
   clearError:()=>{},focusComposerAtEnd:()=>input.current.focus(),pinToStream:()=>{},
   confirmBranch:native?undefined:removedCount=>new Promise(resolve=>window.fixture.confirmations.push({id,removedCount,resolve}))});
 useLayoutEffect(()=>{window.fixture.panels[id]={controller,messages,
   start:()=>{window.fixture.pending[id]=controller.commitBranchMessageEdit()},
   append:()=>updateMessages(previous=>[...previous,{id:id+'-late',role:'assistant',parts:[{type:'text',text:'late SDK result'}]}])};});
 return <section data-panel={id} hidden={!visible}>
   {messages.filter(m=>m.role==='user').map(message=><button key={message.id} data-edit={message.id} onClick={()=>controller.beginEditFromUserMessage(message)}>{message.id}</button>)}
   <div className="composer-box"><input ref={input} onChange={event=>controller.setEditAnchorLiveDraft(event.target.value)}/></div>
   <button data-exit onClick={controller.exitMessageEdit}>exit</button><div data-outside>outside {id}</div>
   <output data-anchor>{controller.editAnchorMessageId??''}</output><output data-live>{controller.editAnchorLiveDraft}</output>
 </section>;
}
function App(){const[active,setActive]=useState('a');const[mountA,setMountA]=useState(true);const[native,setNative]=useState(false);
 useLayoutEffect(()=>{window.fixture.setActive=setActive;window.fixture.mountA=setMountA;window.fixture.setNative=setNative},[]);
 return <>{mountA&&<Panel id="a" visible={active==='a'} native={native}/>}<Panel id="b" visible={active==='b'} native={native}/><AppConfirmHost/></>}
createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);
`;

test("mounted session editing owners retain hidden drafts and reject stale branch confirmations", { timeout: 45_000 }, async () => {
  const compiled = await build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
    tsconfig: path.join(process.cwd(), "tsconfig.json"), define: { "process.env.NODE_ENV": '"development"' } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => route.abort());
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: compiled.outputFiles[0]!.text });
    await page.waitForFunction(() => Boolean((window as any).fixture?.panels.b));
    const panel = (id: string) => page.locator(`[data-panel="${id}"]`);
    const activate = async (id: string) => {
      await page.evaluate((value) => (window as any).fixture.setActive(value), id);
      await page.waitForFunction((value) => !document.querySelector<HTMLElement>(`[data-panel="${value}"]`)!.hidden, id);
    };
    const start = async (id = "a") => {
      const count = await page.evaluate(() => (window as any).fixture.confirmations.length);
      await page.evaluate((value) => (window as any).fixture.panels[value].start(), id);
      await page.waitForFunction((previous) => (window as any).fixture.confirmations.length === previous + 1, count);
      return count;
    };
    const resolve = async (index: number, approved = true, id = "a") => page.evaluate(async ({ index, approved, id }) => {
      const f = (window as any).fixture; f.confirmations[index].resolve(approved); return await f.pending[id];
    }, { index, approved, id });

    await panel("a").locator('[data-edit="a-u2"]').click();
    await panel("a").locator("input").fill("draft A");
    await activate("b");
    await panel("b").locator('[data-edit="b-u1"]').click();
    await panel("b").locator("input").fill("draft B");
    await page.keyboard.press("Escape");
    assert.equal(await panel("b").locator("[data-anchor]").textContent(), "");
    assert.equal(await panel("a").locator("input").inputValue(), "draft A");
    assert.equal(await panel("a").locator("[data-anchor]").textContent(), "a-u2");
    await panel("b").locator("[data-outside]").click();
    assert.equal(await panel("a").locator("[data-anchor]").textContent(), "a-u2", "foreground pointer must not exit the hidden owner");
    await activate("a");
    await panel("a").locator("[data-outside]").click();
    assert.equal(await panel("a").locator("[data-anchor]").textContent(), "");
    await panel("a").locator('[data-edit="a-u2"]').click();
    assert.equal(await panel("a").locator("input").inputValue(), "draft A", "existing per-message drafts survive exit and reopen");

    const hidden = await start();
    await activate("b"); await activate("a");
    assert.equal(await resolve(hidden), false, "returning to the same session must not revive an old confirmation");
    const changed = await start();
    await panel("a").locator("input").fill("new draft A");
    assert.equal(await resolve(changed), false);
    const sdkRevision = await start();
    await page.evaluate(() => (window as any).fixture.panels.a.append());
    await page.waitForFunction(() => (window as any).fixture.panels.a.messages.length === 5);
    assert.equal(await resolve(sdkRevision), false, "a late SDK result must not be cut off using an older revision");
    const unrendered = await start();
    const unrenderedResult = await page.evaluate(async (index) => {
      const f = (window as any).fixture;
      f.panels.a.append();
      f.confirmations[index].resolve(true);
      return await f.pending.a;
    }, unrendered);
    assert.equal(unrenderedResult, false, "the authoritative SDK store can advance before its throttled React snapshot");
    await page.waitForFunction(() => (window as any).fixture.panels.a.messages.length === 6);
    const cancelled = await start();
    assert.equal(await resolve(cancelled, false), false);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.calls), []);
    assert.equal(await panel("a").locator("input").inputValue(), "new draft A");
    assert.equal(await panel("a").locator("[data-anchor]").textContent(), "a-u2");

    const accepted = await start();
    await page.evaluate(() => (window as any).fixture.panels.a.start());
    assert.equal(await page.evaluate(() => (window as any).fixture.confirmations.length), accepted + 1, "double submit must share the in-flight confirmation");
    // The second call returns false and must not replace the actual pending promise in the fixture.
    await page.evaluate((index) => (window as any).fixture.confirmations[index].resolve(true), accepted);
    await page.waitForFunction(() => (window as any).fixture.calls.length === 2);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.calls), [
      { id: "a", kind: "setMessages", ids: ["a-u1", "a-a1"] }, { id: "a", kind: "enqueue", text: "new draft A" },
    ]);
    assert.equal(await panel("a").locator("input").inputValue(), "");
    assert.equal(await panel("b").locator('[data-edit="b-u1"]').count(), 1);

    await panel("a").locator('[data-edit="a-u1"]').click();
    await panel("a").locator("input").fill("closed owner");
    const closed = await start();
    await page.evaluate(() => (window as any).fixture.mountA(false));
    await page.waitForSelector('[data-panel="a"]', { state: "detached" });
    assert.equal(await resolve(closed), false);
    assert.equal(await page.evaluate(() => (window as any).fixture.calls.length), 2, "disposed owner must not send or truncate");

    // The real modal is a portal outside the composer. Its pointer/Escape must not discard the draft.
    await page.evaluate(() => { const f = (window as any).fixture; f.setNative(true); f.mountA(true); });
    await page.waitForSelector('[data-panel="a"]');
    await panel("a").locator('[data-edit="a-u2"]').click();
    await panel("a").locator("input").fill("real modal draft");
    await page.evaluate(() => (window as any).fixture.panels.a.start());
    await page.getByRole("alertdialog").waitFor();
    await page.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.pending.a), false);
    assert.equal(await panel("a").locator("input").inputValue(), "real modal draft");
    assert.equal(await panel("a").locator("[data-anchor]").textContent(), "a-u2");
    await page.evaluate(() => (window as any).fixture.panels.a.start());
    await page.getByRole("alertdialog").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => (window as any).fixture.pending.a), false);
    assert.equal(await panel("a").locator("input").inputValue(), "real modal draft");
    await page.evaluate(() => (window as any).fixture.panels.a.start());
    await page.getByRole("alertdialog").waitFor();
    await page.getByRole("button", { name: "确定", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.pending.a), true);
    assert.deepEqual((await page.evaluate(() => (window as any).fixture.calls)).slice(2), [
      { id: "a", kind: "setMessages", ids: ["a-u1", "a-a1"] }, { id: "a", kind: "enqueue", text: "real modal draft" },
    ]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
