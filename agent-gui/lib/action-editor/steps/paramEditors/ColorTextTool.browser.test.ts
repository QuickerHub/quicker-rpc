import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium, type Page } from "playwright";

// Real workspace, controller and parameter widgets; only host requests and icon leaves are fixtures.
const fixture = `
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{ProgramEditorTabWorkspace}from'@/components/action-editor/ProgramEditorTabWorkspace';
import{createDesignerCatalogPort}from'@/lib/action-editor/catalog/designerCatalogPort';
import{createProgramDocumentSession}from'@/lib/action-editor/document/programDocumentSession';
import{createProgramDocumentEditorController}from'@/lib/action-editor/program/programDocumentEditorController';
import{mapAgentSchemaToStepRunnerItem}from'@/lib/action-editor/api/stepRunnerSchemaMap';
const id='abcdefab-cdef-4abc-8def-abcdefabcdef';
const state=window.fixture={unexpected:[],requests:[]};
const runner=mapAgentSchemaToStepRunnerItem({stepRunnerKey:'sys:fixture-color',name:'Color step',inputs:[
 {key:'rgb',title:'RGB color',valueType:'Text',variableMode:1,allowInput:true,textTools:'ColorPicker'},
 {key:'argb',title:'ARGB color',valueType:'Text',variableMode:1,allowInput:true,textTools:'ColorPickerArgb'}],outputs:[]});
const source=JSON.stringify({steps:[{stepId:'color-step',stepRunnerKey:'sys:fixture-color',inputParams:{rgb:{value:'#336699'},argb:{value:'#80336699'}}}],variables:[],subPrograms:[],futureRoot:'KEEP_INT64'}).replace('"KEEP_INT64"','9223372036854775807');
window.fetch=async(input,init)=>{
 const url=String(input),body=JSON.parse(String(init?.body||'{}'));state.requests.push({url,body});
 if(body.catalogContext?.expectedProjectBinding?.actionId!==id)throw Error('No unbound catalog requests');
 if(url==='/api/step-runner/list')return Response.json({ok:true,items:[runner]});
 if(url==='/api/step-runner/get'&&body.key==='sys:fixture-color')return Response.json({ok:true,item:runner});
 if(url==='/api/step-runner/summaries')return Response.json({ok:true,items:[]});
 if(url==='/api/subprogram/list')return Response.json({ok:true,items:[]});
 state.unexpected.push({url,body});throw Error('Unexpected operation: '+url);
};
const port=createDesignerCatalogPort({cwd:'C:/fixture-only',projectDirectory:'.quicker/actions/color',expectedProjectBinding:{schemaVersion:1,kind:'action',actionId:id,hostBinding:{hostInstanceId:'color-fixture',hostSessionId:'a'.repeat(32),endpoint:'QuickerRpc_User_'+'A'.repeat(24)+'_'+'a'.repeat(32),protocolVersion:1,schemaVersion:1,hostKind:'v1',quickerVersion:'fake-only',capabilities:{}}}});
const session=createProgramDocumentSession({content:source,identity:{documentKey:'color',projectBinding:null}});
const controller=createProgramDocumentEditorController(session,{isCurrent:()=>true,onChange:result=>{if(!result.ok)throw Error(result.error);state.redraw?.(x=>x+1);}});
state.read=()=>session.getState();state.snapshot=()=>controller.getSnapshot();
function App(){const[,redraw]=useState(0);state.redraw=redraw;return <ProgramEditorTabWorkspace documentKey="color" controller={controller} catalogPort={port}/>;}
const root=createRoot(document.getElementById('root'));root.render(<App/>);state.dispose=()=>{root.unmount();port.dispose();};
`;

