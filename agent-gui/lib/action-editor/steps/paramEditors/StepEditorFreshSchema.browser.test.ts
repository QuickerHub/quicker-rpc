import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium, type Locator, type Page } from "playwright";

// Real workspace/controller/popup and file hook; native IO, icons and the file debounce clock are fixtures.
const fixture = `
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{ProgramEditorTabWorkspace}from'@/components/action-editor/ProgramEditorTabWorkspace';
import{createDesignerCatalogPort}from'@/lib/action-editor/catalog/designerCatalogPort';
import{createProgramDocumentSession}from'@/lib/action-editor/document/programDocumentSession';
import{createProgramDocumentEditorController}from'@/lib/action-editor/program/programDocumentEditorController';
import{mapAgentSchemaToStepRunnerItem}from'@/lib/action-editor/api/stepRunnerSchemaMap';
import{inspectStepRunnerUiKnowledge}from'@/lib/action-editor/api/stepRunnerKnowledge';
const state=window.fixture={requests:[],unexpected:[],generation:{a:'Old',b:'B'},defer:false,fail:false,pending:[],withFile:!!window.withFileFixture,withTools:!!window.withToolsFixture,withKeyboard:false,fileHero:false,advanced:false,files:{a:'original file',b:'b original file'},writes:[],holdFileDebounce:false,heldTimers:new Map(),nextTimer:0};
const nativeSetTimeout=window.setTimeout.bind(window),nativeClearTimeout=window.clearTimeout.bind(window);
window.setTimeout=(callback,delay,...args)=>{if(state.holdFileDebounce&&delay===450){const id=--state.nextTimer;state.heldTimers.set(id,()=>callback(...args));return id;}return nativeSetTimeout(callback,delay,...args);};
window.clearTimeout=id=>{if(!state.heldTimers.delete(id))nativeClearTimeout(id);};
state.flushFileWrites=()=>{const callbacks=[...state.heldTimers.values()];state.heldTimers.clear();for(const callback of callbacks)callback();};
const ids={a:'abcdefab-cdef-4abc-8def-abcdefabcdef',b:'bbcdefab-cdef-4abc-8def-abcdefabcdef'};
const bindings={};state.knowledgeMode=window.knowledgeModeFixture;state.knowledgeRevision={a:'1',b:'2'};state.knowledgeReads={a:0,b:0};
function observation(owner){
 if(!state.knowledgeMode||state.knowledgeMode==='legacy')return {};
 const knowledge={schemaVersion:1,source:{provider:'qkrpc.step-runner',kind:state.knowledgeMode==='bundled'?'bundled-adapter':'runtime-definition',
  ...bindings[owner],adapterAssembly:'Fixture.Native.Adapter',adapterVersion:'unchanged-adapter'},
  schema:{format:state.knowledgeMode==='malformed'?'unrecognized-format':'qkrpc.ui-step-runner.v1',revision:'sha256:'+state.knowledgeRevision[owner].repeat(64)},
  requestedControlFieldValue:null,retrievedAt:new Date(Date.UTC(2026,9,26,0,0,state.knowledgeReads[owner]++)).toISOString(),nativeHelpLink:'https://docs.example.test/Old'};
 return inspectStepRunnerUiKnowledge({stepRunnerKey:'fixture:current',knowledge},{key:'fixture:current',hostBinding:bindings[owner]});
}
const runner=(label,full,advanced=state.advanced,fileHero=state.fileHero)=>mapAgentSchemaToStepRunnerItem({stepRunnerKey:'fixture:current',name:label+' module',helpLink:'https://docs.example.test/'+label,
 inputs:full?[{key:'text',title:label+' text',valueType:'Text',variableMode:1,defaultValue:label+' default',textTools:state.withTools?'EditInCodeWindow':undefined},...(state.withFile?[{key:'payload',title:'Script file',valueType:'Text',variableMode:0,isMultiLine:true,isAdvanced:advanced,defaultHighlightType:fileHero?'json':undefined}]:[]),...(state.withKeyboard?[{key:'hotkey',title:'Advanced keyboard',valueType:'Keyboard',variableMode:0,isAdvanced:true}]:[])]:[],outputs:[]});
window.fetch=async(input,init)=>{
 const url=String(input),body=JSON.parse(String(init?.body||'{}'));state.requests.push({url,body});
 if(url.startsWith('/api/workspace')){
  const query=new URL(url,'https://fixture.test').searchParams,path=String(body.path||query.get('path')||'').split(String.fromCharCode(92)).join('/');
  const owner=path.includes('/actions/a/')?'a':path.includes('/actions/b/')?'b':null;
  if(!owner||!path.endsWith('/files/script.txt'))throw Error('Unexpected file '+path);
  if((body.op||query.get('op'))==='read')return Response.json({ok:true,path,content:state.files[owner],truncated:false});
  if(body.op==='write'){state.writes.push({owner,path,content:body.content});state.files[owner]=body.content;return Response.json({ok:true,path});}
  throw Error('Unexpected workspace operation');
 }
 const owner=Object.keys(ids).find(k=>ids[k]===body.catalogContext?.expectedProjectBinding?.actionId);
 if(!owner)throw Error('No unbound request');
 if(url==='/api/step-runner/list')return Response.json({ok:true,items:[runner(state.generation[owner],false)]});
 if(url==='/api/step-runner/get'){
  const label=state.generation[owner],fail=state.fail,advanced=state.advanced,fileHero=state.fileHero,knowledge=observation(owner);
  if(state.defer&&owner==='a')await new Promise(resolve=>state.pending.push(resolve));
  if(fail)return new Response(JSON.stringify({ok:false,code:'CATALOG_REQUEST_FAILED',error:'fresh provider unavailable'}),{status:503});
  return Response.json({ok:true,item:{...runner(label,true,advanced,fileHero),...knowledge},source:'live'});
 }
 if(url==='/api/step-runner/summaries'||url==='/api/subprogram/list')return Response.json({ok:true,items:[]});
 state.unexpected.push({url,body});throw Error('Unexpected '+url);
};
const sessions={},controllers={},ports={},workspaces={};
for(const owner of ['a','b']){
 const source=JSON.stringify({steps:[{stepId:owner+'-one',stepRunnerKey:'fixture:current',inputParams:{text:{value:'original'},...(state.withFile?{payload:{file:'files/script.txt'}}:{})}}],variables:[],subPrograms:[],future:'KEEP_INT64'}).replace('"KEEP_INT64"','9223372036854775807');
 sessions[owner]=createProgramDocumentSession({content:source,identity:{documentKey:owner,projectBinding:null}});
 controllers[owner]=createProgramDocumentEditorController(sessions[owner],{isCurrent:()=>true,onChange:r=>{if(!r.ok)throw Error(r.error);state.redraw?.(x=>x+1);}});
 workspaces[owner]={cwd:'C:/fixture-only',projectDir:'C:/fixture-only/.quicker/actions/'+owner};
 bindings[owner]={hostInstanceId:'fresh-'+owner,hostSessionId:owner.repeat(32),endpoint:'QuickerRpc_User_'+'A'.repeat(24)+'_'+owner.repeat(32),protocolVersion:1,schemaVersion:1,hostKind:'v1',quickerVersion:'unchanged',capabilities:{}};
 ports[owner]=createDesignerCatalogPort({cwd:'C:/fixture-only',projectDirectory:'.quicker/actions/'+owner,expectedProjectBinding:{schemaVersion:1,kind:'action',actionId:ids[owner],hostBinding:bindings[owner]}});
}
state.read=owner=>sessions[owner].getState();state.snapshot=owner=>controllers[owner].getSnapshot();state.release=()=>{const pending=state.pending.splice(0);for(const resolve of pending)resolve();};
function App(){const[,redraw]=useState(0),[active,setActive]=useState('a');state.redraw=redraw;state.switch=setActive;return <>{['a','b'].map(owner=><section key={owner} style={{display:active===owner?'block':'none'}}><ProgramEditorTabWorkspace documentKey={owner} controller={controllers[owner]} catalogPort={ports[owner]} workspaceContext={workspaces[owner]} active={active===owner}/></section>)}</>;}
const root=createRoot(document.getElementById('root'));root.render(<App/>);state.dispose=()=>{root.unmount();Object.values(ports).forEach(p=>p.dispose());};
`;

