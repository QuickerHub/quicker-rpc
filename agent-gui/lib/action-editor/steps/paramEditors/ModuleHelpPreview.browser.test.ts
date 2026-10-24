import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

// Production document/controller/workspace and catalog adapter; only host IO and icon leaves are fixtures.
const fixture = `
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{ProgramEditorTabWorkspace}from'@/components/action-editor/ProgramEditorTabWorkspace';
import{createDesignerCatalogPort}from'@/lib/action-editor/catalog/designerCatalogPort';
import{createProgramDocumentSession}from'@/lib/action-editor/document/programDocumentSession';
import{createProgramDocumentEditorController}from'@/lib/action-editor/program/programDocumentEditorController';
import{mapAgentSchemaToStepRunnerItem}from'@/lib/action-editor/api/stepRunnerSchemaMap';
const state=window.fixture={requests:[],unexpected:[],opened:[],delayA:true,releaseA:null};
window.open=(...args)=>{state.opened.push(args);return null;};
const ids={a:'abcdefab-cdef-4abc-8def-abcdefabcdef',b:'bbcdefab-cdef-4abc-8def-abcdefabcdef'};
const runner=(key,owner,full)=>mapAgentSchemaToStepRunnerItem({stepRunnerKey:key,name:owner+' '+key,
 helpLink:full?(key==='sys:fixture-help'?'https://docs.example.test/'+owner+'?mode=one#parameters':key==='sys:fixture-unsafe'?'javascript:alert(1)':''):'',
 inputs:full?[{key:'text',title:'Draft text',valueType:'Text',variableMode:1,allowInput:true}]:[],outputs:[]});
window.fetch=async(input,init)=>{
 const url=String(input),body=JSON.parse(String(init?.body||'{}'));state.requests.push({url,body});
 const owner=Object.keys(ids).find(k=>ids[k]===body.catalogContext?.expectedProjectBinding?.actionId);
 if(!owner)throw Error('No unbound requests');
 if(url==='/api/step-runner/list')return Response.json({ok:true,items:['sys:fixture-help','sys:fixture-missing','sys:fixture-unsafe','sys:fixture-late'].map(k=>runner(k,owner,false))});
 if(url==='/api/step-runner/get'){
   if(owner==='a'&&body.key==='sys:fixture-late'&&state.delayA)await new Promise(resolve=>state.releaseA=resolve);
   return Response.json({ok:true,item:runner(body.key,owner,true)});
 }
 if(url==='/api/step-runner/summaries'||url==='/api/subprogram/list')return Response.json({ok:true,items:[]});
 state.unexpected.push({url,body});throw Error('Unexpected operation '+url);
};
const sessions={},controllers={},ports={};
for(const owner of ['a','b']){
 const source=JSON.stringify({steps:['help','missing','unsafe','late'].map(k=>({stepId:owner+'-'+k,stepRunnerKey:'sys:fixture-'+k,inputParams:{text:{value:'original'}}})),variables:[],subPrograms:[],futureRoot:'KEEP_INT64',futureDecimal:'KEEP_DECIMAL'}).replace('"KEEP_INT64"','9223372036854775807').replace('"KEEP_DECIMAL"','0.1234567890123456789012345678');
 sessions[owner]=createProgramDocumentSession({content:source,identity:{documentKey:owner,projectBinding:null}});
 controllers[owner]=createProgramDocumentEditorController(sessions[owner],{isCurrent:()=>true,onChange:r=>{if(!r.ok)throw Error(r.error);state.redraw?.(x=>x+1);}});
 ports[owner]=createDesignerCatalogPort({cwd:'C:/fixture-only',projectDirectory:'.quicker/actions/'+owner,expectedProjectBinding:{schemaVersion:1,kind:'action',actionId:ids[owner],hostBinding:{hostInstanceId:'help-'+owner,hostSessionId:owner.repeat(32),endpoint:'QuickerRpc_User_'+'A'.repeat(24)+'_'+owner.repeat(32),protocolVersion:1,schemaVersion:1,hostKind:'v1',quickerVersion:'fake-only',capabilities:{}}}});
}
state.read=owner=>sessions[owner].getState();state.snapshot=owner=>controllers[owner].getSnapshot();
function App(){const[,redraw]=useState(0),[active,setActive]=useState('a');state.redraw=redraw;state.switch=setActive;return <>{['a','b'].map(owner=><section key={owner} style={{display:active===owner?'block':'none'}}><ProgramEditorTabWorkspace documentKey={owner} controller={controllers[owner]} catalogPort={ports[owner]} active={active===owner}/></section>)}</>;}
const root=createRoot(document.getElementById('root'));root.render(<App/>);state.dispose=()=>{root.unmount();Object.values(ports).forEach(p=>p.dispose());};
`;

