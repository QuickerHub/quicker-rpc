import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium, type Page } from "playwright";

// Production workspace/controller/list/popup; only bound host requests and icons are fixtures.
const fixture = `
import React,{useMemo,useState}from'react';import{createRoot}from'react-dom/client';
import{ProgramEditorTabWorkspace}from'@/components/action-editor/ProgramEditorTabWorkspace';
import{createDesignerCatalogPort}from'@/lib/action-editor/catalog/designerCatalogPort';
import{createProgramDocumentSession}from'@/lib/action-editor/document/programDocumentSession';
import{createProgramDocumentEditorController}from'@/lib/action-editor/program/programDocumentEditorController';
import{StepRunnerItem}from'@/lib/action-editor/types/action_query';
import{mapAgentSchemaToStepRunnerItem}from'@/lib/action-editor/api/stepRunnerSchemaMap';
import catalog from'@/lib/action-editor/data/step-runners-ui-catalog.json';
const target='abcdefab-cdef-4abc-8def-abcdefabcdef';
const state=window.fixture={requests:[],unexpected:[],schemaMode:'ok',pending:[],active:true,doc:'a'};
const run=mapAgentSchemaToStepRunnerItem(catalog.schemas['sys:runAction']);
const basic=StepRunnerItem.fromPartial({key:'sys:fixture',name:'Fixture step',inputParamDefs:[{key:'text',name:'Existing parameter',varType:0,variableMode:1,allowInput:true}]});
const source=id=>JSON.stringify({steps:[{stepId:id+'-one',stepRunnerKey:'sys:fixture',note:'first',inputParams:{text:'original'},futureStep:'KEEP_BIG_INT'},{stepId:id+'-two',stepRunnerKey:'sys:fixture',note:'second'}],variables:[],subPrograms:[{id:'child',kind:1,name:'Child',steps:[],variables:[],subPrograms:[]}],futureRoot:'KEEP_DECIMAL'}).replace('"KEEP_BIG_INT"','9223372036854775807').replace('"KEEP_DECIMAL"','0.1234567890123456789012345');
const scope=(doc,owner)=>({cwd:'C:/fixture-only',projectDirectory:'.quicker/actions/'+doc,expectedProjectBinding:{schemaVersion:1,kind:'action',actionId:target,hostBinding:{hostInstanceId:owner,hostSessionId:(owner==='a'?'a':'b').repeat(32),endpoint:'QuickerRpc_User_'+'A'.repeat(24)+'_'+(owner==='a'?'a':'b').repeat(32),protocolVersion:1,schemaVersion:1,hostKind:'v1',quickerVersion:'fake-only',capabilities:{'resource.action.page.read':true}}}});
window.fetch=async(input,init)=>{
 const url=String(input),body=init?.body?JSON.parse(init.body):{};
 if(!body.catalogContext?.expectedProjectBinding)throw Error('No unbound fallback: '+url);
 state.requests.push({url,body});
 if(url==='/api/designer/resources/page')return Response.json({ok:true,kind:body.kind,scope:body.scope,query:body.query,skip:0,take:body.take,snapshotId:'fixture-page',totalCount:1,hasMore:false,items:[{id:target,title:'Script action',description:'non-XAction native target',editVersion:'1',icon:'',actionType:'RunScript',callIdentifier:null}]});
 if(url==='/api/step-runner/list')return Response.json({ok:true,items:[basic]});
 if(url==='/api/step-runner/summaries')return Response.json({ok:true,items:[]});
 if(url==='/api/subprogram/list')return Response.json({ok:true,items:[]});
 if(url==='/api/step-runner/quick-insert')return Response.json({ok:true,json:JSON.stringify({items:[{kind:'runner',id:'fixture-quick',label:'Fixture quick insertion',payload:{stepRunnerKey:'sys:fixture',name:'Fixture step'}}],totalCount:1,hasMore:false})});
 if(url==='/api/step-runner/get'){
  if(body.key==='sys:fixture')return Response.json({ok:true,item:basic});
  if(body.key==='sys:runAction'){
   if(state.schemaMode==='fail')return Response.json({ok:false,error:'fixture bound schema unavailable',code:'UNAVAILABLE'},{status:503});
   const result=Response.json({ok:true,item:run});
   if(state.schemaMode==='defer')return await new Promise(resolve=>state.pending.push(()=>resolve(result)));
   return result;
  }
 }
 state.unexpected.push({url,body});throw Error('Unexpected host operation: '+url);
};
const sessions=Object.fromEntries(['a','b'].map(id=>[id,createProgramDocumentSession({content:source(id),identity:{documentKey:id,projectBinding:null}})]));
const controllers=Object.fromEntries(['a','b'].map(id=>[id,createProgramDocumentEditorController(sessions[id],{isCurrent:()=>state.doc===id&&state.active,onChange:result=>{if(!result.ok)throw Error(result.error);state.redraw?.(x=>x+1);}})]));
state.read=id=>sessions[id||state.doc].getState();state.snapshot=id=>controllers[id||state.doc].getSnapshot();state.undo=()=>controllers[state.doc].undo();state.redo=()=>controllers[state.doc].redo();
function App(){const[doc,setDoc]=useState('a'),[owner,setOwner]=useState('a'),[active,setActive]=useState(true),[epoch,setEpoch]=useState(0),[,redraw]=useState(0);
 state.doc=doc;state.active=active;state.redraw=redraw;state.setDoc=setDoc;state.setOwner=setOwner;state.setActive=setActive;state.resetPort=()=>setEpoch(x=>x+1);
 const port=useMemo(()=>createDesignerCatalogPort(scope(doc,owner)),[doc,owner,epoch]);
 return <div hidden={!active}><ProgramEditorTabWorkspace key={doc} documentKey={doc} controller={controllers[doc]} active={active} catalogPort={port}/></div>;
}
const root=createRoot(document.getElementById('root'));root.render(<App/>);state.dispose=()=>root.unmount();
`;

