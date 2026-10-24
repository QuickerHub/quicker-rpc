import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium, type Locator, type Page } from "playwright";

// Production workspace/controller, parameter fields and real file hook. Only IO and icon leaves are fixtures.
const fixture = `
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{ProgramEditorTabWorkspace}from'@/components/action-editor/ProgramEditorTabWorkspace';
import{createDesignerCatalogPort}from'@/lib/action-editor/catalog/designerCatalogPort';
import{createProgramDocumentSession}from'@/lib/action-editor/document/programDocumentSession';
import{createProgramDocumentEditorController}from'@/lib/action-editor/program/programDocumentEditorController';
import{mapAgentSchemaToStepRunnerItem}from'@/lib/action-editor/api/stepRunnerSchemaMap';
const state=window.fixture={requests:[],schemaReads:[],unexpected:[],writes:[],handles:{},delaySchema:false,releaseSchema:null,files:{a:"print('a original')",b:"print('b original')"}};
const ids={a:'abcdefab-cdef-4abc-8def-abcdefabcdef',b:'bbcdefab-cdef-4abc-8def-abcdefabcdef'};
const schemas={
 'sys:fixture-large':{stepRunnerKey:'sys:fixture-large',name:'Large step',helpLink:'https://docs.example.test/large',inputs:[
  {key:'mode',title:'Mode',valueType:'Enum',variableMode:1,isControlField:true,options:[{key:'both',name:'All fields'},{key:'text',name:'Text only'}]},
  {key:'code',title:'C# source',valueType:'Text',isMultiLine:true,defaultHighlightType:'csharp',variableMode:0},
  {key:'body',title:'JSON body',valueType:'Text',isMultiLine:true,defaultHighlightType:'json',variableMode:0},
  {key:'pythoncode',title:'Python file',valueType:'Text',isMultiLine:true,defaultHighlightType:'python',variableMode:0},
  {key:'params',title:'JSON params',valueType:'Text',isMultiLine:true,defaultHighlightType:'json',variableMode:0},
  {key:'bindcode',title:'Bound script',valueType:'Text',isMultiLine:true,defaultHighlightType:'js',variableMode:0},
  {key:'reference',title:'References',valueType:'Text',isMultiLine:true,isAdvanced:true,variableMode:0},
  {key:'toolbarScript',title:'Toolbar config',valueType:'Text',isMultiLine:true,defaultHighlightType:'json',variableMode:0}],outputs:[]},
 'sys:fixture-plain':{stepRunnerKey:'sys:fixture-plain',name:'Plain step',inputs:[{key:'text',title:'Plain text',valueType:'Text',variableMode:1}],outputs:[]}};
const runner=(key,full)=>{const item=mapAgentSchemaToStepRunnerItem(full?schemas[key]:{stepRunnerKey:key,name:schemas[key].name});
 const body=item.inputParamDefs.find(d=>d.key==='body');if(body)body.validForList=['both'];return item;};
window.fetch=async(input,init)=>{
 const url=String(input),body=JSON.parse(String(init?.body||'{}'));state.requests.push({url,body});
 if(url.startsWith('/api/workspace')){
  const query=new URL(url,'https://fixture.test').searchParams,path=String(body.path||query.get('path')||'').replaceAll('\\\\','/');
  const owner=path.includes('/actions/a/')?'a':path.includes('/actions/b/')?'b':null;
  if(!owner||!path.endsWith('/'+owner+'.py'))throw Error('Unexpected file '+path);
  if((body.op||query.get('op'))==='read')return Response.json({ok:true,path,content:state.files[owner],truncated:false});
  if(body.op==='write'){state.writes.push({...body,owner});state.files[owner]=body.content;return Response.json({ok:true,path});}
  throw Error('Unexpected workspace operation');
 }
 const owner=Object.keys(ids).find(k=>ids[k]===body.catalogContext?.expectedProjectBinding?.actionId);
 if(!owner)throw Error('No unbound catalog requests');
 if(url==='/api/step-runner/list')return Response.json({ok:true,items:Object.keys(schemas).map(k=>runner(k,false))});
 if(url==='/api/step-runner/get'){
  if(owner==='a'&&body.key==='sys:fixture-large'&&state.delaySchema)await new Promise(resolve=>state.releaseSchema=resolve);
  const response=Response.json({ok:true,item:runner(body.key,true)});state.schemaReads.push({owner,key:body.key});return response;
 }
 if(url==='/api/step-runner/summaries'||url==='/api/subprogram/list')return Response.json({ok:true,items:[]});
 state.unexpected.push({url,body});throw Error('Unexpected '+url);
};
const sessions={},controllers={},ports={},workspaces={};
for(const owner of ['a','b']){
 const source=JSON.stringify({steps:[{stepId:owner+'-large',stepRunnerKey:'sys:fixture-large',inputParams:{
  mode:{value:'both'},code:{value:'// '+owner+' original'},body:{value:'{"owner":"'+owner+'"}'},
  pythoncode:{file:'files/'+owner+'.py'},params:{value:'{"count":1}'},bindcode:{varKey:'script_var'},
  reference:{value:'a.dll\\nb.dll'},toolbarScript:{value:'{}'}}},{stepId:owner+'-plain',stepRunnerKey:'sys:fixture-plain',inputParams:{text:{value:'untouched'}}}],
  variables:[{id:'script-var',key:'script_var',varType:0}],subPrograms:[],futureRoot:'KEEP_INT64',futureDecimal:'KEEP_DECIMAL'}).replace('"KEEP_INT64"','9223372036854775807').replace('"KEEP_DECIMAL"','0.1234567890123456789012345678');
 sessions[owner]=createProgramDocumentSession({content:source,identity:{documentKey:owner,projectBinding:null}});
 controllers[owner]=createProgramDocumentEditorController(sessions[owner],{isCurrent:()=>true,onChange:r=>{if(!r.ok)throw Error(r.error);state.redraw?.(x=>x+1);}});
 workspaces[owner]={cwd:'C:/fixture-only',projectDir:'C:/fixture-only/.quicker/actions/'+owner};
 ports[owner]=createDesignerCatalogPort({cwd:'C:/fixture-only',projectDirectory:'.quicker/actions/'+owner,expectedProjectBinding:{schemaVersion:1,kind:'action',actionId:ids[owner],hostBinding:{hostInstanceId:'large-'+owner,hostSessionId:owner.repeat(32),endpoint:'QuickerRpc_User_'+'A'.repeat(24)+'_'+owner.repeat(32),protocolVersion:1,schemaVersion:1,hostKind:'v1',quickerVersion:'fake-only',capabilities:{}}}});
}
state.read=owner=>sessions[owner].getState();state.snapshot=owner=>controllers[owner].getSnapshot();
state.schemaReadyA=()=>state.schemaReads.some(r=>r.owner==='a'&&r.key==='sys:fixture-large');
function App(){const[,redraw]=useState(0),[active,setActive]=useState('a');state.redraw=redraw;state.switch=setActive;return <>{['a','b'].map(owner=><section key={owner} style={{display:active===owner?'block':'none'}}><ProgramEditorTabWorkspace documentKey={owner} controller={controllers[owner]} catalogPort={ports[owner]} workspaceContext={workspaces[owner]} active={active===owner} onHandleChange={handle=>state.handles[owner]=handle}/></section>)}</>;}
const root=createRoot(document.getElementById('root'));root.render(<App/>);state.dispose=()=>{root.unmount();Object.values(ports).forEach(p=>p.dispose());};
`;

