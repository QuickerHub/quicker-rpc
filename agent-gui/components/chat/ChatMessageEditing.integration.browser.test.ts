import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

const fixture = `
import React,{StrictMode,useLayoutEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ChatPanel} from '@/components/chat/Chat';
import {AppConfirmHost} from '@/components/AppConfirmHost';
window.fixture={submitEvents:[],branchEvents:[]};
const messages=id=>[{id:id+'-u1',role:'user',parts:[{type:'text',text:'first '+id}],metadata:{fixture:{opaque:'keep-prefix'}}},
 {id:id+'-a1',role:'assistant',parts:[{type:'text',text:'first answer'}]},
 {id:id+'-u2',role:'user',parts:[{type:'text',text:'second '+id}]},
 {id:id+'-a2',role:'assistant',parts:[{type:'text',text:'old tail'}]}];
const initial={a:messages('a'),b:messages('b')};
const noop=()=>{};
function App(){const[active,setActive]=useState('a');useLayoutEffect(()=>{window.fixture.setActive=setActive},[]);
 return <>{['a','b'].map(id=><section key={id} data-panel={id}>
 <ChatPanel threadId={id} initialMessages={initial[id]} workingDirectory="" visible={id===active} ephemeral
 threadTitle={id} threadUpdatedAt={1} titleGenerated titleManual ping={{ok:false}} connectTick={0} settingsOpen={false}
 onToggleSettings={noop} onOpenSettings={noop} onPersist={noop} onAutoTitle={noop} designerEmbed/>
 </section>)}<AppConfirmHost/></>}
createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);
`;

test("production ChatPanel, composer, SDK session and confirmation branch through one fake SSE transport", { timeout: 45_000 }, async () => {
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
    bundle: true, write: false, outfile: "chat-message-editing-fixture.js", format: "iife", platform: "browser", jsx: "automatic",
    tsconfig: path.join(process.cwd(), "tsconfig.json"), define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
    plugins: [{ name: "generated-chat-fixture", setup(builder) {
      builder.onLoad({ filter: /[\\/]components[\\/]chat[\\/]Chat\.tsx$/ }, async (args) => ({
        contents: `${(await readFile(args.path, "utf8")).replace("const submitComposer = useCallback(() => {", "const submitComposer = useCallback(() => { window.fixture.submitEvents.push({threadId,visible,editAnchorMessageId,text:readComposerText()});")}\nexport { ChatPanel };`, loader: "tsx", resolveDir: path.dirname(args.path),
      }));
      builder.onLoad({ filter: /[\\/]components[\\/]chat[\\/]useChatMessageEditing\.ts$/ }, async (args) => ({
        contents: (await readFile(args.path, "utf8")).replace("if (pendingConfirmation.current) return false;",
          "window.fixture.branchEvents.push({pending:!!pendingConfirmation.current,...readBranchContext(),owner:undefined}); if (pendingConfirmation.current) return false;"),
        loader: "ts", resolveDir: path.dirname(args.path),
      }));
      builder.onResolve({ filter: /.*/ }, (args) => Object.hasOwn(leaves, args.path) ? { path: args.path, namespace: "fixture-leaf" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture-leaf" }, (args) => ({ contents: leaves[args.path]!, loader: "js" }));
    } }],
  });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    const requests: any[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/chat") {
        requests.push(route.request().postDataJSON());
        const events = [{ type: "start", messageId: "fixture-response" }, { type: "text-start", id: "reply" },
          { type: "text-delta", id: "reply", delta: "fixture reply" }, { type: "text-end", id: "reply" }, { type: "finish" }];
        await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
          body: `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n` });
      } else if (url.pathname === "/") {
        await route.fulfill({ contentType: "text/html", body: '<style>.app-main--hidden{display:none}.composer-inline-input[contenteditable]{min-height:30px}</style><div id="root"></div>' });
      } else {
        // All non-chat APIs remain fixture data too, including settings/catalog/DB routes.
        await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, commands: [], agents: [], skills: [], items: [], designers: [] }) });
      }
    });
    await page.goto("http://localhost/");
    assert.equal(await page.evaluate(() => isSecureContext && typeof crypto.randomUUID === "function"), true,
      "The production SDK creates message IDs on the application's secure loopback origin");
    await page.addScriptTag({ content: compiled.outputFiles.find(file => file.path.endsWith(".js"))!.text });
    const panel = (id: string) => page.locator(`[data-panel="${id}"]`);
    const input = (id: string) => panel(id).locator('footer [contenteditable="true"]');
    await panel("a").locator('[data-message-id="a-u2"]').click();
    await input("a").fill("revised A from production composer");
    await page.evaluate(() => (window as any).fixture.setActive("b"));
    await panel("b").locator('[data-message-id="b-u2"]').click();
    await input("b").fill("draft B from production composer");
    await page.keyboard.press("Escape");
    assert.equal(await input("b").textContent(), "");
    assert.equal(await input("a").textContent(), "revised A from production composer");
    assert.equal(await panel("a").locator(".composer-edit-banner").count(), 1);
    await page.evaluate(() => (window as any).fixture.setActive("a"));
    // focus() alone has no visibility/actionability wait and can run before React commits this switch.
    await input("a").waitFor({ state: "visible" });
    await input("a").focus();
    const beforeEnter = await page.evaluate(() => {
      const panel = document.querySelector('[data-panel="a"]')!;
      const field = panel.querySelector<HTMLElement>('footer [contenteditable="true"]')!;
      return { banner: panel.querySelector(".composer-edit-banner")?.textContent, text: field.textContent,
        focused: document.activeElement === field, editable: field.contentEditable, ariaDisabled: field.getAttribute("aria-disabled"),
        visible: !panel.querySelector(".app-main--hidden") };
    });
    assert.equal(beforeEnter.focused, true, JSON.stringify(beforeEnter));
    assert.equal(beforeEnter.visible, true, JSON.stringify(beforeEnter));
    await page.keyboard.press("Enter");
    try { await page.getByRole("alertdialog").waitFor({ timeout: 5_000 }); }
    catch (cause) {
      const after = await page.evaluate(() => ({ submitEvents: (window as any).fixture.submitEvents, branchEvents: (window as any).fixture.branchEvents,
        focused: document.activeElement?.outerHTML, banner: document.querySelector('[data-panel="a"] .composer-edit-banner')?.textContent }));
      throw new Error(`Chat branch confirmation did not open: ${JSON.stringify({ beforeEnter, after, errors, requests })}`, { cause });
    }
    await page.getByRole("button", { name: "确定", exact: true }).click();
    await panel("a").getByText("fixture reply", { exact: true }).waitFor();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].threadId, "a");
    assert.equal(requests[0].messages.length, 3);
    assert.deepEqual(requests[0].messages[0].metadata, { fixture: { opaque: "keep-prefix" } });
    assert.equal(requests[0].messages[0].id, "a-u1");
    assert.equal(requests[0].messages[1].id, "a-a1");
    assert.equal(requests[0].messages[2].parts[0].text, "revised A from production composer");
    assert.equal(await panel("a").locator(".composer-edit-banner").count(), 0);
    assert.equal(await panel("b").locator('[data-message-id="b-u2"]').count(), 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