let compilation: ReturnType<typeof build> | undefined;
async function compileFixture() {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  return compilation ??= build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", metafile: true, tsconfig: path.join(process.cwd(), "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"development"' }, loader: { ".css": "empty" },
    plugins: [{ name: "isolated-fresh-icons", setup(builder) {
      builder.onResolve({ filter: /^@iconify\/icons-mdi\// }, args => ({ path: require.resolve(args.path) }));
      builder.onResolve({ filter: /shared\/IconControl$/ }, args => ({ path: args.path, namespace: "fixture-icon" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture-icon" }, () => ({ contents: "export function IconControl(){return null}", loader: "js" }));
    } }] });
}
async function openFixture(withFile = false, keepOpen = false, withTools = false, knowledgeMode?: string) {
  const result = await compileFixture();
  assert.ok(Object.keys(result.metafile!.inputs).every(file => !/(?:^|\/)lib\/(?:db\/|qkrpc\.ts|llm-config)/.test(file.replaceAll("\\", "/"))));
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } }), errors: string[] = [];
    page.setDefaultTimeout(8000);
    page.on("pageerror", e => errors.push(e.message)); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.route("**/*", route => route.abort()); await page.setContent('<div id="root"></div>');
    const css = await Promise.all(["components/action-editor/action-editor-theme.css", "components/action-editor/action-editor.css", "components/action-editor/program-editor-toolbox.css"].map(file => readFile(file, "utf8")));
    await page.addStyleTag({ content: css.join("\n") + "\nbody{margin:0;font-family:system-ui}#root{height:100vh;}" });
    await page.evaluate(flags => { (window as any).withFileFixture=flags.withFile; (window as any).withToolsFixture=flags.withTools; (window as any).knowledgeModeFixture=flags.knowledgeMode; }, {withFile,withTools,knowledgeMode});
    await page.addScriptTag({ content: result.outputFiles[0].text });
    await page.locator('[data-step-id="a-one"]').dblclick();
    await popup(page).getByText("Old text", { exact: true }).waitFor();
    await page.waitForFunction(() => !(document.querySelector('.step-editor-popup-btn.primary') as HTMLButtonElement)?.disabled);
    if (!keepOpen) {
      await popup(page).getByRole("button", { name: "取消", exact: true }).click();
      await popup(page).waitFor({ state: "hidden" });
    }
    return { browser, page, errors };
  } catch (error) { await browser.close(); throw error; }
}
const popup = (page: Page) => page.locator(".step-editor-popup");
const confirm = (page: Page) => popup(page).getByRole("button", { name: "确定", exact: true });
const knowledge = (page: Page) => popup(page).getByRole("region", { name: "参数定义来源", exact: true });
async function hidePopup(page: Page) {
  await page.evaluate(() => (window as any).fixture.switch("b"));
  await popup(page).waitFor({ state: "hidden" });
}
async function resumePopup(page: Page) {
  await page.evaluate(() => (window as any).fixture.switch("a"));
  await popup(page).waitFor({ state: "visible" });
}
async function type(field: Locator, value: string) {
  await field.click(); await field.press("Control+A"); await field.pressSequentially(value); assert.equal(await field.innerText(), value);
}
async function finish(page: Page, errors: string[]) {
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []); assert.deepEqual(errors, []);
  await page.evaluate(() => (window as any).fixture.dispose());
}