async function compileFixture(contents = fixture) {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  return build({ stdin: { contents, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", metafile: true, tsconfig: path.join(process.cwd(), "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"development"' }, loader: { ".css": "empty" },
    plugins: [{ name: "isolated-large-param-icons", setup(builder) {
      builder.onResolve({ filter: /^@iconify\/icons-mdi\// }, args => ({ path: require.resolve(args.path) }));
      builder.onResolve({ filter: /shared\/IconControl$/ }, args => ({ path: args.path, namespace: "fixture-icon" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture-icon" }, () => ({ contents: "export function IconControl(){return null}", loader: "js" }));
    } }] });
}
async function mount(page: Page, contents = fixture) {
  const result = await compileFixture(contents);
  assert.ok(Object.keys(result.metafile!.inputs).every(file => !/(?:^|\/)lib\/(?:db\/|qkrpc\.ts|llm-config)/.test(file.replaceAll("\\", "/"))));
  page.setDefaultTimeout(8000);
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.route("**/*", route => route.request().url().startsWith("https://docs.example.test/large")
    ? route.fulfill({ contentType: "text/html", body: "<p>Isolated module help</p>" }) : route.abort());
  await page.setContent('<div id="root"></div>');
  const css = await Promise.all(["components/action-editor/action-editor-theme.css", "components/action-editor/action-editor.css", "components/action-editor/program-editor-toolbox.css"].map(file => readFile(file, "utf8")));
  await page.addStyleTag({ content: css.join("\n") + "\nbody{margin:0;font-family:system-ui;background:var(--ad-bg-canvas);color:var(--ad-fg-primary)}#root{height:100vh;}" });
  await page.addScriptTag({ content: result.outputFiles[0].text });
  return errors;
}
const popup = (page: Page) => page.locator(".step-editor-popup");
const row = (page: Page, title: string) => popup(page).locator(".step-param-row").filter({ has: page.getByText(title, { exact: true }) });
const tab = (page: Page, name: string) => popup(page).getByRole("tab", { name, exact: true });

async function replaceEditorText(field: Locator, value: string) {
  // Use CodeMirror's real select-all keymap, as the workspace modal DOM tests do.
  await field.click();
  await field.press("Control+A");
  await field.pressSequentially(value);
  assert.equal(await field.innerText(), value);
}

test("large parameter tabs keep one editor, file owner and one document confirmation history", { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } }), errors = await mount(page);
    const initial = await page.evaluate(() => (window as any).fixture.read("a").content);
    await page.locator('[data-step-id="a-large"]').dblclick(); await tab(page, "C# source").waitFor();
    assert.equal(await tab(page, "参数").getAttribute("aria-selected"), "true");
    assert.equal(await tab(page, "Toolbar config").count(), 0, "capture toolbar visual editing is not fabricated by the script tab adapter");
    const inline = row(page, "C# source").getByRole("textbox");
    await inline.evaluate(node => { (window as any).fixture.codeNode = node; });
    await replaceEditorText(inline, "// kept inline draft");
    await popup(page).locator(".step-editor-large-param-preview").filter({ has: page.getByText("C# source", { exact: true }) })
      .getByRole("button", { name: "展开", exact: true }).click();
    await page.getByRole("tabpanel", { name: "C# source", exact: true }).waitFor();
    const full = row(page, "C# source").getByRole("textbox");
    assert.equal(await full.evaluate(node => node === (window as any).fixture.codeNode), true);
    assert.equal(await full.innerText(), "// kept inline draft");
    const bounds = await row(page, "C# source").locator(".expression-editor").boundingBox();
    assert.ok(bounds && bounds.width > 650 && bounds.height >= 270, JSON.stringify(bounds));
    await popup(page).getByRole("button", { name: "模块帮助", exact: true }).click();
    await page.getByRole("dialog", { name: /^模块帮助/ }).waitFor();
    await page.getByRole("button", { name: "关闭模块帮助", exact: true }).click();
    assert.equal(await row(page, "C# source").getByRole("textbox").evaluate(node => node === (window as any).fixture.codeNode), true);
    assert.equal(await row(page, "C# source").getByRole("textbox").innerText(), "// kept inline draft");
    await tab(page, "C# source").focus(); await page.keyboard.press("ArrowRight");
    assert.equal(await tab(page, "JSON body").getAttribute("aria-selected"), "true");
    await page.keyboard.press("ArrowLeft");
    assert.equal(await tab(page, "C# source").getAttribute("aria-selected"), "true");
    await tab(page, "C# source").focus(); await page.keyboard.press("End");
    assert.equal(await tab(page, "Bound script").getAttribute("aria-selected"), "true");
    await row(page, "Bound script").getByTitle("点击选择变量或输入值").click();
    await page.locator(".step-param-varorvalue-popup").waitFor();
    await tab(page, "Bound script").focus();
    assert.equal(await page.locator(".step-param-varorvalue-popup").count(), 0, "keyboard tab navigation closes an editor menu outside the new pane");
    await page.keyboard.press("Home");
    assert.equal(await tab(page, "参数").getAttribute("aria-selected"), "true");
    await tab(page, "JSON params").click();
    await replaceEditorText(row(page, "JSON params").getByRole("textbox"), '{"count":2}');
    await popup(page).getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "不保存", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.read("a").content), initial);

    await page.locator('[data-step-id="a-large"]').dblclick(); await tab(page, "C# source").click();
    await replaceEditorText(row(page, "C# source").getByRole("textbox"), "// confirmed");
    await popup(page).getByRole("button", { name: "确定", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.snapshot("a").steps[0].inputParams.code.value === "// confirmed");
    const history = page.locator('[data-program-workspace="a"]').getByRole("toolbar", { name: "文档历史" });
    await history.getByTitle("撤销 (Ctrl+Z)", { exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot("a").steps[0].inputParams.code.value), "// a original");
    assert.equal(await history.getByTitle("撤销 (Ctrl+Z)", { exact: true }).isDisabled(), true);
    await history.getByTitle("重做 (Ctrl+Y / Ctrl+Shift+Z)", { exact: true }).click();
    await page.locator('[data-step-id="a-large"]').dblclick(); await tab(page, "Python file").click();
    await row(page, "Python file").getByText("print('a original')", { exact: true }).waitFor();
    const fileEditor = row(page, "Python file").getByRole("textbox");
    await fileEditor.evaluate(node => { (window as any).fixture.fileNode = node; });
    await replaceEditorText(fileEditor, "print('a edited')");
    await tab(page, "参数").click();
    assert.equal(await row(page, "Python file").getByRole("textbox").evaluate(node => node === (window as any).fixture.fileNode), true);
    await page.waitForFunction(() => (window as any).fixture.writes.some(w => w.owner === "a" && w.content === "print('a edited')"));
    await page.waitForTimeout(550);
    assert.equal(await page.evaluate(() => (window as any).fixture.writes.filter(w => w.owner === "a").length), 1);
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot("a").steps[0].inputParams.pythoncode.file), "files/a.py");
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot("a").steps[0].inputParams.pythoncode.value ?? ""), "");
    await tab(page, "C# source").click(); await replaceEditorText(row(page, "C# source").getByRole("textbox"), "// a owned draft");
    await page.evaluate(() => (window as any).fixture.switch("b"));
    await page.locator('[data-step-id="b-large"]').dblclick(); await tab(page, "C# source").waitFor();
    assert.equal(await tab(page, "参数").getAttribute("aria-selected"), "true");
    await tab(page, "C# source").click();
    assert.equal(await row(page, "C# source").getByRole("textbox").innerText(), "// b original");
    await popup(page).getByRole("button", { name: "取消", exact: true }).click();
    await page.evaluate(() => (window as any).fixture.switch("a"));
    assert.equal(await row(page, "C# source").getByRole("textbox").innerText(), "// a owned draft");
    await mkdir("../.tmp", { recursive: true });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
      await page.screenshot({ path: "../.tmp/large-param-" + theme + ".png" });
    }
    await page.setViewportSize({ width: 380, height: 760 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: "../.tmp/large-param-narrow.png" });
    await popup(page).getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "不保存", exact: true }).click();
    const content = await page.evaluate(() => (window as any).fixture.read("a").content);
    assert.match(content, /9223372036854775807/); assert.match(content, /0\.1234567890123456789012345678/);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []); assert.deepEqual(errors, []);
    await page.evaluate(() => (window as any).fixture.dispose());
  } finally { await browser.close(); }
});

