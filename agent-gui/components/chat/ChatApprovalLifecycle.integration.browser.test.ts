import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

const fixture = `
import React,{StrictMode,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ChatPanel} from '@/components/chat/Chat';
import {LauncherTranscript} from '@/components/launcher/LauncherTranscript';
import {startEphemeralLauncherRun} from '@/lib/launcher/launcher-session';
import {subscribeLauncherBridge} from '@/lib/launcher/launcher-bridge';
import {dispatchLauncherApprovalResponse} from '@/lib/launcher/launcher-action-dispatch';
const state=window.fixture={sessions:{},dispatches:0,latest:null};
const threadId=startEphemeralLauncherRun('approval-session');state.threadId=threadId;
const initial=[{id:'user',role:'user',parts:[{type:'text',text:'two approval rounds'}]},
 {id:'assistant-a',role:'assistant',parts:[{type:'tool-shell_exec',toolCallId:'call-a',state:'approval-requested',input:{command:'echo approval A'},approval:{id:'approval-a'}}]}];
const peerInitial=[{id:'peer-user',role:'user',parts:[{type:'text',text:'independent peer'}]},
 {id:'peer-assistant',role:'assistant',parts:['one','two'].map(id=>({type:'tool-shell_exec',toolCallId:'peer-call-'+id,state:'approval-requested',input:{command:'echo peer '+id},approval:{id:'peer-'+id}}))}];
state.peerInitial=peerInitial;
const noop=()=>{};
function App(){const[view,setView]=useState(null);const[mounted,setMounted]=useState(true);
 useEffect(()=>{state.showLatest=()=>setView(state.latest);state.unmountSession=()=>setMounted(false);
 return subscribeLauncherBridge(message=>{
  if(message.type==='agent:session-sync'){state.latest=message;setView(previous=>previous??message);}
  if(message.type==='launcher:approval-respond'){
   dispatchLauncherApprovalResponse(message.sessionId,message.approved,message);state.dispatches++;
  }
 });},[]);
 return <>{mounted&&<section data-panel="runtime"><ChatPanel threadId={threadId} initialMessages={initial}
 workingDirectory="" visible={false} ephemeral threadTitle="fixture" threadUpdatedAt={1} titleGenerated titleManual
 ping={{ok:false}} connectTick={0} settingsOpen={false} onToggleSettings={noop} onOpenSettings={noop}
 onPersist={noop} onAutoTitle={noop} designerEmbed/>
 <ChatPanel threadId="peer" initialMessages={peerInitial} workingDirectory="" visible ephemeral
 threadTitle="peer" threadUpdatedAt={1} titleGenerated titleManual ping={{ok:false}} connectTick={0}
 settingsOpen={false} onToggleSettings={noop} onOpenSettings={noop} onPersist={noop} onAutoTitle={noop} designerEmbed/></section>}
 {view&&<section data-panel="launcher"><LauncherTranscript {...view} workingDirectory=""/></section>}</>;
}
createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);
`;

