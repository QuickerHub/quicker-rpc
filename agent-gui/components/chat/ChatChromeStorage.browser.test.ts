import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const gui = fileURLToPath(new URL("../../", import.meta.url));
const fixtures = resolve(gui, "..", ".tmp", "chat-chrome-storage");
const origin = "http://chat-chrome.fixture:43127";
const fixture = `
import React,{StrictMode,useEffect} from 'react';import{createRoot}from'react-dom/client';
import{Chat}from'@/components/chat/Chat';import{defaultChatStore}from'@/lib/chat-store';
const listeners=new Set();
const makeStore=withMessages=>{const s=defaultChatStore();s.openTabIds=[];s.tabStripPersisted=true;
 s.threads[0].messages=withMessages?[{id:'fixture-message',role:'user',parts:[{type:'text',text:'fixture history'}]}]:[];s.threads[0].messageCount=withMessages?1:0;return s;};
const state=window.chatChromeFixture={store:makeStore(false),subscribers:listeners,commits:[],native:[],mounted:0};
state.updateStore=next=>{state.store=next;state.commits.push(next);for(const listener of listeners)listener();};
state.replaceStore=kind=>state.updateStore(makeStore(kind==='messages'));
function App(){useEffect(()=>{state.mounted++;return()=>{state.mounted--;};},[]);return <Chat/>;}
const root=createRoot(document.getElementById('root'));state.unmount=()=>root.unmount();root.render(<StrictMode><App/></StrictMode>);
`;