async function compileFixture(contents = fixture) {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  return build({ stdin: { contents, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", metafile: true, tsconfig: path.join(process.cwd(), "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"development"' }, loader: { ".css": "empty" },
    plugins: [{ name: "isolated-help-icons", setup(builder) {
      builder.onResolve({ filter: /^@iconify\/icons-mdi\// }, args => ({ path: require.resolve(args.path) }));
      builder.onResolve({ filter: /shared\/IconControl$/ }, args => ({ path: args.path, namespace: "fixture-icon" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture-icon" }, () => ({ contents: "export function IconControl(){return null}", loader: "js" }));
    } }] });
}

test("native module help preserves drafts, focus and document ownership", { timeout: 60_000 }, async () => {
  const result = await compileFixture();
  assert.ok(Object.keys(result.metafile!.inputs).every(file => !/(?:^|\/)lib\/(?:db\/|qkrpc\.ts|llm-config)/.test(file.replaceAll("\\", "/"))));
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } }), errors: string[] = [], docs: string[] = [];
    let releaseDocs: (() => void) | undefined, notifyHeld!: () => void, finishHeld!: () => void;
    const heldStarted = new Promise<void>(resolve => notifyHeld = resolve), heldFinished = new Promise<void>(resolve => finishHeld = resolve);
    page.setDefaultTimeout(8000);
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.route("**/*", async route => {
      const url = route.request().url();
      if (url.startsWith("https://docs.example.test/")) {
        docs.push(url);
        const held = url.startsWith("https://docs.example.test/a?") && docs.filter(x => x.startsWith("https://docs.example.test/a?")).length === 4;
        if (held) { notifyHeld(); await new Promise<void>(resolve => releaseDocs = resolve); }
        try { await route.fulfill({ contentType: "text/html", body: '<p>Local help fixture</p><input aria-label="Help search"><a href="#more">More help</a>' }); }
        finally { if (held) finishHeld(); }
      }
      else await route.abort();
    });
    await page.setContent('<div id="root"></div>');
    const css = await Promise.all(["components/action-editor/action-editor-theme.css", "components/action-editor/action-editor.css", "components/action-editor/program-editor-toolbox.css"].map(file => readFile(file, "utf8")));
    await page.addStyleTag({ content: css.join("\n") + "\nbody{margin:0;font-family:system-ui;background:var(--ad-bg-canvas);color:var(--ad-fg-primary)}#root{height:100vh;}" });
    await page.addScriptTag({ content: result.outputFiles[0].text });
    const initial = await page.evaluate(() => (window as any).fixture.read("a").content);
    const popup = page.locator(".step-editor-popup"), help = page.getByRole("dialog", { name: /^模块帮助/ });
    await page.locator('[data-step-id="a-help"]').dblclick();
    const trigger = popup.getByRole("button", { name: "模块帮助", exact: true });
    await trigger.waitFor();
    assert.deepEqual(docs, [], "opening parameters must not prefetch help");
    await popup.getByRole("textbox").first().fill("kept draft");
    await trigger.click(); await help.waitFor();
    assert.equal(await help.locator("iframe").getAttribute("src"), "https://docs.example.test/a?mode=one&embed=1#parameters");
    await help.locator("iframe").waitFor();
    await page.waitForFunction(() => !document.querySelector(".module-help-preview__loading"));
    await help.getByRole("button", { name: "在浏览器打开", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.opened), [["https://docs.example.test/a?mode=one#parameters", "_blank", "noopener,noreferrer"]]);
    await page.keyboard.press("Alt+s");
    assert.equal(await popup.count(), 1, "help suspends the parent apply accelerator");
    assert.equal(await page.evaluate(() => (window as any).fixture.read("a").content), initial);
    await page.frameLocator(".module-help-preview iframe").getByRole("textbox", { name: "Help search" }).focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.closest(".module-help-preview-backdrop") != null), true, "Tab from the cross-origin frame stays inside the native modal");
    await page.frameLocator(".module-help-preview iframe").getByRole("textbox", { name: "Help search" }).focus();
    // Cross-origin frame keyboard events stay in that browsing context (also in the native source).
    // Tab returns to the modal header; Escape there dismisses only help.
    await page.keyboard.press("Escape");
    assert.equal(await help.count(), 1);
    await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
    await page.keyboard.press("Escape");
    await help.waitFor({ state: "hidden" });
    assert.equal(await help.count(), 0); assert.equal(await popup.count(), 1);
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
    assert.equal(await popup.getByRole("textbox").first().innerText(), "kept draft");
    await trigger.click();
    await mkdir("../.tmp", { recursive: true });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
      await page.screenshot({ path: "../.tmp/module-help-" + theme + ".png" });
    }
    await page.setViewportSize({ width: 380, height: 760 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: "../.tmp/module-help-narrow.png" });
    await help.getByRole("button", { name: "关闭模块帮助" }).click();
    await page.setViewportSize({ width: 1100, height: 850 });
    await trigger.click();
    await page.locator(".module-help-preview-backdrop").click({ position: { x: 2, y: 2 } });
    assert.equal(await help.count(), 0);
    await popup.getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "不保存", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.read("a").content), initial);
    for (const key of ["missing", "unsafe"]) {
      await page.locator('[data-step-id="a-' + key + '"]').dblclick();
      await popup.getByText("Draft text", { exact: true }).waitFor();
      assert.equal(await popup.getByRole("button", { name: "模块帮助", exact: true }).count(), 0);
      await popup.getByRole("button", { name: "取消", exact: true }).click();
    }
    await page.locator('[data-step-id="a-help"]').dblclick(); await trigger.click(); await help.waitFor(); await heldStarted;
    await page.evaluate(() => (window as any).fixture.switch("b"));
    await page.waitForFunction(() => !document.querySelector(".module-help-preview"));
    await page.locator('[data-step-id="b-help"]').dblclick(); await trigger.click(); await help.waitFor();
    releaseDocs!(); await heldFinished;
    assert.match(await help.locator("iframe").getAttribute("src") ?? "", /^https:\/\/docs.example.test\/b\?/);
    await page.keyboard.press("Escape"); await popup.getByRole("button", { name: "取消", exact: true }).click();
    await page.evaluate(() => (window as any).fixture.switch("a"));
    await popup.getByRole("button", { name: "取消", exact: true }).click();
    // An uncached schema deliberately replies after its owning document hides.
    await page.evaluate(() => { (window as any).fixture.delayA = true; });
    await page.locator('[data-step-id="a-late"]').dblclick();
    await page.waitForFunction(() => !!(window as any).fixture.releaseA);
    await page.evaluate(() => (window as any).fixture.switch("b"));
    await page.evaluate(() => (window as any).fixture.releaseA());
    await page.locator('[data-step-id="b-missing"]').dblclick();
    await popup.getByText("Draft text", { exact: true }).waitFor();
    assert.equal(await popup.getByRole("button", { name: "模块帮助", exact: true }).count(), 0);
    assert.equal(await help.count(), 0);
    assert.equal(await page.evaluate(() => (window as any).fixture.read("a").content), initial);
    assert.equal(await page.evaluate(() => (window as any).fixture.read("a").dirty), false);
    assert.equal(await page.evaluate(() => (window as any).fixture.read("b").dirty), false);
    assert.match(initial, /9223372036854775807/); assert.match(initial, /0\.1234567890123456789012345678/);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []);
    assert.deepEqual(errors, []); await page.evaluate(() => (window as any).fixture.dispose());
  } finally { await browser.close(); }
});