test("metadata-only native refresh updates the owned receipt without replacing an unblurred draft or history", { timeout: 60_000 }, async () => {
  const { browser, page, errors } = await openFixture(false, true, false, "native");
  try {
    const initial = await page.evaluate(() => (window as any).fixture.read("a").content);
    await knowledge(page).getByText("原生运行时", { exact: true }).waitFor();
    const initialReadTime = await knowledge(page).locator("dd").last().textContent();
    const field = popup(page).getByRole("textbox");
    await field.evaluate(node => { (window as any).fixture.fieldNode=node; });
    await type(field, "unblurred draft survives metadata-only read");
    await hidePopup(page);
    await page.evaluate(() => { const f=(window as any).fixture; f.defer=true; f.knowledgeRevision.a="3"; });
    await resumePopup(page);
    await page.waitForFunction(() => (window as any).fixture.pending.length > 0);
    assert.match(await knowledge(page).innerText(), /读取中/);
    assert.doesNotMatch(await knowledge(page).innerText(), /原生运行时|fresh-a/);
    assert.equal(await confirm(page).isDisabled(), true);
    await page.evaluate(() => { const f=(window as any).fixture; f.defer=false; f.release(); });
    await knowledge(page).getByText("原生运行时", { exact: true }).waitFor();
    await knowledge(page).locator("summary").first().click();
    assert.match(await knowledge(page).innerText(), new RegExp("sha256:"+"3".repeat(64)));
    assert.notEqual(await knowledge(page).locator("dd").last().textContent(), initialReadTime);
    assert.match(await knowledge(page).innerText(), /qkrpc.ui-step-runner.v1/);
    assert.equal(await field.evaluate(node => node===(window as any).fixture.fieldNode), true);
    assert.equal(await field.innerText(), "unblurred draft survives metadata-only read");
    assert.equal(await page.evaluate(() => (window as any).fixture.read("a").content), initial);
    const settledReads = await page.evaluate(() => (window as any).fixture.knowledgeReads.a);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => (window as any).fixture.knowledgeReads.a), settledReads, "receipt timestamps must not create a fetch loop");
    await confirm(page).click();
    await page.waitForFunction(() => (window as any).fixture.snapshot("a").steps[0].inputParams.text.value === "unblurred draft survives metadata-only read");
    await page.locator('[data-program-workspace="a"]').getByRole("toolbar", { name: "文档历史" }).getByTitle("撤销 (Ctrl+Z)", { exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.read("a").content), initial);
    await finish(page, errors);
  } finally { await browser.close(); }
});

