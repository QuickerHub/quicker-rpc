import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

const fixture = `
import React,{StrictMode,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ToolSelector} from '@/components/chat/ToolSelector';
import {createAgentChatTransport} from '@/lib/agent-chat-transport';
import {defaultEnabledToolIds} from '@/lib/tool-registry';
import '@/app/globals.css';
const state=window.fixture={requests:[]};
const refs={threadId:'owned-picker',chatMode:{current:'agent'},enabledTools:{current:[]},llmSelection:{current:'fixture'},
 workingDirectory:{current:'fixture'},titleManual:{current:true},designerEmbedScoped:{current:false},actionDesigner:{current:undefined}};
globalThis.fetch=async(url,options)=>{if(url!=='/api/chat')throw Error('Unexpected fixture request '+url);
 state.requests.push(JSON.parse(options.body));return new Response('data: {"type":"start","messageId":"fixture"}\\n\\ndata: {"type":"finish"}\\n\\ndata: [DONE]\\n\\n',
 {headers:{'content-type':'text/event-stream','x-vercel-ai-ui-message-stream':'v1'}});};
const transport=createAgentChatTransport(refs);
function App(){const[mode,setMode]=useState('agent'),[ids,setIds]=useState(defaultEnabledToolIds);
 refs.chatMode.current=mode;refs.enabledTools.current=ids;
 useEffect(()=>{Object.assign(state,{setMode,ids});});
 async function send(){const stream=await transport.sendMessages({trigger:'submit-message',chatId:'owned-picker',
 messages:[{id:'u',role:'user',parts:[{type:'text',text:'fixture only'}]}],abortSignal:undefined});
 const reader=stream.getReader();while(!(await reader.read()).done){}reader.releaseLock();}
 return <div className="composer-toolbar" style={{position:'absolute',bottom:12,left:80}}><ToolSelector chatMode={mode} enabledTools={ids} onChange={setIds}/><button onClick={send}>Capture request</button></div>;
}
createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);
`;

for (const mode of ["agent", "ask", "launcher"] as const) {
  test(`${mode}: the real picker can disable every tool and the SDK transport sends the empty selection`, { timeout: 45_000 }, async () => {
    const compiled = await build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() },
      bundle: true, write: false, outfile: "tool-selector.js", format: "iife", platform: "browser", jsx: "automatic",
      tsconfig: path.join(process.cwd(), "tsconfig.json"), define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" } });
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: mode === "ask" ? 420 : 900, height: 700 } });
      page.setDefaultTimeout(5_000);
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await page.route("**/*", route => route.request().url() === "http://fixture.test/" && route.request().isNavigationRequest()
        ? route.fulfill({ contentType: "text/html", body: '<html data-theme="dark"><head><link rel="icon" href="data:,"></head><body><div id="root"></div></body></html>' })
        : (errors.push(`Unexpected network: ${route.request().url()}`), route.abort()));
      await page.goto("http://fixture.test/");
      await page.addStyleTag({ content: compiled.outputFiles.find(file => file.path.endsWith(".css"))!.text });
      await page.addScriptTag({ content: compiled.outputFiles.find(file => file.path.endsWith(".js"))!.text });
      await page.waitForFunction(() => Boolean((window as any).fixture.setMode));
      await page.evaluate(mode => (window as any).fixture.setMode(mode), mode);
      await page.getByRole("button", { name: /^工具/ }).click();
      const box = await page.getByRole("dialog", { name: "工具选择" }).evaluate(element => {
        const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, width: innerWidth };
      });
      assert.ok(box.left >= 0 && box.right <= box.width, "An offset trigger must keep the whole menu inside the narrow viewport");
      if (mode === "ask") {
        assert.equal(await page.locator('.tool-selector-group--write').count(), 0);
        assert.ok((await page.getByRole("dialog", { name: "工具选择" }).innerText()).includes("读取动作"));
        assert.ok((await page.getByRole("dialog", { name: "工具选择" }).innerText()).includes("读取工作区程序"));
      }
      const heads = page.locator(".tool-selector-group-head button");
      for (let index = 0; index < await heads.count(); index++) {
        if (await heads.nth(index).innerText() === "全关") await heads.nth(index).click();
      }
      assert.deepEqual(await page.evaluate(() => (window as any).fixture.ids), [], "Hidden support IDs cannot keep the selection nonempty");
      assert.equal(await page.locator(".tool-selector-count").innerText(), "0");
      await page.getByRole("button", { name: "Capture request" }).click();
      await page.waitForFunction(() => (window as any).fixture.requests.length === 1);
      const request = await page.evaluate(() => (window as any).fixture.requests[0]);
      assert.equal(request.chatMode, mode); assert.deepEqual(request.enabledTools, []);
      // Re-enabling a single visible tool must not silently restore unchecked entries.
      await page.getByRole("button", { name: /^工具/ }).click();
      await page.locator('.tool-selector-checkbox').first().check();
      assert.equal(await page.locator('.tool-selector-checkbox:checked').count(), 1);
      await page.getByRole("button", { name: "Capture request" }).click();
      await page.waitForFunction(() => (window as any).fixture.requests.length === 2);
      const enabled = await page.evaluate(() => (window as any).fixture.requests[1].enabledTools);
      assert.deepEqual(enabled, ["docs"]);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}