async function compileFixture() {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  return build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", metafile: true, tsconfig: path.join(process.cwd(), "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"development"' }, loader: { ".css": "empty" },
    plugins: [{ name: "isolated-action-resource-icons", setup(builder) {
      builder.onResolve({ filter: /^@iconify\/icons-mdi\// }, (args) => ({ path: require.resolve(args.path) }));
      builder.onResolve({ filter: /shared\/IconControl$/ }, (args) => ({ path: args.path, namespace: "fixture-icon" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture-icon" }, () => ({ contents: "export function IconControl(){return null}", loader: "js" }));
    } }] });
}
const surface = (page: Page) => page.locator(".program-editor-surface:visible");
const popup = (page: Page) => page.locator(".step-editor-popup");
async function resource(page: Page) {
  await page.getByRole("tab", { name: "动作", exact: true }).click();
  const list = page.getByRole("region", { name: "动作目录", exact: true });
  await list.getByRole("option", { name: "Script action" }).click();
  return list;
}
async function drop(page: Page, transfer: any, before?: string) {
  const target = before ? surface(page).locator('[data-step-id="' + before + '"]') : surface(page).locator(".step-listbox.root");
  const bounds = await target.boundingBox(); assert.ok(bounds);
  await target.dispatchEvent("dragover", { dataTransfer: transfer, clientY: bounds.y + 1 });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await target.dispatchEvent("drop", { dataTransfer: transfer, clientY: bounds.y + 1 });
}

async function mountFixture(page: Page, script: string): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/*", (route) => route.abort());
  await page.setContent('<div id="root"></div>');
  const css = await Promise.all(["components/action-editor/action-editor-theme.css", "components/action-editor/action-editor.css", "components/action-editor/program-editor-toolbox.css"].map((file) => readFile(file, "utf8")));
  await page.addStyleTag({ content: css.join("\n") + "\nbody{margin:0;background:var(--ad-bg-canvas);color:var(--ad-fg-primary)}#root{height:100vh;}" });
  await page.addScriptTag({ content: script });
  return errors;
}

test("action resources use the real popup/controller, drop slots, undo and owner guards", { timeout: 120_000 }, async () => {
  const result = await compileFixture();
  assert.ok(Object.keys(result.metafile!.inputs).every((file) => !/(?:^|\/)lib\/(?:db\/|qkrpc\.ts|llm-config)/.test(file.replaceAll("\\", "/"))));
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = await mountFixture(page, result.outputFiles[0].text);
    let list = await resource(page);
    assert.equal(await list.getByRole("button", { name: "在工作区打开" }).count(), 0);
    await surface(page).locator('[data-step-id="a-one"]').click();
    await surface(page).locator(".step-form-note-input").fill("unblurred draft");
    await list.getByRole("button", { name: "插入调用步骤" }).evaluate((button: HTMLButtonElement) => button.click());
    await popup(page).waitFor();
    const command = popup(page).locator(".step-param-row").filter({ hasText: "命令参数" });
    await command.locator("textarea,input,[contenteditable=true]").first().fill("local call argument");
    await popup(page).getByText("动作输出", { exact: true }).dblclick();
    const create = page.getByRole("dialog", { name: "创建新变量" });
    await create.getByLabel("变量名", { exact: true }).fill("call_result");
    await create.getByRole("button", { name: "确定", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot().variables.length), 0);
    await mkdir("../.tmp", { recursive: true });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => document.documentElement.dataset.theme=theme, theme);
      await page.screenshot({ path: "../.tmp/action-resource-popup-" + theme + ".png" });
    }
    await page.setViewportSize({ width: 380, height: 760 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const confirmBounds = await popup(page).getByRole("button", { name: "确定", exact: true }).boundingBox();
    assert.ok(confirmBounds && confirmBounds.y >= 0 && confirmBounds.y + confirmBounds.height <= 760);
    await page.screenshot({ path: "../.tmp/action-resource-popup-narrow.png" });
    await page.setViewportSize({ width: 1200, height: 900 });
    await popup(page).getByRole("button", { name: "确定", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.snapshot().steps.length === 3);
    const inserted = await page.evaluate(() => (window as any).fixture.snapshot());
    assert.equal(inserted.steps[0].note, "unblurred draft");
    assert.equal(inserted.steps[2].stepRunnerKey, "sys:runAction");
    // The popup compacts the native default operation; the effective operation remains StartAction.
    assert.equal(inserted.steps[2].inputParams.type, undefined);
    assert.equal(inserted.steps[2].inputParams.actionId.value, "abcdefab-cdef-4abc-8def-abcdefabcdef");
    assert.equal(inserted.steps[2].inputParams.inputParam.value, "local call argument");
    assert.equal(inserted.steps[2].note, "Script action"); assert.equal(inserted.variables[0].key, "call_result");
    await page.evaluate(() => (window as any).fixture.undo());
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot().steps.length), 2);
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot().variables.length), 0);
    assert.equal(await surface(page).locator(".step-form-note-input").inputValue(), "unblurred draft");
    await page.evaluate(() => (window as any).fixture.redo());
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot().variables.length), 1);
    assert.match(await page.evaluate(() => (window as any).fixture.read().content), /9223372036854775807/);
    assert.match(await page.evaluate(() => (window as any).fixture.read().content), /0\.1234567890123456789012345/);
    await page.evaluate(() => (window as any).fixture.undo());
    const row = list.getByRole("option", { name: "Script action" });
    const transfer = await page.evaluateHandle(() => new DataTransfer());
    await row.dispatchEvent("dragstart", { dataTransfer: transfer });
    await drop(page, transfer, "a-two"); await popup(page).waitFor();
    await popup(page).getByRole("button", { name: "确定", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot().steps[1].stepRunnerKey), "sys:runAction");
    await page.evaluate(() => (window as any).fixture.undo());
    const stale = await page.evaluateHandle(() => new DataTransfer());
    await row.dispatchEvent("dragstart", { dataTransfer: stale });
    await page.getByLabel("打开或新建内部子程序", { exact: true }).click();
    await page.getByRole("button", { name: "Child", exact: true }).click();
    await drop(page, stale); assert.equal(await popup(page).count(), 0);
    const fresh = await page.evaluateHandle(() => new DataTransfer());
    await row.dispatchEvent("dragstart", { dataTransfer: fresh });
    await drop(page, fresh); await popup(page).waitFor();
    await popup(page).getByRole("button", { name: "确定", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot().subPrograms[0].steps.length), 1);
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot().steps.length), 2);

    // A late schema cannot replace a subsequently opened existing-step parameter draft.
    await page.evaluate(() => { const f=(window as any).fixture;f.schemaMode="defer";f.resetPort(); });
    await page.getByRole("tab", { name: "主程序", exact: true }).click();
    list = await resource(page); await list.getByRole("button", { name: "插入调用步骤" }).click();
    await page.waitForFunction(() => (window as any).fixture.pending.length > 0);
    await surface(page).locator('[data-step-id="a-one"]').dblclick();
    const existing = popup(page).locator(".step-param-row").filter({ hasText: "Existing parameter" });
    await existing.locator("textarea,input,[contenteditable=true]").first().fill("keep pending parameter draft");
    await page.evaluate(() => { const f=(window as any).fixture;f.schemaMode="ok";f.pending.splice(0).forEach((done: any)=>done()); });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await existing.locator("textarea,input,[contenteditable=true]").first().evaluate((field) =>
      field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? field.value : field.textContent), "keep pending parameter draft");
    await popup(page).getByRole("button", { name: "确定", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot().steps.length), 2);
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot().steps[0].inputParams.text.value), "keep pending parameter draft");

    await page.evaluate(() => { const f=(window as any).fixture;f.schemaMode="defer";f.resetPort(); });
    list = await resource(page); await list.getByRole("button", { name: "插入调用步骤" }).click();
    await page.waitForFunction(() => (window as any).fixture.pending.length > 0);
    await page.evaluate(() => (window as any).fixture.setDoc("b"));
    await page.evaluate(() => { const f=(window as any).fixture;f.schemaMode="ok";f.pending.splice(0).forEach((done: any)=>done()); });
    assert.equal(await popup(page).count(), 0);
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot("b").steps.length), 2);
    for (const change of ["target", "hidden"]) {
      list = await resource(page); await list.getByRole("button", { name: "插入调用步骤" }).click(); await popup(page).waitFor();
      await page.evaluate((change) => { const f=(window as any).fixture;change==="target"?f.setOwner("b"):f.setActive(false); }, change);
      await page.waitForFunction(() => !document.querySelector(".step-editor-popup"));
      await page.evaluate(() => (window as any).fixture.setActive(true));
      assert.equal(await page.evaluate(() => (window as any).fixture.snapshot("b").steps.length), 2);
    }
    await page.evaluate(() => { const f=(window as any).fixture;f.schemaMode="fail";f.resetPort(); });
    const requestCount = await page.evaluate(() => (window as any).fixture.requests.length);
    list = await resource(page); await list.getByRole("button", { name: "插入调用步骤" }).click();
    await page.waitForFunction((count) => (window as any).fixture.requests.slice(count).some((r: any)=>r.url==="/api/step-runner/get"&&r.body.key==="sys:runAction"), requestCount);
    await page.getByText("fixture bound schema unavailable", { exact: false }).waitFor();
    assert.equal(await popup(page).count(), 0);
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot("b").steps.length), 2);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []);
    assert.equal(await page.evaluate(() => (window as any).fixture.requests.some((r: any)=>r.url.includes("subprogram-io"))), false);
    await mkdir("../.tmp", { recursive: true });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => document.documentElement.dataset.theme=theme, theme);
      await page.screenshot({ path: "../.tmp/action-resource-" + theme + ".png" });
    }
    await page.setViewportSize({ width: 380, height: 760 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: "../.tmp/action-resource-narrow.png" });
    assert.deepEqual(errors, []); await page.evaluate(() => (window as any).fixture.dispose());
  } finally { await browser.close(); }
});

test("newer quick insert and cancellation intent reject a delayed resource schema", { timeout: 120_000 }, async () => {
  const result = await compileFixture();
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
  const cases = ["append click", "Enter", "a", "b", "append Space", "root double click",
    "empty click", "empty Enter", "empty Space", "empty double click", "quick Escape", "quick blur", "pending Escape"];
  await mkdir("../.tmp", { recursive: true });
  try {
    for (const intent of cases) {
      const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
      try {
        const errors = await mountFixture(page, result.outputFiles[0].text);
        if (intent.startsWith("empty")) {
          await page.getByLabel("打开或新建内部子程序", { exact: true }).click();
          await page.getByRole("button", { name: "Child", exact: true }).click();
        }
        const before = await page.evaluate(() => (window as any).fixture.read().content);
        await page.evaluate(() => { const f=(window as any).fixture;f.schemaMode="defer";f.resetPort(); });
        const list = await resource(page);
        await list.getByRole("button", { name: "插入调用步骤" }).click();
        await page.waitForFunction(() => (window as any).fixture.pending.length === 1);
        const editor = surface(page).locator(".step-editor");
        if (["Enter", "a", "b", "pending Escape"].includes(intent)) {
          await surface(page).locator('[data-step-id="a-one"]').click();
          await editor.focus();
          await page.keyboard.press(intent === "pending Escape" ? "Escape" : intent);
        } else if (intent.startsWith("empty")) {
          const empty = surface(page).getByRole("button", { name: "空分支：点击添加步骤或从工具箱拖入", exact: true });
          if (intent === "empty click") await empty.click();
          else if (intent === "empty double click") await empty.dblclick();
          else { await empty.focus(); await empty.press(intent === "empty Enter" ? "Enter" : "Space"); }
        } else if (intent === "root double click") {
          await surface(page).locator(".step-listbox.root").dispatchEvent("dblclick", { button: 0 });
        } else {
          const append = surface(page).getByRole("button", { name: "在列表末尾添加步骤", exact: true });
          if (intent === "append Space") { await append.focus(); await append.press("Space"); }
          else await append.click();
        }
        const query = surface(page).locator(".step-quick-insert-input");
        if (intent !== "pending Escape") {
          await query.fill("keep newer " + intent);
          if (intent === "quick Escape") await query.press("Escape");
          if (intent === "quick blur") await page.getByRole("tab", { name: "动作", exact: true }).click();
        }
        await page.evaluate(() => { const f=(window as any).fixture;f.schemaMode="ok";f.pending.splice(0).forEach((done: any)=>done()); });
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        if (await popup(page).count()) await page.screenshot({ path: "../.tmp/action-resource-quick-insert-red.png" });
        assert.equal(await popup(page).count(), 0, intent + ": an older resource schema must not open a popup");
        assert.equal(await page.evaluate(() => (window as any).fixture.read().content), before, intent + ": no step or variable transaction");
        if (["quick Escape", "quick blur", "pending Escape"].includes(intent)) {
          assert.equal(await query.count(), 0, intent + ": cancellation stays closed");
        } else {
          assert.equal(await query.inputValue(), "keep newer " + intent, intent + ": newer search draft survives");
          assert.equal(await query.evaluate((field) => document.activeElement === field), true);
          if (intent === "append click") {
            await page.screenshot({ path: "../.tmp/action-resource-quick-insert-green.png" });
            await query.press("Enter");
            const parameter = popup(page).locator(".step-param-row").filter({ hasText: "Existing parameter" });
            await parameter.locator("textarea,input,[contenteditable=true]").first().fill("newer quick selection");
            assert.equal(await query.count(), 0, "a picked quick insertion and parameter popup remain exclusive");
            await popup(page).getByRole("button", { name: "确定", exact: true }).click();
            assert.equal(await page.evaluate(() => (window as any).fixture.snapshot().steps[2].inputParams.text.value), "newer quick selection");
            await page.evaluate(() => (window as any).fixture.undo());
            assert.equal(await page.evaluate(() => (window as any).fixture.snapshot().steps.length), 2);
          } else await query.press("Escape");
        }
        assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []);
        assert.deepEqual(errors, []);
        await page.evaluate(() => (window as any).fixture.dispose());
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
});