test("native source failures and late reads cannot retain a current badge or help, and another owner stays separate", { timeout: 60_000 }, async () => {
  const { browser, page, errors } = await openFixture(false, true, false, "native");
  try {
    await type(popup(page).getByRole("textbox"), "owned draft");
    await hidePopup(page);
    await page.evaluate(() => { const f=(window as any).fixture; f.defer=true; f.knowledgeRevision.a="4"; });
    await resumePopup(page);
    await page.waitForFunction(() => (window as any).fixture.pending.length > 0);
    await hidePopup(page);
    await page.evaluate(() => { const f=(window as any).fixture; f.defer=false; f.fail=true; });
    await resumePopup(page);
    await knowledge(page).getByText("当前读取失败", { exact: true }).waitFor();
    await page.evaluate(() => (window as any).fixture.release());
    await knowledge(page).locator("summary").first().click();
    assert.match(await knowledge(page).innerText(), /fresh provider unavailable/);
    assert.doesNotMatch(await knowledge(page).innerText(), /fresh-a|sha256|原生运行时/);
    assert.equal(await confirm(page).isDisabled(), true);
    assert.equal(await popup(page).getByRole("button", { name: "模块帮助", exact: true }).isDisabled(), true);
    assert.equal(await popup(page).getByRole("textbox").innerText(), "owned draft");
    await hidePopup(page);
    await page.evaluate(() => { const f=(window as any).fixture; f.fail=false; f.knowledgeRevision.a="5"; });
    await page.locator('[data-step-id="b-one"]').dblclick();
    await knowledge(page).getByText("原生运行时", { exact: true }).waitFor();
    await knowledge(page).locator("summary").first().click();
    assert.match(await knowledge(page).innerText(), /fresh-b/);
    assert.doesNotMatch(await knowledge(page).innerText(), /fresh-a/);
    await popup(page).getByRole("button", { name: "取消", exact: true }).click();
    await resumePopup(page);
    await knowledge(page).getByText("原生运行时", { exact: true }).waitFor();
    await knowledge(page).locator("summary").first().click();
    assert.match(await knowledge(page).innerText(), new RegExp("sha256:"+"5".repeat(64)));
    assert.equal(await popup(page).getByRole("textbox").innerText(), "owned draft");
    assert.equal(await confirm(page).isEnabled(), true);
    await finish(page, errors);
  } finally { await browser.close(); }
});

test("live transport with absent or unrecognized provenance remains unknown without changing parameter permission", { timeout: 60_000 }, async () => {
  const { browser, page, errors } = await openFixture(false, true, false, "legacy");
  try {
    await knowledge(page).getByText("来源未知", { exact: true }).waitFor();
    assert.equal(await confirm(page).isEnabled(), true);
    for (const mode of ["malformed", "bundled", "legacy"]) {
      await hidePopup(page);
      await page.evaluate(value => { (window as any).fixture.knowledgeMode=value; }, mode);
      await resumePopup(page);
      await knowledge(page).getByText(mode === "bundled" ? "内置适配" : "来源未知", { exact: true }).waitFor();
      await knowledge(page).locator("summary").first().click();
      if (mode === "legacy") assert.doesNotMatch(await knowledge(page).innerText(), /2026-|sha256|fresh-a/);
      assert.equal(await confirm(page).isEnabled(), true);
    }
    await finish(page, errors);
  } finally { await browser.close(); }
});

