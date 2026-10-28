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
const threadId=startEphemeralLauncherRun('delete-session');state.threadId=threadId;
const initial=[{id:'user',role:'user',parts:[{type:'text',text:'delete A then B'}]},
{id:'assistant-a',role:'assistant',parts:[{type:'tool-qkrpc_action_delete',toolCallId:'call-a',state:'approval-requested',input:{id:'action-a'},approval:{id:'approval-a'}}]}];
state.initial=initial;const noop=()=>{};
function App(){const[view,setView]=useState(null);const[mounted,setMounted]=useState(true);const[cwd,setCwd]=useState('C:/workspace-x');const[visible,setVisible]=useState(true);
useEffect(()=>{state.showLatest=()=>setView(state.latest);state.unmountSession=()=>setMounted(false);state.setCwd=setCwd;state.setVisible=setVisible;
return subscribeLauncherBridge(message=>{
 if(message.type==='agent:session-sync'){state.latest=message;setView(previous=>previous??message);}
 if(message.type==='launcher:approval-respond'){state.lastDecision=message;dispatchLauncherApprovalResponse(message.sessionId,message.approved,message);state.dispatches++;}
});},[]);
return <>{mounted&&<section data-panel="runtime"><ChatPanel threadId={threadId} initialMessages={initial}
workingDirectory={cwd} visible={visible} ephemeral threadTitle="fixture" threadUpdatedAt={1} titleGenerated titleManual
ping={{ok:false}} connectTick={0} settingsOpen={false} onToggleSettings={noop} onOpenSettings={noop}
onPersist={noop} onAutoTitle={noop} designerEmbed/></section>}
{view&&<section data-panel="launcher"><LauncherTranscript {...view} workingDirectory={cwd}/></section>}</>;}
createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);
`;

test("Workspace deletes stay with the displayed approval, lookup and cwd through Chat and Launcher", { timeout: 45_000 }, async () => {
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
    const requests: any[] = [], deletes: any[] = [], errors: string[] = [];
    const lookups: { cwd: string; release: () => Promise<void> }[] = [];
    const tree = { rootPath: '.quicker/actions', rootLabel: 'actions', children: ['a', 'b', 'c'].map(id => ({
      name: id, path: '.quicker/actions/' + id, kind: 'directory', actionId: 'action-' + id,
    })) };
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/workspace' && url.searchParams.get('op') === 'tree') {
        lookups.push({ cwd: url.searchParams.get('cwd')!, release: () => route.fulfill({ contentType: 'application/json',
          body: JSON.stringify({ ok: true, tree, subprogramTree: { rootPath: '.quicker/subprograms', rootLabel: 'subprograms', children: [] } }) }) });
      } else if (url.pathname === '/api/workspace' && route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        assert.equal(body.op, 'delete-project'); deletes.push(body);
        await route.fulfill({ json: { ok: true } });
      } else if (url.pathname === '/api/chat') {
        requests.push(route.request().postDataJSON());
        const events = requests.length === 1 ? [{ type: 'start', messageId: 'assistant-b' }, { type: 'start-step' },
          { type: 'tool-input-available', toolCallId: 'call-b', toolName: 'qkrpc_action_delete', input: { id: 'action-b' } },
          { type: 'tool-approval-request', toolCallId: 'call-b', approvalId: 'approval-b' },
          { type: 'finish-step' }, { type: 'finish', finishReason: 'tool-calls' }]
          : [{ type: 'start', messageId: 'done' }, { type: 'start-step' }, { type: 'text-start', id: 'text' },
            { type: 'text-delta', id: 'text', delta: 'done' }, { type: 'text-end', id: 'text' }, { type: 'finish-step' }, { type: 'finish' }];
        await route.fulfill({ headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
          body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n' });
      } else if (url.pathname === '/') {
        await route.fulfill({ contentType: 'text/html', body: '<style>.app-main--hidden{display:none}</style><div id="root"></div>' });
      } else {
        await route.fulfill({ json: { ok: true, commands: [], agents: [], skills: [], items: [], designers: [] } });
      }
    });
    await page.goto('http://localhost/');
    await page.addScriptTag({ content: compiled.outputFiles.find(file => file.path.endsWith('.js'))!.text });
    const launcher = page.locator('[data-panel="launcher"]');
    const main = page.locator('[data-panel="runtime"] .approval-hint');
    const waitLookup = async (count: number) => {
      await assertEventually(() => lookups.length >= count);
    };
    const showLatest = async () => { await page.evaluate(() => (window as any).fixture.showLatest()); };
    const waitHit = async (id: string) => {
      await page.waitForFunction(id => (window as any).fixture.latest?.workspaceDeleteHits?.[0]?.id === id, id);
      await showLatest(); await launcher.getByRole('checkbox').waitFor();
    };
    await launcher.locator('.approval-hint').waitFor();
    assert.equal(await launcher.getByRole('checkbox').count(), 0, 'pending lookup exposes no deletion option');
    await waitLookup(1);
    // StrictMode can issue a cancelled first lookup; release all initial reads.
    await page.waitForTimeout(50);
    for (const lookup of lookups) await lookup.release();
    await waitHit('action-a');
    await launcher.locator('.approval-hint-btn--approve').click();
    await page.waitForFunction(() => (window as any).fixture.latest?.pendingApprovals?.[0]?.id === 'approval-b');
    await showLatest();
    assert.equal(requests.length, 1); assert.equal(deletes.length, 0);
    assert.equal(await launcher.getByRole('checkbox').count(), 0, 'B lookup must not expose A workspace hits');
    const bIndex = lookups.length - 1;
    await lookups[bIndex]!.release();
    await waitHit('action-b');
    await launcher.getByRole('checkbox').check();
    await page.evaluate(() => (window as any).fixture.setCwd('C:/workspace-y'));
    await waitLookup(bIndex + 2);
    await launcher.locator('.approval-hint-btn--approve').click();
    await page.waitForTimeout(150);
    assert.deepEqual(deletes, [], 'a checked X card cannot delete from Y');
    assert.equal(requests.length, 1, 'a checked X card cannot authorize the same approval in Y');
    const yIndex = lookups.length - 1;
    await page.evaluate(() => (window as any).fixture.setCwd('C:/workspace-z'));
    await waitLookup(yIndex + 2);
    const zIndex = lookups.length - 1;
    await lookups[zIndex]!.release();
    await page.waitForTimeout(180); await showLatest();
    await launcher.getByRole('checkbox').waitFor();
    assert.equal(await launcher.getByRole('checkbox').isChecked(), false, 'new snapshot does not inherit an old selection');
    await lookups[yIndex]!.release();
    await page.waitForTimeout(180);
    await page.evaluate(() => (window as any).fixture.setVisible(false));
    await launcher.getByRole('checkbox').check();
    // Two bridge decisions in the same tick exercise the SDK claim guard.
    await launcher.locator('.approval-hint-btn--approve').evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await assertEventually(() => deletes.length === 1 && requests.length === 2);
    assert.deepEqual(deletes, [{ op: 'delete-project', cwd: 'C:/workspace-z', projectPath: '.quicker/actions/b' }]);
    const decision = await page.evaluate(() => (window as any).fixture.lastDecision);
    assert.equal(decision.approvalIds[0], 'approval-b');
    await page.evaluate(() => (window as any).fixture.setVisible(true));
    // Main Chat uses the same snapshot and live-store gate, including before
    // React's throttled message rendering notices an input change or stop.
    const setApproval = async (suffix: string) => {
      const before = lookups.length;
      await page.evaluate(suffix => {
        const state = (window as any).fixture;
        const messages = structuredClone(state.initial);
        messages.at(-1).parts[0].approval.id = 'approval-' + suffix;
        state.sessions[state.threadId].setMessages(messages);
      }, suffix);
      await waitLookup(before + 1);
      await lookups.at(-1)!.release();
      await main.getByRole('checkbox').waitFor();
    };
    await setApproval('changed');
    await main.getByRole('checkbox').check();
    await page.evaluate(() => {
      const state = (window as any).fixture, session = state.sessions[state.threadId];
      const messages = structuredClone(session.messages); messages.at(-1).parts[0].input.id = 'action-c';
      session.setMessages(messages);
      (document.querySelector('[data-panel="runtime"] .approval-hint-btn--approve') as HTMLButtonElement).click();
    });
    await page.waitForTimeout(150);
    assert.equal(requests.length, 2); assert.equal(deletes.length, 1, 'same ID with a changed live target cannot delete the old project');
    assert.equal(await main.getByRole('checkbox').count(), 0, 'a changed target cannot offer the previous project while its lookup is pending');
    await setApproval('stopped');
    await main.getByRole('checkbox').check();
    await page.evaluate(() => {
      const state = (window as any).fixture, session = state.sessions[state.threadId];
      session.stop(); session.repairToolCalls(); session.clearError();
      (document.querySelector('[data-panel="runtime"] .approval-hint-btn--approve') as HTMLButtonElement).click();
    });
    await page.waitForTimeout(150);
    assert.equal(requests.length, 2); assert.equal(deletes.length, 1, 'stopped approval cannot perform the attached delete');
    await setApproval('main-valid');
    await main.getByRole('checkbox').check();
    await main.locator('.approval-hint-btn--approve').click();
    await assertEventually(() => requests.length === 3 && deletes.length === 2);
    assert.deepEqual(deletes[1], { op: 'delete-project', cwd: 'C:/workspace-z', projectPath: '.quicker/actions/a' }, 'main Chat also deletes exactly its frozen target');
    await setApproval('unmounted');
    await page.waitForTimeout(180); await showLatest();
    await launcher.getByRole('checkbox').check();
    await page.evaluate(() => (window as any).fixture.unmountSession());
    await page.locator('[data-panel="runtime"]').waitFor({ state: 'detached' });
    await launcher.locator('.approval-hint-btn--approve').click();
    await page.waitForTimeout(150);
    assert.equal(requests.length, 3); assert.equal(deletes.length, 2, 'unmounted owner cannot perform the attached delete');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

async function assertEventually(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
  assert.ok(check(), 'expected intercepted request');
}
