import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

const fixture = `
import React,{StrictMode,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AgentConversationFrame} from '@/components/shell/AgentWorkbenchShell';
import {ToolResultPopup,useToolResultPopup} from '@/components/chat/ToolResultPopup';
import '@/app/globals.css';
const state=window.fixture={closeEvents:[],openers:{},renders:{},requests:[],frames:{}};
function Call({id}){
 const popup=useToolResultPopup();const[output,setOutput]=useState('initial '+id);
 useEffect(()=>{state.openers[id]=popup.openPopup;state.renders[id]=setOutput;});
 return <><button data-open={id} onClick={popup.openPopup}>Details {id}</button>
 <span data-output={id}>{output}</span>
 <ToolResultPopup open={popup.open} onClose={()=>{state.closeEvents.push(id);popup.closePopup()}}
 title={'Tool '+id} toolName="fixture_tool" input={{owner:id}} output={{ok:true,exitCode:0,data:{message:output}}}
 visualContent={<p data-popup-output={id}>{output}</p>}/></>;
}
function App(){const[active,setActive]=useState('a');const[chatVisible,setChatVisible]=useState(true);
 useEffect(()=>{Object.assign(state,{setActive,setChatVisible});});
 return <><input id="outside" aria-label="Outside" defaultValue="outside"/>
 {['a','b'].map(id=><section key={id} data-frame={id}>
 <AgentConversationFrame visible={active===id} chatVisible={chatVisible} frameRef={null} mainBodyRef={null} chatColumnRef={null}
 messages={<Call id={id}/>} composer={<textarea aria-label={'Draft '+id} defaultValue={'draft '+id}/>}
 dock={<aside data-dock={id}><input aria-label={'Dock '+id}/></aside>}/></section>)}</>;
}
createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);
`;

let compilation: ReturnType<typeof compile> | undefined;
async function compile() {
  const result = await build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "tool-popup-presentation.js", format: "iife", platform: "browser", jsx: "automatic",
    tsconfig: path.join(process.cwd(), "tsconfig.json"), define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" } });
  return { js: result.outputFiles.find(file => file.path.endsWith(".js"))!.text,
    css: result.outputFiles.find(file => file.path.endsWith(".css"))!.text };
}

async function ownedFixture() {
  const compiled = await (compilation ??= compile());
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 720 } });
    page.setDefaultTimeout(5_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/*", route => {
      if (route.request().url() === "http://fixture.test/" && route.request().isNavigationRequest()) {
        return route.fulfill({ contentType: "text/html", body: '<html data-theme="dark"><head><link rel="icon" href="data:,"></head><body style="overflow:auto"><div id="root"></div></body></html>' });
      }
      errors.push(`Unexpected network: ${route.request().url()}`); return route.abort();
    });
    await page.goto("http://fixture.test/");
    await page.addStyleTag({ content: compiled.css });
    await page.addScriptTag({ content: compiled.js });
    await page.waitForFunction(() => Boolean((window as any).fixture.setActive));
    return { browser, page, errors };
  } catch (error) { await browser.close(); throw error; }
}

test("a retained hidden conversation releases its tool portal and preserves the original draft and call", { timeout: 45_000 }, async (t) => {
  const { browser, page, errors } = await ownedFixture();
  try {
    await page.getByRole("textbox", { name: "Draft a", exact: true }).fill("retained draft");
    await page.evaluate(() => { (window as any).fixture.draftNode = document.querySelector('[aria-label="Draft a"]'); });
    await page.locator('[data-open="a"]').click();
    await page.getByRole("dialog", { name: "Tool a", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
    await page.evaluate(() => (window as any).fixture.setActive("b"));
    await page.waitForFunction(() => !document.querySelector('[data-frame="b"] .app-main')?.hasAttribute("aria-hidden"));
    assert.equal(await page.getByRole("dialog").count(), 0, "The old body portal must disappear when its owner hides");
    await page.waitForFunction(() => document.body.style.overflow === "auto");
    await page.evaluate(() => (window as any).fixture.renders.a("background update"));
    await page.waitForFunction(() => document.querySelector('[data-output="a"]')?.textContent === "background update");
    await page.getByRole("textbox", { name: "Draft b", exact: true }).focus();
    await page.keyboard.press("Escape");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.closeEvents), ["a"]);
    await page.locator('[data-open="b"]').click();
    await page.getByRole("dialog", { name: "Tool b", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.body.style.overflow === "auto");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.closeEvents), ["a", "b"]);
    await page.evaluate(() => (window as any).fixture.setActive("a"));
    await page.waitForFunction(() => !document.querySelector('[data-frame="a"] .app-main')?.hasAttribute("aria-hidden"));
    assert.equal(await page.getByRole("dialog").count(), 0, "Returning to a conversation must not reopen a hidden popup");
    assert.equal(await page.getByRole("textbox", { name: "Draft a", exact: true }).inputValue(), "retained draft");
    assert.equal(await page.evaluate(() => (window as any).fixture.draftNode === document.querySelector('[aria-label="Draft a"]')), true);
    assert.deepEqual(errors, []);
  } finally { if (errors.length) t.diagnostic(JSON.stringify(errors)); await browser.close(); }
});

test("workspace-only presentation closes the chat popup and rejects late opening without stealing dock focus", { timeout: 45_000 }, async (t) => {
  const { browser, page, errors } = await ownedFixture();
  try {
    await page.locator('[data-open="a"]').click();
    await page.getByRole("dialog", { name: "Tool a", exact: true }).waitFor();
    await page.evaluate(() => (window as any).fixture.setChatVisible(false));
    await page.waitForFunction(() => document.querySelector('[data-frame="a"] .app-main-chat-column')?.hasAttribute("hidden"));
    assert.equal(await page.getByRole("dialog").count(), 0, "A narrow workspace must not keep the chat body portal");
    await page.waitForFunction(() => document.body.style.overflow === "auto");
    await page.getByRole("textbox", { name: "Dock a", exact: true }).focus();
    await page.evaluate(() => (window as any).fixture.openers.a());
    await page.waitForFunction(() => (window as any).fixture.closeEvents.length === 2);
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Dock a");
    await page.evaluate(() => (window as any).fixture.setChatVisible(true));
    await page.waitForFunction(() => !document.querySelector('[data-frame="a"] .app-main-chat-column')?.hasAttribute("hidden"));
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page.locator('[data-open="a"]').click();
    await page.getByRole("dialog", { name: "Tool a", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.body.style.overflow === "auto");
    assert.deepEqual(errors, []);
  } finally { if (errors.length) t.diagnostic(JSON.stringify(errors)); await browser.close(); }
});