test("large parameter tabs retain selection after typing and reject late schema ownership", { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } }), errors = await mount(page, fixture.replace("delaySchema:false", "delaySchema:true"));
    await page.locator('[data-step-id="a-large"]').dblclick();
    await page.waitForFunction(() => !!(window as any).fixture.releaseSchema);
    await page.evaluate(() => (window as any).fixture.switch("b"));
    await page.locator('[data-step-id="b-large"]').dblclick(); await tab(page, "JSON body").click();
    await replaceEditorText(row(page, "JSON body").getByRole("textbox"), '{"owner":"b edited"}');
    await page.evaluate(() => { const f=(window as any).fixture; f.delaySchema=false; f.releaseSchema(); });
    await page.waitForFunction(() => (window as any).fixture.schemaReadyA());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await tab(page, "JSON body").getAttribute("aria-selected"), "true");
    assert.equal(await row(page, "JSON body").getByRole("textbox").innerText(), '{"owner":"b edited"}');
    await tab(page, "参数").click();
    await row(page, "Mode").getByRole("textbox").click();
    await page.getByRole("listbox").getByText("Text only", { exact: true }).click();
    assert.equal(await tab(page, "JSON body").count(), 0);
    assert.equal(await tab(page, "参数").getAttribute("aria-selected"), "true");
    await row(page, "Mode").getByRole("textbox").click();
    await page.getByRole("listbox").getByText("All fields", { exact: true }).click();
    await tab(page, "JSON body").click();
    assert.equal(await row(page, "JSON body").getByRole("textbox").innerText(), '{"owner":"b edited"}');
    await popup(page).getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "不保存", exact: true }).click();
    await page.evaluate(() => (window as any).fixture.switch("a"));
    await tab(page, "C# source").waitFor();
    assert.equal(await tab(page, "参数").getAttribute("aria-selected"), "true");
    await popup(page).getByRole("button", { name: "取消", exact: true }).click();
    await page.locator('[data-step-id="a-plain"]').dblclick();
    await popup(page).getByText("Plain text", { exact: true }).waitFor();
    assert.equal(await popup(page).getByRole("tablist").count(), 0);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []); assert.deepEqual(errors, []);
    await page.evaluate(() => (window as any).fixture.dispose());
  } finally { await browser.close(); }
});

test("large parameter tab changes preserve the upstream workspace modal blocker", { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } }), errors = await mount(page);
    const initial = await page.evaluate(() => (window as any).fixture.read("a").content);
    await page.locator('[data-step-id="a-large"]').dblclick(); await tab(page, "C# source").waitFor();
    // Required upstream API: never substitute a local busy flag if the modal guard has not landed.
    assert.equal(await page.evaluate(() => (window as any).fixture.handles.a.isLiveEditingBlocked()), true);
    await tab(page, "C# source").click();
    await replaceEditorText(row(page, "C# source").getByRole("textbox"), "// protected confirmation draft");
    await tab(page, "JSON params").click();
    assert.equal(await page.evaluate(() => (window as any).fixture.handles.a.isLiveEditingBlocked()), true);
    assert.equal(await page.evaluate(() => (window as any).fixture.read("a").content), initial);
    await popup(page).getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "不保存", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.handles.a.isLiveEditingBlocked()), false);
    assert.equal(await page.evaluate(() => (window as any).fixture.read("a").content), initial);
    assert.deepEqual(errors, []); await page.evaluate(() => (window as any).fixture.dispose());
  } finally { await browser.close(); }
});
