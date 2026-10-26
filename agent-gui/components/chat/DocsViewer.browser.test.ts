import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium, type Page } from "playwright";

// Real tool parser, result view, provider and Docs panel; requests resolve only from owned fixtures.
const fixture = `
import React,{StrictMode,useLayoutEffect,useState}from'react';
import{createRoot}from'react-dom/client';
import{DocsViewerProvider,useDocsViewer}from'@/lib/docs-viewer';
import{DocsToolOutputView}from'@/components/chat/DocsToolResultViews';
import{DocsViewerPanel}from'@/components/chat/DocsViewerTabs';
import'@/app/globals.css';
window.fixture={requests:[],pending:[],state:null};
window.fetch=(url,init)=>{
 window.fixture.requests.push({url,method:init?.method??'GET'});
 if(String(url).startsWith('/api/docs/'))return new Promise(resolve=>window.fixture.pending.push(data=>resolve(new Response(JSON.stringify(data)))));
 throw Error('Unexpected request: '+url);
};
const store=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)}});
function Body(){const viewer=useDocsViewer();const[output,setOutput]=useState(null);const[showTool,setShowTool]=useState(true);
 useLayoutEffect(()=>{Object.assign(window.fixture,{setOutput,setShowTool,selectTopic:viewer.selectTopic,selectReference:viewer.selectReference,clear:viewer.clearActiveTopic,state:viewer.activeDoc,key:viewer.activeTopicId})});
 return <main style={{padding:16,height:'100vh',boxSizing:'border-box',display:'flex',flexDirection:'column',gap:12}}>
  {showTool&&<section aria-label="工具结果">{output&&<DocsToolOutputView output={output}/>}</section>}
  <section className="workspace-main-editor" aria-label="文档面板"><DocsViewerPanel/></section>
 </main>}
createRoot(document.getElementById('root')).render(<StrictMode><DocsViewerProvider><Body/></DocsViewerProvider></StrictMode>);
`;

let compilation: ReturnType<typeof compile> | undefined;
async function compile() {
  const result = await build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", format: "iife", platform: "browser", jsx: "automatic",
    tsconfig: path.join(process.cwd(), "tsconfig.json"), define: { "process.env.NODE_ENV": '"development"' } });
  return { js: result.outputFiles.find((file) => file.path.endsWith(".js"))!.text,
    css: result.outputFiles.find((file) => file.path.endsWith(".css"))!.text };
}

