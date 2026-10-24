import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

const fixture = `
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{ProgramEditorTabWorkspace}from'@/components/action-editor/ProgramEditorTabWorkspace';
import{createDesignerCatalogPort}from'@/lib/action-editor/catalog/designerCatalogPort';
import{createProgramDocumentSession}from'@/lib/action-editor/document/programDocumentSession';
import{createProgramDocumentEditorController}from'@/lib/action-editor/program/programDocumentEditorController';
const state=window.fixture={requests:[],failMore:false,failFirst:false,hold:false,pending:[],version:1};
const scopes=id=>({cwd:'C:/fixture-only',projectDirectory:'.quicker/actions/'+id,expectedProjectBinding:{schemaVersion:1,kind:'action',actionId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',hostBinding:{hostInstanceId:id,hostSessionId:'a'.repeat(32),endpoint:'QuickerRpc_User_'+'A'.repeat(24)+'_'+'a'.repeat(32),protocolVersion:1,schemaVersion:1,hostKind:id==='unsupported'?'v2':'v1',quickerVersion:'fixture',capabilities:{'resource.action.page.read':id!=='unsupported','resource.globalSubprogram.page.read':id!=='unsupported'}}}});
window.fetch=async(url,init)=>{
 if(url!=='/api/designer/resources/page')throw Error('No legacy search or host IO in resource fixture: '+url);
 const body=JSON.parse(init.body),owner=body.catalogContext?.expectedProjectBinding?.hostBinding.hostInstanceId;
 if(!owner)throw Error('unbound request');state.requests.push({body,owner,signal:init.signal});
 if(state.hold){state.hold=false;await new Promise(resolve=>state.pending.push(resolve));}
 if((body.skip&&state.failMore)||(!body.skip&&state.failFirst))return Response.json({ok:false,code:'CATALOG_CHANGED',error:'Catalog snapshot changed.'},{status:409});
 const totalCount=body.query?1:body.kind==='action'?102:3,snapshotId=owner+'-'+body.kind+'-'+state.version;
 return Response.json({ok:true,kind:body.kind,scope:body.scope,query:body.query,skip:body.skip,take:body.take,totalCount,snapshotId,
 hasMore:body.skip+Math.min(body.take,Math.max(0,totalCount-body.skip))<totalCount,
 items:Array.from({length:Math.min(body.take,Math.max(0,totalCount-body.skip))},(_,i)=>({id:owner+'-'+body.kind+'-'+(body.skip+i),title:owner+' '+body.kind+' '+(body.skip+i),description:'summary '+(body.skip+i),icon:'',editVersion:'9223372036854775807',actionType:body.kind==='action'?'XAction':null,callIdentifier:body.kind==='global_subprogram'?'%%fixture':null}))});
};
const ports=Object.fromEntries(['a','b','unsupported'].map(id=>[id,createDesignerCatalogPort(scopes(id))]));
ports.loading=createDesignerCatalogPort(null);ports.unbound=createDesignerCatalogPort({...scopes('unbound'),expectedProjectBinding:null});
const session=createProgramDocumentSession({content:'{"steps":[],"variables":[],"subPrograms":[],"opaque":9223372036854775807}',identity:{documentKey:'fixture',projectBinding:null}});
const controller=createProgramDocumentEditorController(session,{isCurrent:()=>true});
state.snapshot=()=>JSON.stringify(controller.getSnapshot());state.original=state.snapshot();
function App(){const[owner,setOwner]=useState('a'),[active,setActive]=useState(true);state.owner=setOwner;state.active=setActive;return <ProgramEditorTabWorkspace documentKey='fixture' controller={controller} active={active} catalogPort={ports[owner]}/>;}
const root=createRoot(document.getElementById('root'));root.render(<App/>);state.dispose=()=>{root.unmount();Object.values(ports).forEach(port=>port.dispose());};
`;

