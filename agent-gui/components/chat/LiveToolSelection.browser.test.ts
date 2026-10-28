import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

const fixture = `
import React,{StrictMode,useLayoutEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useAgentChatSession} from '@/components/chat/useAgentChatSession';
import {createProgramStepTag,formatProgramStepTagMarkup} from '@/lib/program-step-tag';
const threadId='owned-live-selection',initialCwd='D:/owned-live-selection';
const tag=createProgramStepTag({tagId:'owned-live-chip',programTarget:'action',programId:'11111111-1111-4111-8111-111111111111',
 dataJsonPath:'.quicker/actions/fixture/data.json',nodePath:'0',stepRunnerKey:'sys:fixture',content:'{}',startLine:1,endLine:1,designerStepId:'owned-step'});
const state=window.fixture={captures:[],executions:[],revocations:[],sendErrors:[],manual:0};
const registry={register:()=>()=>{},pin:()=>{throw Error('The fixture supplies a private pin explicitly')},
 captureForManualSend:input=>{state.captures.push(input);return {state:'ready',scope:{version:1,scopeId:'scope-'+input.userMessageId,
 threadId,userMessageId:input.userMessageId,cwd:input.cwd,mode:input.mode,target:{owner:{key:'owned-document',instanceId:1,cwd:initialCwd,
 tabId:'owned-tab',path:tag.dataJsonPath},sessionId:'owned-session',identity:{documentKey:'owned-document',projectBinding:null}}}}},
 execute:()=>{state.executions.push('unexpected');throw Error('No live edit/read belongs to this selection fixture')},
 executeAsync:()=>{state.executions.push('unexpected');throw Error('No live edit/read belongs to this selection fixture')},
 revokeScope:id=>state.revocations.push(id),dispose:()=>{}};
function App(){const[options,setOptions]=useState({chatMode:'ask',enabledTools:['Write'],workingDirectory:initialCwd});
 const session=useAgentChatSession({threadId,initialMessages:[],ephemeral:true,visible:true,titleManual:true,llmSelection:'fixture',
 onPersist:()=>{throw Error('Ephemeral fixture must not persist')},...options});
 useLayoutEffect(()=>session.registerLiveProgramDocumentRegistry(registry),[session.registerLiveProgramDocumentRegistry]);
 useLayoutEffect(()=>{Object.assign(state,{setOptions,options,session,status:session.status,error:session.error?.message});
 state.sendManual=()=>{state.manual++;session.rememberLiveProgramDocumentPin(tag.tagId,{pinId:'private-'+state.manual,tagId:tag.tagId,threadId});
 return session.sendMessageSafe({text:'Explain '+formatProgramStepTagMarkup(tag)}).catch(error=>state.sendErrors.push(error.message));};});
 return <output>{session.status}</output>;
}
const root=createRoot(document.getElementById('root'));state.unmount=()=>root.unmount();root.render(<StrictMode><App/></StrictMode>);
`;