test("Launcher decisions stay with the displayed approval through real ChatPanel, hook and SDK", { timeout: 45_000 }, async () => {
  // Only unrelated UI leaves are replaced; the approval and SDK chain is real.
  const shell = "const noop=()=>{}; const shell={panelOpen:false,chatColumnWidth:null,setChatColumnWidth:noop}; export const useWorkspaceExplorerShell=()=>shell; export const useOptionalWorkspaceExplorerShell=()=>shell; export const WorkspaceExplorerShellProvider=({children})=>children; export const WorkspaceExplorerPanelProvider=WorkspaceExplorerShellProvider; export const WorkspaceExplorerProvider=WorkspaceExplorerShellProvider; export const workspaceExplorerActionsRef={current:{}}; export const workspaceExplorerEditorStateRef={current:{}}; export const queueRevealActionProjectById=noop; export const useWorkspaceExplorerTree=()=>({}); export const useOptionalWorkspaceExplorerEditor=()=>null; export const useWorkspaceExplorerEditor=()=>({}); export const useWorkspaceExplorer=()=>({}); export const useWorkspaceExplorerActions=()=>({});";
  const leaves: Record<string, string> = {
    "@/lib/workspace-explorer": shell,
    "@/lib/use-browser-panel-message-sync": "export function useBrowserPanelMessageSync(){}",
    "@/lib/action-project-import-from-messages": "export function useActionProjectImportFromMessages(){}",
    "@/lib/program-data-reload-from-tools": "export function useReloadProgramDataFromToolMessages(){}",
    "@/components/workspace/WorkspaceExplorerPanel": "export function WorkspaceExplorerPanel(){return null} export function ExplorerPanelToggle(){return null}",
    "@/components/chat/ChatConversationHeader": "export function ChatConversationHeader(){return null}",
    "@/lib/release-preview.client": "export function useDevExperienceEnabled(){return false} export function useReleasePreview(){return false} export function useReleasePreviewToggle(){return {enabled:false,toggle:()=>{}}}",
    "./ModelSelector": "export function ModelSelector(){return null} export async function fetchLlmOptions(){return null} export const hasConfiguredLlmOption=()=>true; export const pickInitialLlmSelectionFromApi=()=>''; export const pickInitialLauncherLlmSelectionFromApi=()=>'';",
    "./ContextUsage": "export function ContextUsage(){return null}",
  };
  const compiled = await build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "approval-fixture.js", format: "iife", platform: "browser", jsx: "automatic",
    tsconfig: path.join(process.cwd(), "tsconfig.json"), define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
    plugins: [{ name: "approval-fixture", setup(builder) {
      builder.onLoad({ filter: /[\\/]components[\\/]chat[\\/]Chat\.tsx$/ }, async args => ({
        contents: `${await readFile(args.path, "utf8")}\nexport {ChatPanel};`, loader: "tsx", resolveDir: path.dirname(args.path),
      }));
      builder.onLoad({ filter: /[\\/]components[\\/]chat[\\/]useAgentChatSession\.ts$/ }, async args => ({
        contents: (await readFile(args.path, "utf8")).replace("export function useAgentChatSession", "function actualUseAgentChatSession")
          + "\nexport function useAgentChatSession(options){const session=actualUseAgentChatSession(options);window.fixture.sessions[options.threadId]=session;return session;}",
        loader: "ts", resolveDir: path.dirname(args.path),
      }));
      builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(leaves, args.path) ? { path: args.path, namespace: "fixture-leaf" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture-leaf" }, args => ({ contents: leaves[args.path]!, loader: "js" }));
    } }],
  });
  const browser = await chromium.launch({ channel: "msedge", headless: true, timeout: 15_000 });
  try {
    const page = await browser.newPage();
    const requests: any[] = [], errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/chat") {
        requests.push(route.request().postDataJSON());
        const events = requests.length === 1 ? [{ type: "start", messageId: "assistant-b" }, { type: "start-step" },
          { type: "tool-input-available", toolCallId: "call-b", toolName: "shell_exec", input: { command: "echo approval B" } },
          { type: "tool-approval-request", toolCallId: "call-b", approvalId: "approval-b" },
          { type: "finish-step" }, { type: "finish", finishReason: "tool-calls" }]
          : [{ type: "start", messageId: "final" }, { type: "start-step" }, { type: "text-start", id: "text" },
            { type: "text-delta", id: "text", delta: "approved B" }, { type: "text-end", id: "text" }, { type: "finish-step" }, { type: "finish" }];
        await route.fulfill({ headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
          body: `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n` });
      } else if (url.pathname === "/") {
        await route.fulfill({ contentType: "text/html", body: '<style>.app-main--hidden{display:none}</style><div id="root"></div>' });
      } else {
        await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, commands: [], agents: [], skills: [], items: [], designers: [] }) });
      }
    });
    await page.goto("http://localhost/");
    await page.addScriptTag({ content: compiled.outputFiles.find(file => file.path.endsWith(".js"))!.text });
    const launcher = page.locator('[data-panel="launcher"]');
    await launcher.getByText("echo approval A", { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => {
      const peer = (window as any).fixture.sessions.peer;
      return [[], ["peer-one"], ["peer-one", "peer-one"], ["approval-a", "approval-b"]].map(ids => peer.respondToPendingApprovals(ids, true));
    }), [false, false, false, false], "empty, partial, duplicate and foreign-session decisions are rejected");
    await launcher.locator(".approval-hint-btn--approve").click();
    await page.waitForFunction(() => (window as any).fixture.latest?.pendingApprovals?.[0]?.id === "approval-b");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].messages.flatMap((message: any) => message.parts)
      .find((part: any) => part.approval?.id === "approval-a")?.approval.approved, true);
    // Hold the old view to model the existing 120ms debounced sync / delayed
    // cross-window delivery. A second real click must not approve unseen B.
    await launcher.locator(".approval-hint-btn--approve").click();
    await page.waitForFunction(() => (window as any).fixture.dispatches === 2);
    await page.waitForTimeout(150);
    assert.equal(requests.length, 1, "a stale A decision must not resume the new B approval");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.latest.pendingApprovals.map((item: any) => item.id)), ["approval-b"]);
    await page.evaluate(() => (window as any).fixture.showLatest());
    await launcher.getByText("echo approval B", { exact: true }).waitFor();
    await launcher.locator(".approval-hint-btn--approve").click();
    await page.waitForFunction(() => (window as any).fixture.latest?.messages?.some((message: any) => message.parts.some((part: any) => part.text === "approved B")));
    assert.equal(requests.length, 2);
    assert.equal(requests[1].threadId, requests[0].threadId);
    assert.equal(requests[1].messages.flatMap((message: any) => message.parts)
      .find((part: any) => part.approval?.id === "approval-b")?.approval.approved, true);
    assert.deepEqual(await page.evaluate(() => {
      const peer = (window as any).fixture.sessions.peer;
      peer.stop(); peer.repairToolCalls(); peer.clearError();
      return {
        renderStillPending: peer.messages.at(-1).parts.every((part: any) => part.state === "approval-requested"),
        accepted: peer.respondToPendingApprovals(["peer-one", "peer-two"], true),
      };
    }), { renderStillPending: true, accepted: false }, "stop/repair invalidates the SDK state before React's throttled render catches up");
    assert.deepEqual(await page.evaluate(() => {
      const state = (window as any).fixture, peer = state.sessions.peer;
      peer.setMessages(state.peerInitial);
      return [peer.respondToPendingApprovals(["peer-one", "peer-two"], false),
        peer.respondToPendingApprovals(["peer-one", "peer-two"], false)];
    }), [true, false], "a valid batch denial is accepted once even before the SDK queue drains");
    await page.waitForFunction(() => (window as any).fixture.sessions.peer.messages.at(-1).parts.some((part: any) => part.text === "approved B"));
    assert.equal(requests.length, 3);
    assert.equal(requests[2].threadId, "peer");
    assert.deepEqual(requests[2].messages.flatMap((message: any) => message.parts)
      .filter((part: any) => part.approval).map((part: any) => part.approval.approved), [false, false]);
    await page.evaluate(() => {
      const state = (window as any).fixture;
      // Keep an outstanding, unclaimed snapshot in the real SDK store so the
      // following rejection must come from the mounted owner, not missing IDs.
      const late = structuredClone(state.peerInitial);
      late.at(-1).parts.forEach((part: any) => { part.approval.id = 'late-' + part.approval.id; });
      state.sessions.peer.setMessages(late);
      state.latePeer = state.sessions.peer.respondToPendingApprovals;
      state.unmountSession();
    });
    await page.locator('[data-panel="runtime"]').waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => (window as any).fixture.latePeer(["late-peer-one", "late-peer-two"], true)), false);
    await page.waitForTimeout(150);
    assert.equal(requests.length, 3, "stopped and unmounted owners cannot resume a model turn");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