test("native provenance fits the existing popup in narrow dark/light layouts with keyboard details", { timeout: 60_000 }, async () => {
  const { browser, page, errors } = await openFixture(false, true, false, "native");
  try {
    const directory = process.env.NATIVE_KNOWLEDGE_SCREENSHOTS_DIR;
    if (directory) await mkdir(directory, { recursive: true });
    for (const width of [1100, 420]) for (const theme of ["dark", "light"]) {
      await page.setViewportSize({ width, height: 850 });
      await page.evaluate(value => { document.documentElement.dataset.theme=value; }, theme);
      const summary = knowledge(page).locator("summary").first();
      await summary.focus(); await page.keyboard.press("Enter");
      assert.equal(await knowledge(page).locator("details").first().getAttribute("open"), "");
      assert.match(await knowledge(page).innerText(), /fresh-a/);
      const visible = await knowledge(page).evaluate(element => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + 20, rect.top + 10);
        return { overflow: element.scrollWidth > element.clientWidth, inViewport: rect.left >= 0 && rect.right <= innerWidth,
          unobscured: element.contains(hit), foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor };
      });
      assert.equal(visible.overflow, false, `${width}/${theme}`);
      assert.equal(visible.inViewport && visible.unobscured, true, `${width}/${theme}`);
      assert.notEqual(visible.foreground, visible.background);
      assert.equal(await confirm(page).isVisible(), true);
      assert.equal(await popup(page).getByRole("textbox").isVisible(), true);
      if (directory) await page.screenshot({ path: path.join(directory, `native-knowledge-${width}-${theme}.png`) });
      await summary.focus(); await page.keyboard.press("Enter");
    }
    await finish(page, errors);
  } finally { await browser.close(); }
});

test("fresh native schema replaces populated definitions without replacing the human draft or document history", { timeout: 60_000 }, async () => {
  const { browser, page, errors } = await openFixture(false, true);
  try {
    const initial = await page.evaluate(() => (window as any).fixture.read("a").content);
    await page.evaluate(() => (window as any).fixture.switch("b"));
    await popup(page).waitFor({ state: "hidden" });
    await page.locator('[data-program-workspace="b"]').waitFor({ state: "visible" });
    await page.evaluate(() => { const f=(window as any).fixture; f.defer=true; f.generation.a="Current"; f.switch("a"); });
    await page.waitForFunction(() => (window as any).fixture.pending.length > 0);
    assert.equal(await confirm(page).isDisabled(), true);
    const field = popup(page).getByRole("textbox");
    await field.evaluate(node => { (window as any).fixture.fieldNode=node; });
    await type(field, "human draft while native read waits");
    assert.equal(await page.evaluate(() => (window as any).fixture.read("a").content), initial);
    await page.evaluate(() => { const f=(window as any).fixture; f.defer=false; f.release(); });
    await popup(page).getByText("Current text", { exact: true }).waitFor();
    assert.equal(await field.evaluate(node => node===(window as any).fixture.fieldNode), true);
    assert.equal(await field.innerText(), "human draft while native read waits");
    await confirm(page).click();
    await page.waitForFunction(() => (window as any).fixture.snapshot("a").steps[0].inputParams.text.value === "human draft while native read waits");
    const history = page.locator('[data-program-workspace="a"]').getByRole("toolbar", { name: "文档历史" });
    await history.getByTitle("撤销 (Ctrl+Z)", { exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.read("a").content), initial);
    await history.getByTitle("重做 (Ctrl+Y / Ctrl+Shift+Z)", { exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot("a").steps[0].inputParams.text.value), "human draft while native read waits");
    await finish(page, errors);
  } finally { await browser.close(); }
});

test("a failed fresh popup read reports failure instead of confirming previous successful definitions", { timeout: 60_000 }, async () => {
  const { browser, page, errors } = await openFixture(false, true);
  try {
    const initial = await page.evaluate(() => (window as any).fixture.read("a").content);
    await type(popup(page).getByRole("textbox"), "kept on failure");
    await page.evaluate(() => (window as any).fixture.switch("b"));
    await popup(page).waitFor({ state: "hidden" });
    await page.locator('[data-program-workspace="b"]').waitFor({ state: "visible" });
    await page.evaluate(() => { const f=(window as any).fixture; f.fail=true; f.switch("a"); });
    await popup(page).getByRole("alert").filter({ hasText: "fresh provider unavailable" }).waitFor();
    assert.equal(await popup(page).getByRole("textbox").innerText(), "kept on failure");
    assert.equal(await confirm(page).isDisabled(), true);
    await popup(page).getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "不保存", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.read("a").content), initial);
    await finish(page, errors);
  } finally { await browser.close(); }
});