async function navigationFixture(sameOrigin = false) {
  const workspaceUrl = "https://workspace.example.test/editor";
  const helpOrigin = sameOrigin ? "https://workspace.example.test" : "https://docs.example.test";
  const source = fixture.replaceAll("https://docs.example.test", helpOrigin).replace(
    "window.open=(...args)=>{state.opened.push(args);return null;};",
    "const nativeOpen=window.open.bind(window);window.open=(...args)=>{state.opened.push(args);return nativeOpen(...args);};",
  );
  const bundle = await compileFixture(source);
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
  try {
    const context = await browser.newContext(), page = await context.newPage();
    page.setDefaultTimeout(8000);
    const pages: string[] = [], downloads: string[] = [], mainNavigations: string[] = [];
    context.on("page", popup => pages.push(popup.url()));
    page.on("download", download => downloads.push(download.suggestedFilename()));
    page.on("framenavigated", frame => { if (frame === page.mainFrame()) mainNavigations.push(frame.url()); });
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.href === workspaceUrl) return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
      if (url.hostname === "leave.example.test") return route.fulfill({ contentType: "text/html", body: "<h1>Workspace escaped</h1>" });
      if (url.origin === helpOrigin) {
        if (url.pathname === "/assets/help-runtime.js") return route.fulfill({ contentType: "application/javascript",
          body: "document.getElementById('scripts').textContent='Documentation scripts ready';" });
        if (url.pathname === "/file.txt") return route.fulfill({ contentType: "text/plain", headers: { "content-disposition": "attachment; filename=sample.txt" }, body: "sample" });
        if (url.pathname === "/inside") return route.fulfill({ contentType: "text/html", body: "<h1>Inside help page</h1>" });
        return route.fulfill({ contentType: "text/html", body: `
          <p id="scripts">Scripts pending</p><p id="parent-status"></p>
          <script src="${helpOrigin}/assets/help-runtime.js" defer></script>
          <a target="_top" href="https://leave.example.test/top">Leave workspace</a>
          <a target="_blank" href="https://leave.example.test/popup">Open help popup</a>
          <a download href="${helpOrigin}/file.txt">Download help sample</a>
          <a href="${helpOrigin}/inside">Next help page</a>
          <button onclick="try { parent.fixture.read('a'); document.getElementById('parent-status').textContent='Parent accessible'; } catch { document.getElementById('parent-status').textContent='Parent blocked'; }">Read workspace</button>
        ` });
      }
      return route.abort();
    });
    await page.addInitScript(() => {
      const activate = HTMLDialogElement.prototype.showModal;
      (window as any).helpDialogActivations = [];
      HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
        const frameAlreadyMounted = this.querySelector("iframe") !== null;
        activate.call(this);
        (window as any).helpDialogActivations.push({ frameAlreadyMounted, modal: this.matches(":modal") });
      };
    });
    await page.goto(workspaceUrl);
    const css = await Promise.all(["components/action-editor/action-editor-theme.css", "components/action-editor/action-editor.css", "components/action-editor/program-editor-toolbox.css"].map(file => readFile(file, "utf8")));
    await page.addStyleTag({ content: css.join("\n") + "\n#root{height:100vh;}" });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const initial = await page.evaluate(() => (window as any).fixture.read("a").content);
    await page.locator('[data-step-id="a-help"]').dblclick();
    const popup = page.locator(".step-editor-popup");
    await popup.getByRole("button", { name: "模块帮助", exact: true }).waitFor();
    await popup.getByRole("textbox").first().fill("unsaved navigation draft");
    await popup.getByRole("button", { name: "模块帮助", exact: true }).click();
    const frame = page.frameLocator(".module-help-preview iframe");
    await frame.getByText("Documentation scripts ready", { exact: true }).waitFor();
    return { browser, context, page, frame, initial, workspaceUrl, helpOrigin, pages, downloads, mainNavigations };
  } catch (error) { await browser.close(); throw error; }
}