async function compileFixture() {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  return build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", metafile: true, tsconfig: path.join(process.cwd(), "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"development"' }, loader: { ".css": "empty" },
    plugins: [{ name: "isolated-color-tool-icons", setup(builder) {
      builder.onResolve({ filter: /^@iconify\/icons-mdi\// }, (args) => ({ path: require.resolve(args.path) }));
      builder.onResolve({ filter: /shared\/IconControl$/ }, (args) => ({ path: args.path, namespace: "fixture-icon" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture-icon" }, () => ({ contents: "export function IconControl(){return null}", loader: "js" }));
    } }] });
}
const popup = (page: Page) => page.locator(".step-editor-popup");
const dialog = (page: Page) => page.locator(".text-tool-dialog");
async function openTool(page: Page, field: string, name: string) {
  await popup(page).locator(".step-param-row").filter({ has: page.getByText(field, { exact: true }) }).getByRole("button", { name, exact: true }).click();
  await dialog(page).waitFor();
}

test("color text tools reopen at the current RGB and alpha without changing a cancelled step", { timeout: 60_000 }, async () => {
  const result = await compileFixture();
  assert.ok(Object.keys(result.metafile!.inputs).every((file) => !/(?:^|\/)lib\/(?:db\/|qkrpc\.ts|llm-config)/.test(file.replaceAll("\\", "/"))));
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } }), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/*", (route) => route.abort());
    await page.setContent('<div id="root"></div>');
    const css = await Promise.all(["components/action-editor/action-editor-theme.css", "components/action-editor/action-editor.css", "components/action-editor/program-editor-toolbox.css"].map((file) => readFile(file, "utf8")));
    await page.addStyleTag({ content: css.join("\n") + "\nbody{margin:0;font-family:system-ui;background:var(--ad-bg-canvas);color:var(--ad-fg-primary)}#root{height:100vh;}" });
    await page.addScriptTag({ content: result.outputFiles[0].text });
    const initial = await page.evaluate(() => (window as any).fixture.read().content);
    const openStep = () => page.locator('[data-step-id="color-step"]').dblclick();
    await openStep();
    await openTool(page, "RGB color", "选择颜色(#RRGGBB)");
    await mkdir("../.tmp", { recursive: true });
    await page.screenshot({ path: "../.tmp/color-tool-current-value-initial.png" });
    assert.equal(await dialog(page).locator('input[type="color"]').inputValue(), "#336699");
    await dialog(page).getByRole("button", { name: "确定", exact: true }).click();
    await popup(page).getByRole("button", { name: "确定", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.read().content), initial, "confirming the current color is a no-op");
    assert.equal(await page.evaluate(() => (window as any).fixture.read().dirty), false);

    await openStep();
    await openTool(page, "ARGB color", "选择颜色(#AARRGGBB)");
    assert.equal(await dialog(page).locator('input[type="color"]').inputValue(), "#336699");
    assert.equal(await dialog(page).getByLabel("Alpha (0-255)", { exact: true }).inputValue(), "128");
    await dialog(page).getByLabel("Alpha (0-255)", { exact: true }).fill("64");
    await dialog(page).getByRole("button", { name: "取消", exact: true }).click();
    await openTool(page, "ARGB color", "选择颜色(#AARRGGBB)");
    assert.equal(await dialog(page).getByLabel("Alpha (0-255)", { exact: true }).inputValue(), "128", "cancelled picker edits do not leak");
    await dialog(page).getByLabel("Alpha (0-255)", { exact: true }).press("Escape");
    assert.equal(await dialog(page).count(), 0); assert.equal(await popup(page).count(), 1, "picker Escape leaves the parent draft open");
    await openTool(page, "ARGB color", "选择颜色(#AARRGGBB)");
    await dialog(page).getByLabel("Alpha (0-255)", { exact: true }).fill("64");
    await dialog(page).getByRole("button", { name: "确定", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.read().content), initial, "a picked color remains only in the step draft");
    await popup(page).getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("alertdialog", { name: "是否保存更改？" }).getByRole("button", { name: "不保存", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.read().content), initial);

    await openStep();
    await openTool(page, "ARGB color", "选择颜色(#AARRGGBB)");
    assert.equal(await dialog(page).getByLabel("Alpha (0-255)", { exact: true }).inputValue(), "128");
    await dialog(page).getByLabel("Alpha (0-255)", { exact: true }).fill("64");
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => document.documentElement.dataset.theme = theme, theme);
      await page.screenshot({ path: "../.tmp/color-tool-" + theme + ".png" });
    }
    await page.setViewportSize({ width: 380, height: 760 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: "../.tmp/color-tool-narrow.png" });
    await page.setViewportSize({ width: 1100, height: 850 });
    await dialog(page).getByRole("button", { name: "确定", exact: true }).click();
    await popup(page).getByRole("button", { name: "确定", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.snapshot().steps[0].inputParams.argb.value === "#40336699");
    const history = page.getByRole("toolbar", { name: "文档历史" });
    await history.getByTitle("撤销 (Ctrl+Z)", { exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot().steps[0].inputParams.argb.value), "#80336699");
    await history.getByTitle("重做 (Ctrl+Y / Ctrl+Shift+Z)", { exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot().steps[0].inputParams.argb.value), "#40336699");
    await openStep();
    await openTool(page, "ARGB color", "选择颜色(#AARRGGBB)");
    assert.equal(await dialog(page).getByLabel("Alpha (0-255)", { exact: true }).inputValue(), "64", "reopening reflects the newest confirmed value");
    await dialog(page).getByRole("button", { name: "取消", exact: true }).click();
    await popup(page).getByRole("button", { name: "取消", exact: true }).click();
    assert.match(await page.evaluate(() => (window as any).fixture.read().content), /9223372036854775807/);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []);
    assert.deepEqual(errors, []); await page.evaluate(() => (window as any).fixture.dispose());
  } finally { await browser.close(); }
});