test("fresh grouping changes retain the external file editor and its pending single write", { timeout: 60_000 }, async () => {
  const { browser, page, errors } = await openFixture(true, true, false, "native");
  try {
    const initial = await page.evaluate(() => (window as any).fixture.read("a").content);
    const fileField = () => popup(page).locator(".step-param-row").filter({ has: page.getByText("Script file", { exact: true }) }).getByRole("textbox");
    await page.waitForFunction(() => [...document.querySelectorAll('.step-editor-popup [role="textbox"]')].some(node=>node.textContent==='original file'));
    await page.evaluate(() => (window as any).fixture.switch("b"));
    await popup(page).waitFor({ state: "hidden" });
    await page.locator('[data-program-workspace="b"]').waitFor({ state: "visible" });
    await page.evaluate(() => { const f=(window as any).fixture; f.defer=true; f.advanced=true; f.generation.a="Grouped"; f.holdFileDebounce=true; f.switch("a"); });
    await page.waitForFunction(() => (window as any).fixture.pending.length > 0);
    await fileField().evaluate(node => { (window as any).fixture.fileNode=node; });
    await type(fileField(), "pending external file draft");
    assert.equal(await page.evaluate(() => (window as any).fixture.heldTimers.size), 1);
    await page.evaluate(() => { const f=(window as any).fixture; f.defer=false; f.release(); });
    await popup(page).getByText("Grouped text", { exact: true }).waitFor();
    const advanced = popup(page).getByRole("region", { name: "高级", exact: true });
    if (await advanced.getByRole("button", { name: "高级", exact: true }).getAttribute("aria-expanded") === "false")
      await advanced.getByRole("button", { name: "高级", exact: true }).click();
    assert.equal(await fileField().evaluate(node => node===(window as any).fixture.fileNode), true);
    assert.equal(await fileField().innerText(), "pending external file draft");
    assert.equal(await page.evaluate(() => (window as any).fixture.heldTimers.size), 1, "layout changes must not cancel the actual file hook's pending callback");
    await hidePopup(page);
    await page.evaluate(() => { (window as any).fixture.knowledgeRevision.a="6"; });
    await resumePopup(page);
    await knowledge(page).getByText("原生运行时", { exact: true }).waitFor();
    await knowledge(page).locator("summary").first().click();
    assert.match(await knowledge(page).innerText(), new RegExp("sha256:"+"6".repeat(64)));
    assert.equal(await fileField().evaluate(node => node===(window as any).fixture.fileNode), true, "metadata-only refresh retains the file editor instance");
    assert.equal(await fileField().innerText(), "pending external file draft");
    assert.equal(await page.evaluate(() => (window as any).fixture.heldTimers.size), 1, "metadata-only refresh retains the pending file write");
    await knowledge(page).locator("summary").first().click();
    await page.evaluate(() => (window as any).fixture.flushFileWrites());
    await page.waitForFunction(() => (window as any).fixture.writes.length===1);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.writes.map((x:any)=>({owner:x.owner,content:x.content}))), [{owner:"a",content:"pending external file draft"}]);
    assert.equal(await page.evaluate(() => (window as any).fixture.read("a").content), initial);
    await mkdir("../.tmp", { recursive: true });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(value => { document.documentElement.dataset.theme=value; }, theme);
      await page.screenshot({ path: "../.tmp/fresh-fields-"+theme+".png" });
    }
    await page.setViewportSize({ width: 380, height: 760 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: "../.tmp/fresh-fields-narrow.png" });
    await finish(page, errors);
  } finally { await browser.close(); }
});