async function compileChrome(debug: boolean): Promise<string> {
  const leaves: Record<string, string> = {
    "@/lib/workspace-explorer": "const noop=()=>{};const shell={panelOpen:false,chatColumnWidth:null,setChatColumnWidth:noop};export const useWorkspaceExplorerShell=()=>shell;export const useOptionalWorkspaceExplorerShell=()=>shell;export const WorkspaceExplorerShellProvider=({children})=>children;export const WorkspaceExplorerPanelProvider=WorkspaceExplorerShellProvider;export const WorkspaceExplorerProvider=WorkspaceExplorerShellProvider;export const workspaceExplorerActionsRef={current:{}};export const workspaceExplorerEditorStateRef={current:{}};export const queueRevealActionProjectById=noop;export const useWorkspaceExplorerTree=()=>({});export const useOptionalWorkspaceExplorerEditor=()=>null;export const useWorkspaceExplorerEditor=()=>({});export const useWorkspaceExplorer=()=>({});export const useWorkspaceExplorerActions=()=>({});",
    "@/lib/use-chat-store": `import{useSyncExternalStore}from'react';const current=()=>window.chatChromeFixture.store;
      const subscribe=fn=>{window.chatChromeFixture.subscribers.add(fn);return()=>window.chatChromeFixture.subscribers.delete(fn);};
      export const useChatStore=()=>({store:useSyncExternalStore(subscribe,current,current),defaultCwd:'',defaultCwdProfile:{source:'fixture'},defaultCwdReady:true,updateStore:window.chatChromeFixture.updateStore});
      export const getChatStoreSnapshotSync=current;export const useIsChatStoreHydrated=()=>true;export const isChatStoreHydrated=()=>true;`,
    "@/lib/designer-embed-context": "export const useActionDesignerEmbed=()=>({enabled:false,scoped:false,debugMode:false,entityId:'',isSubProgram:false});",
    "@/lib/desktop-bridge": "export const listenDesktop=async()=>()=>{};export const invokeDesktop=async command=>{window.chatChromeFixture.native.push(command);if(command!=='legacy_chat_store_scan')throw Error('Native operation prohibited');return{hits:[],scannedRoots:['synthetic-native-profile']};};",
    "@/lib/launcher/launcher-session": "const runs=[];export const getEphemeralLauncherRuns=()=>runs;export const subscribeEphemeralLauncherRuns=()=>()=>{};export const getLauncherSessionForThread=()=>null;export const clearEphemeralLauncherRuns=()=>{};export const startEphemeralLauncherRun=()=>{throw Error('Launcher prohibited');};",
    "@/lib/launcher/launcher-bridge": "export const postLauncherSessionSync=()=>{};export const postLauncherOpened=()=>{};export const postLauncherSessionClear=()=>{};export const subscribeLauncherBridge=()=>()=>{};",
    "@/lib/launcher/launcher-action-dispatch": "export const dispatchLauncherApprovalResponse=()=>{};export const dispatchLauncherToolOutput=()=>{};export const registerLauncherSessionHandlers=()=>()=>{};",
    "@/lib/launcher/launcher-submit-queue": "export const queueLauncherSubmit=()=>{};export const subscribeLauncherSubmit=()=>()=>{};export const takeLauncherSubmit=()=>null;",
    "@/lib/use-browser-panel-message-sync": "export function useBrowserPanelMessageSync(){}",
    "@/lib/action-project-import-from-messages": "export function useActionProjectImportFromMessages(){}",
    "@/lib/program-data-reload-from-tools": "export function useReloadProgramDataFromToolMessages(){}",
    "@/lib/release-preview.client": "export const useDevExperienceEnabled=()=>false;export const useReleasePreview=()=>false;export const useReleasePreviewToggle=()=>({active:false,toggle:()=>{}});",
    "@/lib/use-chat-thread-export-dialog": "export const useChatThreadExportDialog=()=>({exporting:false,exportThread:()=>{},exportDialog:null});export const exportThreadLikeWithLiveMessages=()=>{throw Error('Export prohibited');};",
    "./ModelSelector": "export function ModelSelector(){return null}export async function fetchLlmOptions(){return{providers:[]}}export const hasConfiguredLlmOption=()=>true;export const pickInitialLlmSelectionFromApi=()=>'';export const pickInitialLauncherLlmSelectionFromApi=()=>'';",
    "./ContextUsage": "export function ContextUsage(){return null}",
    "@/lib/docs-viewer": "export const DocsViewerProvider=({children})=>children;export const useDocsViewer=()=>({activeDoc:null});export const useOptionalDocsViewer=()=>null;",
    // The error is produced by the real useQkrpcPing and passed by real Chat.
    "@/components/chat/AppSettingsPopup": "import React from'react';export const AppSettingsPopup=({ping})=><output data-current-ping={ping.status}>{ping.message??''}</output>;",
  };
  const wrappers: Record<string, string> = {
    "@/components/workspace/WorkspaceDocumentHost": "WorkspaceDocumentHost", "@/components/workspace/AppMainWorkspaceSplit": "AppMainWorkspaceSplit",
    "@/lib/embedded-browser-context": "EmbeddedBrowserProvider", "@/lib/embedded-terminal-context": "EmbeddedTerminalProvider",
    "@/lib/embedded-terminal-tabs": "EmbeddedTerminalTabsProvider", "@/lib/embedded-browser-tabs": "EmbeddedBrowserTabsProvider",
  };
  const empty: Record<string, string> = {
    "@/components/chat/ChatConversationHeader": "ChatConversationHeader", "@/components/chat/ChatTitlebar": "ChatTitlebar",
    "@/components/chat/WorkingDirectoryDialog": "WorkingDirectoryDialog", "@/components/chat/ThreadSidebarContextMenu": "ThreadSidebarContextMenu",
    "@/components/workspace/WorkspaceExplorerPanel": "WorkspaceExplorerPanel", "@/components/workspace/WorkspaceMainEditorTabBridgeRegistrar": "WorkspaceMainEditorTabBridgeRegistrar",
    "@/lib/use-thread-side-panel-sync": "ThreadSidePanelSync",
  };
  for (const [path, name] of Object.entries(wrappers)) leaves[path] = `export const ${name}=({children})=>children;`;
  leaves["@/lib/embedded-browser-context"] += "export const useEmbeddedBrowser=()=>{throw Error('Browser panel prohibited');};export const useEmbeddedBrowserOptional=()=>null;";
  leaves["@/lib/embedded-terminal-context"] += "export const useEmbeddedTerminal=()=>{throw Error('Terminal panel prohibited');};";
  leaves["@/lib/embedded-terminal-tabs"] += "export const useEmbeddedTerminalTabs=()=>{throw Error('Terminal tabs prohibited');};export const setTerminalAllTabsClosedHandler=()=>{};";
  leaves["@/lib/embedded-browser-tabs"] += "export const useEmbeddedBrowserTabs=()=>{throw Error('Browser tabs prohibited');};";
  for (const [path, name] of Object.entries(empty)) leaves[path] = `export function ${name}(){return null}`;
  leaves["@/components/workspace/WorkspaceExplorerPanel"] += "export function ExplorerPanelToggle(){return null}";
  // Keep Chat, ChatSidebar, useQkrpcPing and every dev banner real. Reintroducing
  // the port banner must execute its actual mount/store effects and fail here.
  const compiled = await build({ stdin: { contents: fixture, loader: "tsx", resolveDir: gui }, absWorkingDir: gui,
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", tsconfig: join(gui, "tsconfig.json"),
    define: { "process.env.NODE_ENV": JSON.stringify(debug ? "development" : "production"), "process.env": "{}" },
    plugins: [{ name: "isolated-chat-chrome-environment", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(leaves, args.path) ? { path: args.path, namespace: "chrome-fixture" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "chrome-fixture" }, args => ({ contents: leaves[args.path]!, loader: "jsx", resolveDir: gui }));
    } }],
  });
  return compiled.outputFiles.find(file => file.path.endsWith(".js"))?.text ?? compiled.outputFiles[0]!.text;
}

