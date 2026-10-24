import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium, type Page } from "playwright";

// Bound native get-ui schema + real popup, controller and history; no host operations.
const fixture = `
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{ProgramEditorTabWorkspace}from'@/components/action-editor/ProgramEditorTabWorkspace';
import{createDesignerCatalogPort}from'@/lib/action-editor/catalog/designerCatalogPort';
import{createProgramDocumentSession}from'@/lib/action-editor/document/programDocumentSession';
import{createProgramDocumentEditorController}from'@/lib/action-editor/program/programDocumentEditorController';
import{mapAgentSchemaToStepRunnerItem}from'@/lib/action-editor/api/stepRunnerSchemaMap';
import catalog from'@/lib/action-editor/data/step-runners-ui-catalog.json';
const id='abcdefab-cdef-4abc-8def-abcdefabcdef',runner=mapAgentSchemaToStepRunnerItem(catalog.schemas['sys:openUrl']);
const state=window.fixture={requests:[],unexpected:[]};
const source=JSON.stringify({steps:[{stepId:'native-open',stepRunnerKey:'sys:openUrl',inputParams:{url:{value:'https://fixture.invalid/'}},outputParams:{errMessage:'original_error_text'},futureStep:'KEEP_INT64'}],variables:[{id:'old-error',key:'original_error_text',varType:0},{id:'new-error',key:'new_error_text',varType:0},{id:'unrelated',key:'wrong_number',varType:1}],subPrograms:[],futureRoot:'KEEP_DECIMAL'}).replace('"KEEP_INT64"','9223372036854775807').replace('"KEEP_DECIMAL"','0.1234567890123456789012345');
window.fetch=async(input,init)=>{
 const url=String(input),body=JSON.parse(String(init?.body||'{}'));state.requests.push({url,body});
 if(body.catalogContext?.expectedProjectBinding?.actionId!==id)throw Error('No unbound catalog fallback');
 if(url==='/api/step-runner/list')return Response.json({ok:true,items:[runner]});
 if(url==='/api/step-runner/get'&&body.key==='sys:openUrl')return Response.json({ok:true,item:runner});
 if(url==='/api/step-runner/summaries')return Response.json({ok:true,items:[]});
 if(url==='/api/subprogram/list')return Response.json({ok:true,items:[]});
 state.unexpected.push({url,body});throw Error('Unexpected operation: '+url);
};
const port=createDesignerCatalogPort({cwd:'C:/fixture-only',projectDirectory:'.quicker/actions/error-output',expectedProjectBinding:{schemaVersion:1,kind:'action',actionId:id,hostBinding:{hostInstanceId:'error-fixture',hostSessionId:'a'.repeat(32),endpoint:'QuickerRpc_User_'+'A'.repeat(24)+'_'+'a'.repeat(32),protocolVersion:1,schemaVersion:1,hostKind:'v1',quickerVersion:'fake-only',capabilities:{}}}});
const session=createProgramDocumentSession({content:source,identity:{documentKey:'error-output',projectBinding:null}});
const controller=createProgramDocumentEditorController(session,{isCurrent:()=>true,onChange:result=>{if(!result.ok)throw Error(result.error);state.redraw?.(x=>x+1);}});
state.read=()=>session.getState();state.snapshot=()=>controller.getSnapshot();
function App(){const[,redraw]=useState(0);state.redraw=redraw;return <ProgramEditorTabWorkspace documentKey="error-output" controller={controller} catalogPort={port}/>;}
const root=createRoot(document.getElementById('root'));root.render(<App/>);state.dispose=()=>{root.unmount();port.dispose();};
`;

async function compileFixture() {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  return build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", metafile: true, tsconfig: path.join(process.cwd(), "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"development"' }, loader: { ".css": "empty" },
    plugins: [{ name: "isolated-error-output-icons", setup(builder) {
      builder.onResolve({ filter: /^@iconify\/icons-mdi\// }, (args) => ({ path: require.resolve(args.path) }));
      builder.onResolve({ filter: /shared\/IconControl$/ }, (args) => ({ path: args.path, namespace: "fixture-icon" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture-icon" }, () => ({ contents: "export function IconControl(){return null}", loader: "js" }));
    } }] });
}
const popup = (page: Page) => page.locator(".step-editor-popup");
const errorRow = (page: Page) => popup(page).locator(".step-param-row").filter({ has: page.getByText("错误消息", { exact: true }) });
async function chooseErrorVariable(page: Page) {
  await errorRow(page).getByRole("combobox").click();
  const options = page.locator(".step-param-variable-picker-popup");
  assert.equal(await options.getByRole("button", { name: /^wrong_number/ }).count(), 0, "the native Text output keeps standard variable type filtering");
  await options.getByRole("button", { name: /^new_error_text/ }).click();
}

test("native common error output edits existing bindings through the real popup and document history", { timeout: 60_000 }, async () => {
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
    const openStep = async () => {
      await page.locator('[data-step-id="native-open"]').dblclick();
      await popup(page).getByText("是否成功", { exact: true }).waitFor();
    };
    await openStep();
    await mkdir("../.tmp", { recursive: true });
    await page.screenshot({ path: "../.tmp/error-output-initial.png" });
    assert.equal(await errorRow(page).count(), 1, "the native shared errMessage output must be offered");
    assert.equal(await errorRow(page).locator(".step-param-variable-picker-item-title").textContent(), "original_error_text");
    await chooseErrorVariable(page);
    assert.equal(await page.evaluate(() => (window as any).fixture.read().content), initial, "the selected output is still a step draft");
    await popup(page).getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("alertdialog", { name: "是否保存更改？" }).getByRole("button", { name: "不保存", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.read().content), initial);

    await openStep();
    assert.equal(await errorRow(page).count(), 1, "reopening must never append a second common definition");
    assert.equal(await errorRow(page).locator(".step-param-variable-picker-item-title").textContent(), "original_error_text");
    await chooseErrorVariable(page);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => document.documentElement.dataset.theme = theme, theme);
      await page.screenshot({ path: "../.tmp/error-output-" + theme + ".png" });
    }
    await page.setViewportSize({ width: 380, height: 760 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const confirm = await popup(page).getByRole("button", { name: "确定", exact: true }).boundingBox();
    assert.ok(confirm && confirm.y >= 0 && confirm.y + confirm.height <= 760);
    await page.screenshot({ path: "../.tmp/error-output-narrow.png" });
    await page.setViewportSize({ width: 1100, height: 850 });
    await popup(page).getByRole("button", { name: "确定", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.snapshot().steps[0].outputParams.errMessage === "new_error_text");
    const history = page.getByRole("toolbar", { name: "文档历史" });
    await history.getByTitle("撤销 (Ctrl+Z)", { exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot().steps[0].outputParams.errMessage), "original_error_text");
    await history.getByTitle("重做 (Ctrl+Y / Ctrl+Shift+Z)", { exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot().steps[0].outputParams.errMessage), "new_error_text");
    await openStep();
    assert.equal(await errorRow(page).count(), 1);
    assert.equal(await errorRow(page).locator(".step-param-variable-picker-item-title").textContent(), "new_error_text");
    await popup(page).getByRole("button", { name: "取消", exact: true }).click();
    const saved = await page.evaluate(() => (window as any).fixture.read().content);
    assert.match(saved, /9223372036854775807/); assert.match(saved, /0\.1234567890123456789012345/);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []);
    assert.deepEqual(errors, []); await page.evaluate(() => (window as any).fixture.dispose());
  } finally { await browser.close(); }
});