test("fresh native layout moves one pending file owner through preview, full tab and advanced grouping", { timeout: 60_000 }, async () => {
  const { browser, page, errors } = await openFixture(true, true);
  try {
    const initial = await page.evaluate(() => (window as any).fixture.read("a").content);
    const fileField = () => popup(page).locator(".step-param-row").filter({ has: page.getByText("Script file", { exact: true }) }).getByRole("textbox");
    await page.waitForFunction(() => [...document.querySelectorAll('.step-editor-popup [role="textbox"]')].some(node=>node.textContent==='original file'));
    await fileField().evaluate(node => { (window as any).fixture.fileNode=node; });
    await page.evaluate(() => (window as any).fixture.switch("b"));
    await popup(page).waitFor({state:"hidden"});
    await page.locator('[data-program-workspace="b"]').waitFor({state:"visible"});
    await page.evaluate(() => { const f=(window as any).fixture; f.fileHero=true; f.defer=true; f.holdFileDebounce=true; f.switch("a"); });
    await page.waitForFunction(() => (window as any).fixture.pending.length>0);
    await type(fileField(), "one pending file owner across native layouts");
    assert.equal(await page.evaluate(() => (window as any).fixture.heldTimers.size), 1);
    await page.evaluate(() => { const f=(window as any).fixture; f.defer=false; f.release(); });
    const fileTab = () => popup(page).getByRole("tab", {name:"Script file",exact:true});
    await fileTab().waitFor();
    assert.equal(await fileField().evaluate(node => node===(window as any).fixture.fileNode), true);
    await fileTab().click();
    assert.equal(await fileField().evaluate(node => node===(window as any).fixture.fileNode), true);
    assert.equal(await fileField().innerText(), "one pending file owner across native layouts");
    await page.evaluate(() => (window as any).fixture.switch("b"));
    await popup(page).waitFor({state:"hidden"});
    await page.locator('[data-program-workspace="b"]').waitFor({state:"visible"});
    await page.evaluate(() => { const f=(window as any).fixture; f.fileHero=false; f.advanced=true; f.generation.a="Regrouped"; f.defer=true; f.switch("a"); });
    await page.waitForFunction(() => (window as any).fixture.pending.length>0);
    assert.equal(await confirm(page).isDisabled(), true);
    await page.evaluate(() => { const f=(window as any).fixture; f.defer=false; f.release(); });
    await popup(page).getByText("Regrouped text", {exact:true}).waitFor();
    assert.equal(await fileTab().count(), 0);
    const advanced=popup(page).getByRole("region", {name:"高级",exact:true});
    if(await advanced.getByRole("button", {name:"高级",exact:true}).getAttribute("aria-expanded")==="false")
      await advanced.getByRole("button", {name:"高级",exact:true}).click();
    assert.equal(await fileField().evaluate(node => node===(window as any).fixture.fileNode), true);
    assert.equal(await fileField().innerText(), "one pending file owner across native layouts");
    assert.equal(await page.evaluate(() => (window as any).fixture.heldTimers.size), 1);
    await page.evaluate(() => (window as any).fixture.flushFileWrites());
    await page.waitForFunction(() => (window as any).fixture.writes.length===1);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.writes.map((x:any)=>({owner:x.owner,content:x.content}))), [{owner:"a",content:"one pending file owner across native layouts"}]);
    assert.equal(await page.evaluate(() => (window as any).fixture.read("a").content), initial);
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot("a").steps[0].inputParams.payload.file), "files/script.txt");
    await finish(page, errors);
  } finally { await browser.close(); }
});

test("collapsing an owned parameter section stops its retained keyboard capture", { timeout: 60_000 }, async () => {
  const { browser, page, errors } = await openFixture(false, true);
  try {
    const initial=await page.evaluate(() => (window as any).fixture.read("a").content);
    await page.evaluate(() => (window as any).fixture.switch("b"));
    await popup(page).waitFor({state:"hidden"});
    await page.locator('[data-program-workspace="b"]').waitFor({state:"visible"});
    await page.evaluate(() => { const f=(window as any).fixture; f.withKeyboard=true; f.generation.a="Keyboard"; f.switch("a"); });
    await popup(page).getByText("Keyboard text", {exact:true}).waitFor();
    const advanced=popup(page).getByRole("region", {name:"高级",exact:true});
    const header=advanced.getByRole("button", {name:"高级",exact:true});
    if(await header.getAttribute("aria-expanded")==="false") await header.click();
    const keyboard=()=>advanced.locator(".step-param-row").filter({has:page.getByText("Advanced keyboard",{exact:true})});
    const original=await keyboard().locator(".keyboard-param-keys-label").getAttribute("title");
    await keyboard().getByRole("button", {name:"录制",exact:true}).click();
    await keyboard().getByRole("button", {name:"记录中…",exact:true}).waitFor();
    await header.click();
    const text=popup(page).locator(".step-param-row").filter({has:page.getByText("Keyboard text",{exact:true})}).getByRole("textbox");
    await type(text,"visible field remains independent");
    await header.click();
    await keyboard().getByRole("button", {name:"录制",exact:true}).waitFor();
    assert.equal(await keyboard().locator(".keyboard-param-keys-label").getAttribute("title"),original);
    assert.equal(await page.evaluate(() => (window as any).fixture.read("a").content),initial);
    await finish(page,errors);
  } finally { await browser.close(); }
});

