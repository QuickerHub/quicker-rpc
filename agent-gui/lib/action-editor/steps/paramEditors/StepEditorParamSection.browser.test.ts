import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium, type Locator } from "playwright";

// Real parameter fields, document/controller and workspace; fake bound host responses only.
const fixture = `
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{ProgramEditorTabWorkspace}from'@/components/action-editor/ProgramEditorTabWorkspace';
import{createDesignerCatalogPort}from'@/lib/action-editor/catalog/designerCatalogPort';
import{createProgramDocumentSession}from'@/lib/action-editor/document/programDocumentSession';
import{createProgramDocumentEditorController}from'@/lib/action-editor/program/programDocumentEditorController';
import{mapAgentSchemaToStepRunnerItem}from'@/lib/action-editor/api/stepRunnerSchemaMap';
const state=window.fixture={requests:[],unexpected:[],releaseLate:null};
const ids={a:'abcdefab-cdef-4abc-8def-abcdefabcdef',b:'bbcdefab-cdef-4abc-8def-abcdefabcdef'};
const keys=['short','long','plain','late'];
const runner=(kind,full)=>mapAgentSchemaToStepRunnerItem({stepRunnerKey:'sys:section-'+kind,name:kind+' step',
 inputs:full?[{key:'text',title:'General text',valueType:'Text',variableMode:1},...(kind==='plain'?[]:Array.from({length:kind==='long'?3:1},(_,i)=>({key:'adv'+i,title:'Advanced '+i,valueType:'Text',variableMode:1,isAdvanced:true})))]:[],
 outputs:full&&kind!=='plain'?[{key:'result',title:'Regular output',valueType:'Text'},{key:'advResult',title:'Advanced output',valueType:'Text',isAdvanced:true}]:[]});
window.fetch=async(input,init)=>{
 const url=String(input),body=JSON.parse(String(init?.body||'{}'));state.requests.push({url,body});
 const owner=Object.keys(ids).find(k=>ids[k]===body.catalogContext?.expectedProjectBinding?.actionId);
 if(!owner)throw Error('No unbound requests');
 if(url==='/api/step-runner/list')return Response.json({ok:true,items:keys.map(k=>runner(k,false))});
 if(url==='/api/step-runner/get'){
   if(owner==='a'&&body.key==='sys:section-late')await new Promise(resolve=>state.releaseLate=resolve);
   return Response.json({ok:true,item:runner(body.key.slice('sys:section-'.length),true)});
 }
 if(url==='/api/step-runner/summaries'||url==='/api/subprogram/list')return Response.json({ok:true,items:[]});
 state.unexpected.push({url,body});throw Error('Unexpected '+url);
};
const sessions={},controllers={},ports={};
for(const owner of ['a','b']){
 const source=JSON.stringify({steps:keys.map(k=>({stepId:owner+'-'+k,stepRunnerKey:'sys:section-'+k,inputParams:{text:{value:'original'},adv0:{value:'advanced original'}},outputParams:{result:'text_out',advResult:'text_out'}})),variables:[{id:'text-var',key:'text_out',varType:0}],subPrograms:[],futureRoot:'KEEP_INT64',futureDecimal:'KEEP_DECIMAL'}).replace('"KEEP_INT64"','9223372036854775807').replace('"KEEP_DECIMAL"','0.1234567890123456789012345678');
 sessions[owner]=createProgramDocumentSession({content:source,identity:{documentKey:owner,projectBinding:null}});
 controllers[owner]=createProgramDocumentEditorController(sessions[owner],{isCurrent:()=>true,onChange:r=>{if(!r.ok)throw Error(r.error);state.redraw?.(x=>x+1);}});
 ports[owner]=createDesignerCatalogPort({cwd:'C:/fixture-only',projectDirectory:'.quicker/actions/'+owner,expectedProjectBinding:{schemaVersion:1,kind:'action',actionId:ids[owner],hostBinding:{hostInstanceId:'sections-'+owner,hostSessionId:owner.repeat(32),endpoint:'QuickerRpc_User_'+'A'.repeat(24)+'_'+owner.repeat(32),protocolVersion:1,schemaVersion:1,hostKind:'v1',quickerVersion:'fake-only',capabilities:{}}}});
}
state.read=owner=>sessions[owner].getState();state.snapshot=owner=>controllers[owner].getSnapshot();
function App(){const[,redraw]=useState(0),[active,setActive]=useState('a');state.redraw=redraw;state.switch=setActive;return <>{['a','b'].map(owner=><section key={owner} style={{display:active===owner?'block':'none'}}><ProgramEditorTabWorkspace documentKey={owner} controller={controllers[owner]} catalogPort={ports[owner]} active={active===owner}/></section>)}</>;}
const root=createRoot(document.getElementById('root'));root.render(<App/>);state.dispose=()=>{root.unmount();Object.values(ports).forEach(p=>p.dispose());};
`;