test("module help sandbox blocks top navigation while documentation and explicit external open remain usable", { timeout: 45_000 }, async () => {
  const f = await navigationFixture();
  try {
    await f.frame.getByRole("link", { name: "Leave workspace", exact: true }).click();
    // Give real navigation/download events time to complete; escape URLs are fulfilled, never aborted.
    await f.page.waitForTimeout(300);
    assert.equal(f.page.url(), f.workspaceUrl, "a help target=_top link must not unload the workspace");
    assert.deepEqual(f.mainNavigations, [f.workspaceUrl]);
    assert.equal(await f.page.evaluate(() => (window as any).fixture.read("a").content), f.initial);
    const [external] = await Promise.all([f.context.waitForEvent("page"),
      f.page.getByRole("dialog", { name: /^模块帮助/ }).getByRole("button", { name: "在浏览器打开", exact: true }).click()]);
    await external.waitForURL(f.helpOrigin + "/a?mode=one#parameters");
    assert.equal(await external.evaluate(() => window.opener === null), true); await external.close();
    await f.frame.getByRole("link", { name: "Next help page", exact: true }).click();
    await f.frame.getByRole("heading", { name: "Inside help page" }).waitFor();
    await f.page.getByRole("button", { name: "关闭模块帮助" }).click();
    assert.equal(await f.page.locator(".step-editor-popup").getByRole("textbox").first().innerText(), "unsaved navigation draft");
  } finally { await f.browser.close(); }
});

