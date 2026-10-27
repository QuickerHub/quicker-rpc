import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, type Page } from "playwright";

const gui = fileURLToPath(new URL("../../", import.meta.url));
const ownedRoot = path.resolve(gui, "../.tmp/r4-tool-failure-summary");
const require = createRequire(path.join(gui, "package.json"));
const entry = `
import React,{StrictMode,useLayoutEffect,useState} from 'react';import{createRoot}from'react-dom/client';
import{ToolPart}from'@/components/chat/ToolPart';
import{WorkspaceExplorerShellProvider,WorkspaceExplorerPanelProvider}from'@/lib/workspace-explorer';
import '@/app/globals.css';
const input=Object.freeze({id:'11111111-1111-4111-8111-111111111111',title:'New requested title'});
const output=Object.freeze({ok:false,exitCode:1,data:Object.freeze({error:'EDIT_VERSION_CONFLICT'}),stderr:'EDIT_VERSION_CONFLICT: action version changed'});
const running=Object.freeze({type:'tool-qkrpc_action_set_metadata',toolCallId:'metadata-original-call',state:'input-available',input});
const failure=Object.freeze({...running,state:'output-available',output});
const state=window.toolFailureFixture={input,output,running,failure,before:JSON.stringify({input,output,running,failure}),history:JSON.stringify(failure)};
function App(){const[part,setPart]=useState(running);state.fail=()=>setPart(failure);state.reopenHistory=()=>setPart(Object.freeze(JSON.parse(state.history)));
 useLayoutEffect(()=>{state.currentPart=part},[part]);
 return <WorkspaceExplorerShellProvider><WorkspaceExplorerPanelProvider cwd=""><div data-fixture-call={part.toolCallId}>
   <ToolPart key={part.toolCallId} messageId="metadata-message" partIndex={0} part={part}/>
 </div></WorkspaceExplorerPanelProvider></WorkspaceExplorerShellProvider>}
const root=createRoot(document.getElementById('root'));state.unmount=()=>root.unmount();root.render(<StrictMode><App/></StrictMode>);
`;

async function removeOwnedProfile(profile: string) {
  const root = await realpath(ownedRoot), resolved = await realpath(profile), relative = path.relative(root, resolved);
  assert.ok(relative && !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`), "Cleanup must remain in the test's own temporary root");
  await rm(resolved, { recursive: true, force: true });
}

async function capture(page: Page, directory: string, errors: string[], requests: string[]) {
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, "final.png"), fullPage: true, timeout: 10_000 }).catch(() => {});
  await writeFile(path.join(directory, "result.json"), JSON.stringify({ errors, requests, body: await page.locator("body").innerText(),
    fixture: await page.evaluate(() => { const f = (window as any).toolFailureFixture; return f ? { before: f.before, after: JSON.stringify({ input: f.input, output: f.output, running: f.running, failure: f.failure }), history: f.history } : null; }),
  }, null, 2));
}

test("the same real ToolPart row and open details retain a structured metadata failure through history rendering", { timeout: 60_000 }, async () => {
  await mkdir(ownedRoot, { recursive: true });
  const compiled = await build({ stdin: { contents: entry, loader: "tsx", resolveDir: gui }, absWorkingDir: gui, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", outfile: "tool-failure-fixture.js", tsconfig: path.join(gui, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" }, plugins: [{ name: "installed-icon-modules", setup(builder) {
      builder.onResolve({ filter: /^@iconify\/icons-mdi\// }, input => ({ path: require.resolve(input.path) }));
    } }],
  });
  const profile = await mkdtemp(path.join(ownedRoot, "profile-")), evidence = path.join(ownedRoot, `evidence-${randomUUID()}`);
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined, page: Page | undefined;
  const errors: string[] = [], requests: string[] = [];
  try {
    context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true, serviceWorkers: "block" });
    page = await context.newPage(); page.setDefaultTimeout(10_000);
    page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    const origin = `http://localhost/r4-tool-failure-${randomUUID()}`;
    await page.route("**/*", route => {
      if (route.request().url() === origin) return route.fulfill({ contentType: "text/html", body: '<!doctype html><html data-theme="light"><head><link rel="icon" href="data:,"></head><body><div id="root"></div></body></html>' });
      requests.push(route.request().url()); return route.abort();
    });
    await page.goto(origin);
    const css = compiled.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "";
    await page.addStyleTag({ content: css }); await page.addScriptTag({ content: compiled.outputFiles.find(file => file.path.endsWith(".js"))!.text });
    const row = page.locator('[data-fixture-call="metadata-original-call"] .tool-summary'); await row.waitFor();
    assert.equal(await row.locator(".tool-meta").textContent(), "改元数据中…");
    await row.click(); const dialog = page.getByRole("dialog"); await dialog.waitFor();
    await page.evaluate(() => { (window as any).toolFailureFixture.dialog = document.querySelector('[role="dialog"]'); (window as any).toolFailureFixture.fail(); });
    await row.locator(".tool-meta--err").waitFor();
    assert.equal(await row.locator(".tool-meta--err").textContent(), "失败 · EDIT_VERSION_CONFLICT");
    assert.equal(await page.locator('[data-fixture-call="metadata-original-call"] .tool-card--err').count(), 1);
    assert.equal(await dialog.locator(".tool-result-popup-subtitle").textContent(), "失败 · EDIT_VERSION_CONFLICT");
    assert.equal(await page.evaluate(() => (window as any).toolFailureFixture.dialog === document.querySelector('[role="dialog"]')), true, "State changes retain this call's actual open dialog");
    await dialog.getByRole("tab", { name: "可视化", exact: true }).click();
    assert.equal(await dialog.locator(".tool-status-badge--err").textContent(), "失败exit 1");
    assert.equal(await dialog.locator(".tool-stderr").textContent(), "EDIT_VERSION_CONFLICT: action version changed");
    await dialog.getByRole("button", { name: "关闭", exact: true }).last().click(); await dialog.waitFor({ state: "hidden" });
    await page.evaluate(() => (window as any).toolFailureFixture.reopenHistory());
    await page.waitForFunction(() => { const f = (window as any).toolFailureFixture; return f.currentPart !== f.failure && JSON.stringify(f.currentPart) === f.history; });
    assert.equal(await row.locator(".tool-meta").textContent(), "失败 · EDIT_VERSION_CONFLICT");
    await row.click(); await dialog.waitFor(); await dialog.getByRole("tab", { name: "可视化", exact: true }).click();
    assert.equal(await dialog.locator(".tool-status-badge--err").textContent(), "失败exit 1");
    assert.equal(await dialog.locator(".tool-stderr").textContent(), "EDIT_VERSION_CONFLICT: action version changed");
    assert.equal(await page.evaluate(() => { const f = (window as any).toolFailureFixture; return JSON.stringify({ input: f.input, output: f.output, running: f.running, failure: f.failure }) === f.before; }), true);
    assert.deepEqual(errors, []); assert.deepEqual(requests, [], "No service, model, native command or other network is permitted");
  } finally {
    if (page && !page.isClosed()) {
      await capture(page, evidence, errors, requests).catch(() => {});
      await page.evaluate(() => (window as any).toolFailureFixture?.unmount()).catch(() => {});
    }
    await context?.close(); await removeOwnedProfile(profile);
  }
});