async function compileFixture() {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  return build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", metafile: true, tsconfig: path.join(process.cwd(), "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"development"' }, loader: { ".css": "empty" },
    plugins: [{ name: "isolated-sections-icons", setup(builder) {
      builder.onResolve({ filter: /^@iconify\/icons-mdi\// }, args => ({ path: require.resolve(args.path) }));
      builder.onResolve({ filter: /shared\/IconControl$/ }, args => ({ path: args.path, namespace: "fixture-icon" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture-icon" }, () => ({ contents: "export function IconControl(){return null}", loader: "js" }));
    } }] });
}

async function replaceEditorText(field: Locator, value: string) {
  // Keyboard commands update CodeMirror's selection/document, not just its DOM.
  await field.click();
  await field.press("ControlOrMeta+A");
  await field.pressSequentially(value);
  assert.equal(await field.innerText(), value);
}

test("native parameter sections preserve drafts, hidden values, history and document owners", { timeout: 60_000 }, async () => {
  const result = await compileFixture();
  assert.ok(Object.keys(result.metafile!.inputs).every(file => !/(?:^|\/)lib\/(?:db\/|qkrpc\.ts|llm-config)/.test(file.replaceAll("\\", "/"))));
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } }), errors: string[] = [];
    page.setDefaultTimeout(8000);
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.route("**/*", route => route.abort());
    await page.setContent('<div id="root"></div>');
    const css = await Promise.all(["components/action-editor/action-editor-theme.css", "components/action-editor/action-editor.css", "components/action-editor/program-editor-toolbox.css"].map(file => readFile(file, "utf8")));
    await page.addStyleTag({ content: css.join("\n") + "\nbody{margin:0;font-family:system-ui;background:var(--ad-bg-canvas);color:var(--ad-fg-primary)}#root{height:100vh;}" });
    await page.addScriptTag({ content: result.outputFiles[0].text });
    const popup = page.locator(".step-editor-popup");
    const section = (name: string) => popup.getByRole("region", { name, exact: true });
    const header = (name: string) => section(name).getByRole("button", { name, exact: true });
    const initial = await page.evaluate(() => (window as any).fixture.read("a").content);
    await page.locator('[data-step-id="a-short"]').dblclick();
    await header("高级").waitFor();
    assert.deepEqual(await popup.locator(".step-editor-param-section__header").allTextContents(), ["常规", "高级", "输出到变量"]);
    assert.equal(await header("高级").getAttribute("aria-expanded"), "true");
    await replaceEditorText(section("常规").getByRole("textbox"), "kept general draft");
    await header("常规").focus(); await page.keyboard.press("Space");
    assert.equal(await header("常规").getAttribute("aria-expanded"), "false");
    await page.keyboard.press("Enter");
    assert.equal(await section("常规").getByRole("textbox").innerText(), "kept general draft");
    await header("高级").click();
    await popup.getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "不保存", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.read("a").content), initial);

    await page.locator('[data-step-id="a-long"]').dblclick();
    await header("高级").waitFor();
    assert.equal(await header("高级").getAttribute("aria-expanded"), "false");
    await header("高级").focus(); await page.keyboard.press("Enter");
    const advancedText = section("高级").getByRole("textbox").first();
    assert.equal(await advancedText.innerText(), "advanced original");
    await replaceEditorText(advancedText, "confirmed advanced");
    await header("高级").click();
    await popup.getByRole("button", { name: "确定", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.snapshot("a").steps[1].inputParams.adv0.value === "confirmed advanced");
    const history = page.locator('[data-program-workspace="a"]').getByRole("toolbar", { name: "文档历史" });
    await history.getByTitle("撤销 (Ctrl+Z)", { exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot("a").steps[1].inputParams.adv0.value), "advanced original");
    await history.getByTitle("重做 (Ctrl+Y / Ctrl+Shift+Z)", { exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot("a").steps[1].inputParams.adv0.value), "confirmed advanced");
    await page.locator('[data-step-id="a-plain"]').dblclick();
    await popup.getByText("General text", { exact: true }).waitFor();
    assert.equal(await popup.locator(".step-editor-param-section").count(), 0, "a plain input list does not gain redundant chrome");
    await popup.getByRole("button", { name: "取消", exact: true }).click();

    await page.locator('[data-step-id="a-late"]').dblclick();
    await page.waitForFunction(() => !!(window as any).fixture.releaseLate);
    await page.evaluate(() => (window as any).fixture.releaseLate());
    await header("高级").waitFor();
    assert.equal(await header("高级").getAttribute("aria-expanded"), "true", "late schemas use their actual short-list default");
    await replaceEditorText(section("高级").getByRole("textbox"), "owned a draft");
    // Verify the popup owns an unconfirmed model draft before switching owners.
    await popup.getByRole("button", { name: "取消", exact: true }).click();
    const discard = page.getByRole("alertdialog", { name: "是否保存更改？", exact: true });
    await discard.waitFor();
    await discard.getByRole("button", { name: "取消", exact: true }).click();
    await discard.waitFor({ state: "hidden" });
    await page.evaluate(() => (window as any).fixture.switch("b"));
    await page.locator('[data-step-id="b-short"]').dblclick();
    await header("高级").waitFor();
    assert.equal(await header("常规").getAttribute("aria-expanded"), "true");
    await header("常规").click();
    await popup.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.read("b").dirty), false);
    await page.evaluate(() => (window as any).fixture.switch("a"));
    assert.equal(await section("高级").getByRole("textbox").innerText(), "owned a draft");
    await mkdir("../.tmp", { recursive: true });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
      await page.screenshot({ path: "../.tmp/param-sections-" + theme + ".png" });
    }
    await page.setViewportSize({ width: 380, height: 760 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: "../.tmp/param-sections-narrow.png" });
    await popup.getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "不保存", exact: true }).click();
    const after = await page.evaluate(() => (window as any).fixture.read("a").content);
    assert.match(after, /9223372036854775807/); assert.match(after, /0\.1234567890123456789012345678/);
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot("a").steps[3].inputParams.adv0.value), "advanced original");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []);
    assert.deepEqual(errors, []); await page.evaluate(() => (window as any).fixture.dispose());
  } finally { await browser.close(); }
});