test("module help sandbox blocks frame popups and downloads", { timeout: 45_000 }, async () => {
  const f = await navigationFixture();
  try {
    await f.frame.getByRole("link", { name: "Open help popup", exact: true }).click();
    await f.frame.getByRole("link", { name: "Download help sample", exact: true }).click();
    await f.page.waitForTimeout(300);
    assert.deepEqual(f.pages, [], "help content cannot open an escaping popup");
    assert.deepEqual(f.downloads, [], "help content cannot download into the workspace session");
    assert.equal(f.page.url(), f.workspaceUrl);
    assert.equal(await f.page.evaluate(() => (window as any).fixture.read("a").content), f.initial);
  } finally { await f.browser.close(); }
});

test("module help sandbox isolates same-origin help from the workspace", { timeout: 45_000 }, async () => {
  const f = await navigationFixture(true);
  try {
    assert.deepEqual(await f.page.evaluate(() => (window as any).helpDialogActivations),
      [{ frameAlreadyMounted: false, modal: true }], "activate the native modal before creating its child browsing context");
    assert.equal(await f.page.locator(".module-help-preview iframe").getAttribute("sandbox"), "allow-scripts");
    assert.equal(await f.frame.locator("body").evaluate(() => self.origin), "null");
    await f.frame.getByRole("button", { name: "Read workspace", exact: true }).click();
    await f.frame.getByText("Parent blocked", { exact: true }).waitFor();
    await f.frame.getByRole("link", { name: "Leave workspace", exact: true }).click();
    await f.page.waitForTimeout(300);
    assert.equal(f.page.url(), f.workspaceUrl);
    assert.equal(await f.page.evaluate(() => (window as any).fixture.read("a").content), f.initial);
  } finally { await f.browser.close(); }
});