test("production resource entry isolates owners, requires snapshot paging and preserves document/module drafts", { timeout: 40_000 }, async () => {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  const result = await build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", loader: { ".css": "empty" }, metafile: true,
    tsconfig: path.join(process.cwd(), "tsconfig.json"), define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "resource-document-leaves", setup(builder) {
      builder.onResolve({ filter: /^@iconify\/icons-mdi\// }, (args) => ({ path: require.resolve(args.path) }));
      builder.onResolve({ filter: /(^@\/lib\/action-editor\/program\/XProgramEditor$|\/toolbox\/TreeActionToolbox$)/ }, (args) => ({ path: args.path, namespace: "fixture-leaf" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture-leaf" }, (args) => ({ loader: "jsx", resolveDir: process.cwd(), contents:
        args.path.endsWith("XProgramEditor") ? "export default function Program(){return <div>Document fixture</div>}"
          : "import{useState}from'react';export default function Modules(){const[value,setValue]=useState('module draft');return <input aria-label='Module draft' value={value} onChange={e=>setValue(e.target.value)}/>;}" }));
    } }] });
  assert.ok(Object.keys(result.metafile!.inputs).every((file) => !/(?:^|\/)lib\/(?:db\/|qkrpc\.ts|llm-config)/.test(file.replaceAll("\\", "/"))));
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } }), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message)); page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/*", (route) => route.abort());
    await page.setContent('<div id="root"></div>');
    const styles = await Promise.all(["components/action-editor/action-editor-theme.css", "components/action-editor/action-editor.css", "components/action-editor/program-editor-toolbox.css"].map((file) => readFile(file, "utf8")));
    await page.addStyleTag({ content: styles.join("\n") + "\nbody{margin:0;background:var(--ad-bg-canvas);color:var(--ad-fg-primary)}#root{max-width:100%;height:100vh}button,input{font:inherit}" });
    await page.addScriptTag({ content: result.outputFiles[0].text });
    await page.getByLabel("Module draft").fill("unsaved module draft");
    await page.getByRole("tab", { name: "动作", exact: true }).click();
    const action = page.getByRole("region", { name: "动作目录", exact: true });
    await action.getByRole("option").first().waitFor(); assert.equal(await action.getByRole("option").count(), 100);
    await action.getByRole("option").first().click(); await action.getByText("9223372036854775807", { exact: true }).waitFor();
    await page.evaluate(() => { (window as any).fixture.failMore = true; });
    await action.getByRole("button", { name: "加载更多" }).click(); await action.getByRole("alert").waitFor();
    assert.equal(await action.getByRole("option").count(), 100); assert.equal(await action.getByRole("button", { name: "加载更多" }).isDisabled(), true);
    assert.match(await action.getByRole("status").textContent() ?? "", /已过期/);
    await page.evaluate(() => { const state=(window as any).fixture;state.failMore=false;state.failFirst=true; });
    await action.getByLabel("刷新资源目录").click(); await action.getByRole("alert").waitFor();
    assert.equal(await action.getByRole("option").count(), 100); assert.match(await action.getByRole("status").textContent() ?? "", /已过期/);
    await page.evaluate(() => { const state=(window as any).fixture;state.failFirst=false;state.version++; });
    await action.getByLabel("刷新资源目录").click(); await action.getByRole("button", { name: "加载更多" }).waitFor();
    await page.waitForFunction(() => !document.querySelector('[aria-label="动作目录"] [role="status"]')?.textContent?.includes("过期"));
    await action.getByRole("button", { name: "加载更多" }).click(); await page.waitForFunction(() => document.querySelectorAll('[aria-label="动作目录"] [role="option"]').length === 102);
    assert.equal(await page.evaluate(() => { const calls=(window as any).fixture.requests;const last=calls.at(-1);return last.body.expectedSnapshotId===last.owner+'-action-2'&&last.body.skip===100; }), true);
    await page.getByRole("tab", { name: "子程序", exact: true }).click();
    const sub = page.getByRole("region", { name: "全局子程序目录" }); await sub.getByRole("option").first().waitFor(); assert.equal(await sub.getByRole("option").count(), 3);
    await sub.getByRole("option").first().click(); await sub.getByText("%%fixture", { exact: true }).waitFor();
    await sub.getByLabel("筛选资源").fill("filtered"); await page.waitForFunction(() => document.querySelectorAll('[aria-label="全局子程序目录"] [role="option"]').length === 1);
    await page.getByRole("tab", { name: "模块", exact: true }).click(); assert.equal(await page.getByLabel("Module draft").inputValue(), "unsaved module draft");
    await page.getByRole("tab", { name: "动作", exact: true }).click(); await action.getByRole("option").first().waitFor();
    await page.evaluate(() => { const state=(window as any).fixture;state.hold=true; }); await action.getByLabel("刷新资源目录").click();
    await page.waitForFunction(() => (window as any).fixture.pending.length === 1); await page.evaluate(() => (window as any).fixture.owner("b"));
    await action.getByRole("option").first().filter({ hasText: "b action 0" }).waitFor();
    assert.equal(await page.evaluate(() => (window as any).fixture.requests.some((call: any) => call.owner==='a'&&call.signal.aborted)), true);
    await page.evaluate(() => (window as any).fixture.pending.shift()()); assert.equal(await action.getByRole("option").filter({ hasText: "a action" }).count(), 0);
    const before = await page.evaluate(() => (window as any).fixture.requests.length);
    for (const owner of ["loading", "unbound", "unsupported"]) {
      await page.evaluate((id) => (window as any).fixture.owner(id), owner);
      await action.getByRole("status").filter({ hasText: owner === "unsupported" ? "不支持" : "尚未绑定" }).waitFor();
      assert.equal(await action.getByRole("option").count(), 0);
    }
    assert.equal(await page.evaluate(() => (window as any).fixture.requests.length), before);
    await page.evaluate(() => (window as any).fixture.owner("b")); await action.getByRole("option").first().waitFor();
    await page.evaluate(() => { (window as any).fixture.hold=true; }); await action.getByLabel("刷新资源目录").click();
    await page.waitForFunction(() => (window as any).fixture.pending.length === 1); await page.evaluate(() => (window as any).fixture.active(false));
    await page.waitForFunction(() => (window as any).fixture.requests.at(-1).signal.aborted);
    await page.evaluate(() => { const state=(window as any).fixture;state.pending.shift()();state.active(true); }); await action.getByRole("option").first().waitFor();
    await mkdir("../.tmp", { recursive: true });
    for (const theme of ["dark", "light"]) {
      await page.evaluate((value) => document.documentElement.dataset.theme=value, theme);
      await page.screenshot({ path: `../.tmp/resource-catalog-${theme}.png` });
    }
    await page.setViewportSize({ width: 360, height: 700 }); await page.screenshot({ path: "../.tmp/resource-catalog-narrow.png" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.evaluate(() => (window as any).fixture.snapshot()===(window as any).fixture.original), true, "catalog navigation never mutates document content/history");
    assert.deepEqual(errors, []); await page.evaluate(() => (window as any).fixture.dispose());
  } finally { await browser.close(); }
});