test("ordinary Chat chrome never probes fixed port 3000 across store updates, debug and Tauri; recovery and current-service errors remain", { timeout: 90_000 }, async () => {
  await mkdir(fixtures, { recursive: true });
  const profile = await mkdtemp(join(fixtures, "profile-"));
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  try {
    context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true, serviceWorkers: "block" });
    const bundles = new Map<boolean, string>();
    for (const debug of [true, false]) bundles.set(debug, await compileChrome(debug));
    for (const variant of [{ debug: true, tauri: false }, { debug: false, tauri: false }, { debug: false, tauri: true }, { debug: true, tauri: true }]) {
      const page = await context.newPage();
      const requests: { url: string; method: string }[] = [], errors: string[] = [];
      try {
        page.on("pageerror", error => errors.push(error.message));
        await page.route("**/*", async route => {
          const request = route.request(), url = new URL(request.url()); requests.push({ url: request.url(), method: request.method() });
          if (url.origin === origin && url.pathname === "/") { await route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }); return; }
          // All requests, including the old fixed-port negative control, are
          // fulfilled/aborted before any real server, host or model is contacted.
          if (url.pathname === "/api/ping") {
            await route.fulfill({ contentType: "application/json", body: url.origin === origin ? '{"ok":false,"stderr":"synthetic current-service failure"}' : '{"ok":true}' }); return;
          }
          if (url.origin === origin && url.pathname === "/api/chat-store/scan-legacy") {
            await route.fulfill({ contentType: "application/json", body: '{"hits":[],"scannedRoots":["synthetic-web-profile"]}' }); return;
          }
          await route.abort("blockedbyclient");
        });
        await page.addInitScript(tauri => { if (tauri) (window as any).__TAURI_INTERNALS__ = {}; }, variant.tauri);
        await page.goto(origin); await page.addScriptTag({ content: bundles.get(variant.debug)! });
        await page.waitForFunction(() => (window as any).chatChromeFixture?.mounted === 1);
        await page.locator('[data-current-ping="error"]').waitFor();
        for (const state of ["empty", "messages", "empty"]) {
          await page.evaluate(kind => (window as any).chatChromeFixture.replaceStore(kind), state);
          await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
        }
        assert.equal(errors.length, 0, JSON.stringify({ variant, errors }));
        assert.equal(await page.locator('[data-current-ping="error"]').textContent(), "synthetic current-service failure");
        assert.equal(requests.some(request => new URL(request.url).origin === origin && new URL(request.url).pathname === "/api/ping"), true);
        const fixedPort = () => requests.filter(request => new URL(request.url).hostname === "127.0.0.1" && new URL(request.url).port === "3000");
        assert.deepEqual(fixedPort(), [], JSON.stringify(variant));
        assert.equal(await page.locator(".chat-storage-port-banner").count(), 0, JSON.stringify(variant));
        assert.equal(await page.locator('a[href="http://127.0.0.1:3000"]').count(), 0);
        assert.equal((await page.locator("body").innerText()).includes("历史对话通常保存在"), false, JSON.stringify(variant));
        assert.equal(requests.filter(request => new URL(request.url).pathname === "/api/chat-store/scan-legacy").length, 0);
        assert.deepEqual(await page.evaluate(() => (window as any).chatChromeFixture.native), []);
        // Actual Sidebar button, handler and recovery client, with fake IO only.
        const expandSidebar = page.getByRole("button", { name: "展开侧栏", exact: true });
        if (await expandSidebar.count()) await expandSidebar.click();
        await Promise.all([
          variant.tauri ? page.waitForFunction(() => (window as any).chatChromeFixture.native.includes("legacy_chat_store_scan"))
            : page.waitForRequest(request => new URL(request.url()).origin === origin && new URL(request.url()).pathname === "/api/chat-store/scan-legacy" && request.method() === "POST"),
          page.getByRole("button", { name: "从老版本恢复对话", exact: true }).click(),
        ]);
        await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('[aria-label="从老版本恢复对话"]')?.disabled);
        if (variant.tauri) assert.deepEqual(await page.evaluate(() => (window as any).chatChromeFixture.native), ["legacy_chat_store_scan"]);
        else assert.equal(requests.filter(request => new URL(request.url).origin === origin && new URL(request.url).pathname === "/api/chat-store/scan-legacy" && request.method === "POST").length, 1);
        assert.deepEqual(fixedPort(), []); assert.equal(errors.length, 0, JSON.stringify({ variant, errors }));
        await page.evaluate(() => (window as any).chatChromeFixture.unmount());
      } finally { await page.close(); }
    }
  } finally {
    await context?.close();
    assert.equal(dirname(profile), fixtures, "cleanup stays in the current-worktree owned profile root");
    await rm(profile, { recursive: true, force: true });
  }
});