test("reactivating a retained popup reads current schema while keeping its unconfirmed draft", { timeout: 60_000 }, async () => {
  const { browser, page, errors } = await openFixture();
  try {
    const initial = await page.evaluate(() => (window as any).fixture.read("a").content);
    await page.locator('[data-step-id="a-one"]').dblclick();
    await page.waitForFunction(() => !(document.querySelector('.step-editor-popup-btn.primary') as HTMLButtonElement)?.disabled);
    await type(popup(page).getByRole("textbox"), "retained human draft");
    await page.evaluate(() => (window as any).fixture.switch("b"));
    await popup(page).waitFor({ state: "hidden" });
    await page.locator('[data-program-workspace="b"]').waitFor({ state: "visible" });
    await page.evaluate(() => { const f=(window as any).fixture; f.generation.a="Activated"; f.defer=true; f.switch("a"); });
    await page.waitForFunction(() => (window as any).fixture.pending.length > 0);
    assert.equal(await confirm(page).isDisabled(), true);
    assert.equal(await popup(page).getByRole("textbox").innerText(), "retained human draft");
    await page.evaluate(() => { const f=(window as any).fixture; f.defer=false; f.release(); });
    await popup(page).getByText("Activated text", { exact: true }).waitFor();
    assert.equal(await popup(page).getByRole("textbox").innerText(), "retained human draft");
    assert.equal(await confirm(page).isEnabled(), true);
    assert.equal(await page.evaluate(() => (window as any).fixture.read("a").content), initial);
    await finish(page, errors);
  } finally { await browser.close(); }
});

test("cancelled earlier native schema cannot replace a newer same-owner popup read", { timeout: 60_000 }, async () => {
  const { browser, page, errors } = await openFixture();
  try {
    await page.evaluate(() => { const f=(window as any).fixture; f.defer=true; f.generation.a="Late"; });
    await page.locator('[data-step-id="a-one"]').dblclick();
    await page.waitForFunction(() => (window as any).fixture.pending.length > 0);
    await popup(page).getByRole("button", { name: "取消", exact: true }).click();
    await page.evaluate(() => { const f=(window as any).fixture; f.defer=false; f.generation.a="New"; });
    await page.locator('[data-step-id="a-one"]').dblclick();
    await popup(page).getByText("New text", { exact: true }).waitFor();
    await type(popup(page).getByRole("textbox"), "new owned draft");
    await page.evaluate(() => (window as any).fixture.release());
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await popup(page).getByText("Late text", { exact: true }).count(), 0);
    assert.equal(await popup(page).getByRole("textbox").innerText(), "new owned draft");
    assert.equal(await confirm(page).isEnabled(), true);
    await finish(page, errors);
  } finally { await browser.close(); }
});

test("inactive retained fields park nested dialogs and stop their shortcuts without losing file or dialog drafts", { timeout: 60_000 }, async () => {
  const { browser, page, errors } = await openFixture(true, true, true);
  try {
    const initial = await page.evaluate(() => (window as any).fixture.read("a").content);
    const fileField = () => popup(page).locator(".step-param-row").filter({ has: page.getByText("Script file", { exact: true }) }).getByRole("textbox");
    await page.waitForFunction(() => [...document.querySelectorAll('.step-editor-popup [role="textbox"]')].some(node=>node.textContent==='original file'));
    await fileField().evaluate(node => { (window as any).fixture.fileNode=node; });
    await popup(page).getByRole("button", { name: "在编辑器中修改", exact: true }).click();
    const nested = page.locator(".text-tool-dialog");
    await nested.waitFor({ state: "visible" });
    await type(nested.getByRole("textbox"), "unconfirmed nested A draft");
    await page.evaluate(() => (window as any).fixture.switch("b"));
    await nested.waitFor({ state: "hidden" });
    await page.locator('[data-program-workspace="b"]').waitFor({ state: "visible" });
    assert.equal(await page.locator(".text-tool-dialog-backdrop").count(), 0, "inactive portals must leave the active document body");
    await page.locator('[data-step-id="b-one"]').dblclick();
    await popup(page).getByText("B text", { exact: true }).waitFor();
    const bField = popup(page).locator(".step-param-row").filter({ has: page.getByText("B text", { exact: true }) }).getByRole("textbox");
    await type(bField, "B owned draft");
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", {key:"Enter",ctrlKey:true,bubbles:true})));
    await page.keyboard.press("Escape");
    await page.getByRole("alertdialog").getByRole("button", { name: "不保存", exact: true }).click();
    await page.evaluate(() => (window as any).fixture.switch("a"));
    await nested.waitFor({ state: "visible" });
    assert.equal(await nested.getByRole("textbox").innerText(), "unconfirmed nested A draft");
    assert.equal(await fileField().evaluate(node => node===(window as any).fixture.fileNode), true);
    await nested.getByRole("button", {name:"取消",exact:true}).click();
    const aField = popup(page).locator(".step-param-row").filter({ has: page.getByText("Old text", { exact: true }) }).getByRole("textbox");
    assert.equal(await aField.innerText(), "original");
    assert.equal(await page.evaluate(() => (window as any).fixture.read("a").content), initial);
    await finish(page, errors);
  } finally { await browser.close(); }
});