test("the production session freezes raw live tool selection and reuses it for automatic SDK continuation", { timeout: 45_000 }, async () => {
  const leaves: Record<string, string> = {
    "@/lib/chat-store": "export const flushPendingChatStoreSaveAsync=async()=>{};",
    "@/lib/use-chat-store": "export const isChatStoreHydrated=()=>false;",
    "@/lib/chat-message-edit-branch": "export const replaceChatMessagesIfCurrent=()=>{throw Error('Branch mutation prohibited')};",
  };
  const compiled = await build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", metafile: true,
    tsconfig: path.join(process.cwd(), "tsconfig.json"), define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
    plugins: [{ name: "owned-session-storage-ports", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(leaves, args.path) ? { path: args.path, namespace: "owned-storage" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "owned-storage" }, args => ({ contents: leaves[args.path]!, loader: "js" }));
    } }],
  });
  const inputs = Object.keys(compiled.metafile!.inputs).map(file => file.replaceAll("\\", "/"));
  for (const actual of ["components/chat/useAgentChatSession.ts", "lib/agent-chat-transport.ts", "lib/live-program-document-turn.ts"])
    assert.ok(inputs.some(file => file.endsWith(actual)), `The production ${actual} must execute`);
  assert.ok(!inputs.some(file => /(?:^|\/)lib\/(?:db\/|llm(?:[./-])|qkrpc\.ts$)/.test(file)), "No ambient resource adapters belong to this browser fixture");
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage(); page.setDefaultTimeout(5_000);
    const requests: any[] = [], errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin === "http://localhost" && url.pathname === "/") {
        return route.fulfill({ contentType: "text/html", body: '<link rel="icon" href="data:,"><div id="root"></div>' });
      }
      if (url.origin !== "http://localhost" || url.pathname !== "/api/chat") {
        errors.push(`Unexpected request: ${route.request().url()}`); return route.abort();
      }
      requests.push(route.request().postDataJSON());
      const index = requests.length;
      if (index > 4) {
        errors.push("The fixture received an unexpected extra automatic continuation");
        return route.abort();
      }
      const events = index === 3
        ? [{ type: "start", messageId: "owned-question" }, { type: "start-step" },
          { type: "tool-input-available", toolCallId: "owned-question-call", toolName: "ask_question", input: { question: "Fixture?" } },
          { type: "finish-step" }, { type: "finish", finishReason: "tool-calls" }]
        : [{ type: "start", messageId: index === 4 ? "owned-question" : "owned-response-" + index },
          { type: "start-step" }, { type: "text-start", id: "answer" },
          { type: "text-delta", id: "answer", delta: "Owned reply" }, { type: "text-end", id: "answer" },
          { type: "finish-step" }, { type: "finish", finishReason: "stop" }];
      await route.fulfill({ headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
        body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n" });
    });
    await page.goto("http://localhost/");
    await page.addScriptTag({ content: compiled.outputFiles[0]!.text });
    await page.waitForFunction(() => Boolean((window as any).fixture.sendManual));
    await page.evaluate(() => (window as any).fixture.sendManual());
    await page.waitForFunction(() => (window as any).fixture.status === "ready");
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].enabledTools, ["Write"], "The real manual-send hook must not replace raw choices with the mode-filtered empty list");
    assert.equal(requests[0].chatMode, "ask"); assert.equal(requests[0].liveProgramDocument.state, "ready");
    assert.equal(requests[0].liveProgramDocument.scope.mode, "read");

    await page.evaluate(() => (window as any).fixture.setOptions({ chatMode: "ask", enabledTools: [], workingDirectory: "D:/owned-live-selection" }));
    await page.waitForFunction(() => (window as any).fixture.options.enabledTools.length === 0);
    await page.evaluate(() => (window as any).fixture.sendManual());
    await page.waitForFunction(() => (window as any).fixture.status === "ready");
    assert.equal(requests.length, 2); assert.deepEqual(requests[1].enabledTools, []);

    await page.evaluate(() => (window as any).fixture.setOptions({ chatMode: "agent", enabledTools: ["workspace_program", "ask_question"], workingDirectory: "D:/owned-live-selection" }));
    await page.waitForFunction(() => (window as any).fixture.options.chatMode === "agent");
    await page.evaluate(() => (window as any).fixture.sendManual());
    await page.waitForFunction(() => (window as any).fixture.status === "ready");
    assert.equal(requests.length, 3);
    await page.evaluate(() => (window as any).fixture.setOptions({ chatMode: "ask", enabledTools: [], workingDirectory: "D:/different-visible-workspace" }));
    await page.waitForFunction(() => (window as any).fixture.options.workingDirectory === "D:/different-visible-workspace");
    await page.evaluate(() => (window as any).fixture.session.addToolOutput({ tool: "ask_question", toolCallId: "owned-question-call", output: { answer: "fixture" } }));
    try {
      await page.waitForFunction(() => (window as any).fixture.status === "ready" && (window as any).fixture.session.messages.some((message: any) => message.parts.some((part: any) => part.type === "text" && part.text === "Owned reply")));
    } catch (cause) {
      const sdk = await page.evaluate(() => ({ status: (window as any).fixture.status, error: (window as any).fixture.error,
        lastMessage: (window as any).fixture.session.messages.at(-1), sendErrors: (window as any).fixture.sendErrors }));
      const wire = requests.slice(0, 5).map(request => ({ enabledTools: request.enabledTools, chatMode: request.chatMode, workingDirectory: request.workingDirectory }));
      throw new Error(`Automatic continuation failed: ${JSON.stringify({ sdk, errors, wire }).slice(0, 8000)}`, { cause });
    }
    assert.equal(requests.length, 4, "The client answer must produce exactly one real SDK automatic continuation");
    for (const request of requests.slice(2)) {
      assert.deepEqual(request.enabledTools, ["workspace_program", "ask_question"]);
      assert.equal(request.chatMode, "agent"); assert.equal(request.workingDirectory, "D:/owned-live-selection");
      assert.deepEqual(request.liveProgramDocument, requests[2].liveProgramDocument);
    }
    const facts = await page.evaluate(() => ({ captures: (window as any).fixture.captures, executions: (window as any).fixture.executions,
      sendErrors: (window as any).fixture.sendErrors, error: (window as any).fixture.error }));
    assert.equal(facts.captures.length, 3); assert.deepEqual(facts.executions, []); assert.deepEqual(facts.sendErrors, []); assert.equal(facts.error, undefined);
    assert.deepEqual(errors, []);
    await page.evaluate(() => (window as any).fixture.unmount());
  } finally { await browser.close(); }
});