async function ownedFixture() {
  const compiled = await (compilation ??= compile());
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 800 } });
    page.setDefaultTimeout(5_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/*", (route) => { errors.push(`network:${route.request().url()}`); return route.abort(); });
    await page.setContent('<html data-theme="dark"><body><div id="root"></div></body></html>');
    await page.addStyleTag({ content: compiled.css });
    await page.addScriptTag({ content: compiled.js });
    await page.waitForFunction(() => typeof (window as any).fixture?.setOutput === "function");
    return { browser, page, errors };
  } catch (error) { await browser.close(); throw error; }
}

function gatewayResult(owner: string, status: "available" | "unknown" | "unavailable" = "available") {
  const known = status === "available";
  return { ok: status !== "unavailable", exitCode: status === "unavailable" ? 1 : 0, source: "local", data: {
    action: "docs-get", docsAction: "get", topic: "program-source", title: "Program source", guideSource: "gateway",
    markdown: status === "unavailable" ? "" : `# Gateway ${owner}\n\nObserved guide from ${owner}.`,
    gatewayKnowledge: { status, gateway: { transport: "http", identity: `sha256:${owner}`, displayName: `https://${owner}.example.test/rpc` },
      retrievedAt: "2026-10-26T08:00:00.000Z",
      codec: known ? { schemaVersion: 1, source: { provider: "qkrpc.program-source-codec", kind: "local-codec", assemblyName: "QuickerRpc.AgentModel", assemblyVersion: "fixture-1", moduleVersionId: "fixture-module", identityStatus: "known" },
        formats: { inputs: ["quicker.program.source.v1", "quicker.action.v1", `future.${owner}.source`], output: `future.${owner}.source` },
        nativeSource: { status: "unknown", read: null, write: null }, descriptorRevision: `sha256:${"d".repeat(64)}` } : null,
      provenance: known ? { schemaVersion: 1, source: { kind: "bundled-fallback", bundleVersion: `fixture-${owner}` }, indexRevision: `sha256:${"a".repeat(64)}`, contentRevision: `sha256:${"b".repeat(64)}` } : null,
      ...(!known ? { reason: status === "unavailable" ? "Gateway read failed; no fallback was used." : "This gateway did not provide codec/provenance fields." } : {}),
    },
  } };
}

function localResult(markdown = "# Local guide\n\nLocal body.") {
  return { ok: true, exitCode: 0, source: "local", data: { action: "docs-get", topic: "program-source", title: "Local program source", markdown } };
}

const panel = (page: Page) => page.getByRole("region", { name: "文档面板", exact: true });
async function openTool(page: Page, output: unknown) {
  await page.evaluate((value) => { (window as any).fixture.setShowTool(true); (window as any).fixture.setOutput(value); }, output);
  await page.getByRole("button", { name: "在文档中打开", exact: true }).click();
  await page.evaluate(() => (window as any).fixture.setShowTool(false));
}
async function settle(page: Page, index: number, data: unknown) {
  await page.evaluate(({ index, data }) => (window as any).fixture.pending[index](data), { index, data });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

test("tool output opens the actual Docs panel with observed formats, provenance and isolated source identities", { timeout: 45_000 }, async () => {
  const { browser, page, errors } = await ownedFixture();
  try {
    await openTool(page, gatewayResult("alpha"));
    assert.match(await panel(page).innerText(), /https:\/\/alpha\.example\.test\/rpc/);
    assert.match(await panel(page).innerText(), /future\.alpha\.source/);
    assert.match(await panel(page).innerText(), /原生能力\s+未核验/);
    await panel(page).getByText("查看 codec 与来源记录", { exact: true }).click();
    assert.match(await panel(page).locator("pre").innerText(), /fixture-module/);
    assert.match(await panel(page).locator("pre").innerText(), /"nativeSource"/);
    const alpha = await page.evaluate(() => (window as any).fixture.key);
    await openTool(page, gatewayResult("beta"));
    const beta = await page.evaluate(() => (window as any).fixture.key);
    assert.notEqual(alpha, beta);
    assert.match(await panel(page).innerText(), /Gateway beta/);
    assert.doesNotMatch(await panel(page).innerText(), /alpha/);
    const cli = gatewayResult("beta");
    cli.data.gatewayKnowledge.gateway.transport = "cli";
    cli.data.gatewayKnowledge.gateway.displayName = "qkrpc CLI";
    await openTool(page, cli);
    assert.notEqual(await page.evaluate(() => (window as any).fixture.key), beta, "transport is part of the source owner");
    assert.match(await panel(page).innerText(), /qkrpc CLI/);
    await openTool(page, localResult());
    assert.notEqual(await page.evaluate(() => (window as any).fixture.key), alpha);
    assert.match(await panel(page).innerText(), /本地指南/);
    assert.equal(await panel(page).locator(".docs-knowledge").count(), 0);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("legacy and failed gateway observations remain visible without borrowing local or previous codec fields", { timeout: 45_000 }, async () => {
  const { browser, page, errors } = await ownedFixture();
  try {
    await openTool(page, gatewayResult("alpha"));
    await openTool(page, gatewayResult("alpha", "unknown"));
    assert.match(await panel(page).innerText(), /信息未完整提供/);
    assert.match(await panel(page).innerText(), /输入格式\s+未知/);
    assert.doesNotMatch(await panel(page).innerText(), /future\.alpha|fixture-1/);
    await openTool(page, gatewayResult("alpha", "unavailable"));
    assert.match(await panel(page).innerText(), /无法读取/);
    assert.match(await panel(page).getByRole("alert").innerText(), /no fallback/);
    assert.equal(await panel(page).locator(".markdown-body").count(), 0);
    assert.match(await panel(page).innerText(), /https:\/\/alpha/);
    await openTool(page, localResult());
    assert.match(await panel(page).innerText(), /Local body/);
    assert.doesNotMatch(await panel(page).innerText(), /Gateway 来源/);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("late local reads cannot replace newer tool snapshots, another source, or a confirmed failure", { timeout: 45_000 }, async () => {
  const { browser, page, errors } = await ownedFixture();
  try {
    await page.evaluate(() => (window as any).fixture.selectTopic("program-source"));
    await page.waitForFunction(() => (window as any).fixture.pending.length === 1);
    await openTool(page, localResult("# Newer tool receipt"));
    await settle(page, 0, { success: true, topic: "program-source", title: "Old", markdown: "# Stale HTTP response" });
    assert.match(await panel(page).innerText(), /Newer tool receipt/);
    await page.evaluate(() => (window as any).fixture.selectTopic("program-source"));
    await page.waitForFunction(() => (window as any).fixture.pending.length === 2);
    await openTool(page, gatewayResult("beta", "unavailable"));
    await settle(page, 1, { success: true, topic: "program-source", title: "Local", markdown: "# Late local source" });
    assert.match(await panel(page).innerText(), /Gateway read failed/);
    assert.doesNotMatch(await panel(page).innerText(), /Late local/);
    await page.evaluate(() => { (window as any).fixture.selectTopic("program-source"); (window as any).fixture.selectTopic("program-source"); });
    await page.waitForFunction(() => (window as any).fixture.pending.length === 4);
    await settle(page, 3, { success: false, errorMessage: "Current read was rejected" });
    await settle(page, 2, { success: true, topic: "program-source", title: "Older", markdown: "# Late success" });
    assert.match(await panel(page).innerText(), /Current read was rejected/);
    assert.doesNotMatch(await panel(page).innerText(), /Late success|Newer tool receipt/);
    await page.evaluate(() => (window as any).fixture.selectTopic("program-source"));
    await page.waitForFunction(() => (window as any).fixture.pending.length === 5);
    await settle(page, 4, { success: true, topic: "program-source", title: "Recovered", markdown: "# Current local read" });
    assert.match(await panel(page).innerText(), /Current local read/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("gateway source details stay readable and keyboard reachable in dark/light narrow layouts", { timeout: 45_000 }, async () => {
  const { browser, page, errors } = await ownedFixture();
  try {
    await openTool(page, gatewayResult("a-very-long-gateway-owner-for-wrapping"));
    const directory = process.env.DOCS_VIEWER_SCREENSHOTS_DIR;
    if (directory) await mkdir(directory, { recursive: true });
    for (const width of [1024, 420]) for (const theme of ["dark", "light"]) {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
      await panel(page).locator("summary").focus();
      await page.keyboard.press("Enter");
      assert.equal(await panel(page).locator("details").getAttribute("open"), "");
      assert.match(await panel(page).locator("pre").innerText(), /"descriptorRevision"/);
      if (directory && width === 420) await page.screenshot({ path: path.join(directory, `docs-codec-${width}-${theme}-expanded.png`) });
      await page.keyboard.press("Enter");
      const visible = await panel(page).locator(".docs-knowledge").evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const rows = [...element.querySelectorAll("dt, dd, summary, strong")];
        return { overflow: element.scrollWidth > element.clientWidth,
          inViewport: rect.left >= 0 && rect.right <= innerWidth,
          unobscured: rows.every((row) => { const box = row.getBoundingClientRect();
            const hit = document.elementFromPoint(box.left + Math.min(8, box.width / 2), box.top + Math.min(8, box.height / 2));
            return hit === row || row.contains(hit); }),
          foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor };
      });
      assert.equal(visible.overflow, false, `${width}/${theme}: horizontal clipping`);
      assert.equal(visible.inViewport && visible.unobscured, true, `${width}/${theme}: metadata obscured`);
      assert.notEqual(visible.foreground, visible.background);
      if (directory) await page.screenshot({ path: path.join(directory, `docs-codec-${width}-${theme}.png`) });
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
