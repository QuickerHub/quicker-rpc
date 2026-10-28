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
const ownedRoot = path.resolve(gui, "../.tmp/r4-tool-result-details");
const require = createRequire(path.join(gui, "package.json"));
const entry = `
import React,{StrictMode,useLayoutEffect,useState} from 'react';import{createRoot}from'react-dom/client';
import{ToolPart}from'@/components/chat/ToolPart';import{ToolPayloadView}from'@/components/chat/tool-output';
import{buildModelFacingToolOutput}from'@/lib/tool-result-model-messages';
import{WorkspaceExplorerShellProvider,WorkspaceExplorerPanelProvider}from'@/lib/workspace-explorer';
import '@/app/globals.css';
const id='11111111-1111-4111-8111-111111111111';
const result=(data,extra={})=>({ok:true,exitCode:0,source:'local',data,...extra});
const cases=[
 {key:'known',tool:'qkrpc_action_set_metadata',input:{id},output:result({id,title:'Stored title',message:'Stored',answer:'known_full_answer',futureField:0}),text:'known_full_answer',visual:true},
 {key:'unknown',tool:'future_extension',input:{id},output:result({id,message:'Finished',answer:'unknown_full_answer'}),text:'unknown_full_answer',visual:true},
 {key:'display',tool:'future_extension',input:{id},output:result({id,message:'Indexed',answer:'OWNED_UI_MODEL_ONLY'},{displayData:{id,message:'Full indexed result',answer:'OWNED_UI_FULL_RESULT',futureField:0,enabled:false}}),text:'OWNED_UI_FULL_RESULT',visual:true},
 {key:'whitespace',tool:'future_extension',input:{id},output:result({id,message:'  \\n\\t ',answer:'whitespace_full_answer'}),text:'whitespace_full_answer',visual:true},
 {key:'meaningful',tool:'future_extension',input:{id},output:result({id,answer:'meaningful_full_answer'}),text:'meaningful_full_answer',visual:true},
 {key:'failure',tool:'future_extension',input:{id},output:{ok:false,exitCode:1,data:{id,message:'Failed',answer:'failure_full_answer'},stderr:'Original extension failure'},text:'failure_full_answer',failure:true,visual:true},
 {key:'framework',tool:'future_extension',input:{},errorText:'Original SDK failure',text:'Original SDK failure',failure:true},
 {key:'plain',tool:'future_extension',input:{},output:'unstructured_full_answer',text:'unstructured_full_answer',visual:true},
 {key:'partial',tool:'qkrpc_action_save',input:{dir:'.tmp/synthetic-source',dryRun:false},output:{ok:false,exitCode:1,data:{ok:false,error:'SOURCE_CHECKPOINT_FAILED',data:{persisted:true}},stderr:'Original checkpoint failure'},text:'Original checkpoint failure',partial:true,visual:true},
 {key:'compact',tool:'future_extension',input:{},output:result({message:'Finished',answer:'compact_full_answer'}),text:'compact_full_answer',compact:true,visual:true},
 {key:'outcome',tool:'qkrpc_action_delete',input:{id},output:result({action:'delete',actionId:id,message:'Deleted'}),text:'Deleted',outcome:true},
 {key:'blank',tool:'future_extension',input:{},output:result('  '),blank:true},
 {key:'null',tool:'future_extension',input:{},output:result(null),blank:true},
];
const parts=cases.map(c=>({type:'dynamic-tool',toolName:c.tool,toolCallId:'original-'+c.key,state:c.errorText?'output-error':'output-available',input:c.input,output:c.output,errorText:c.errorText}));
const models=()=>JSON.stringify(parts.filter(p=>p.state==='output-available').map(p=>buildModelFacingToolOutput(p.output)));
const state=window.toolDetailsFixture={cases,parts,before:JSON.stringify(parts),modelsBefore:models()};
function App(){const[index,setIndex]=useState(0),[part,setPart]=useState(parts[0]);
 state.history=()=>setPart(JSON.parse(JSON.stringify(parts[index])));
 useLayoutEffect(()=>{state.part=part;state.index=index});
 return <WorkspaceExplorerShellProvider><WorkspaceExplorerPanelProvider cwd=""><nav>{cases.map((c,i)=><button key={c.key} data-case={c.key} onClick={()=>{setIndex(i);setPart(parts[i])}}>{c.key}</button>)}</nav>
 <main data-current={cases[index].key}><ToolPart key={part.toolCallId} messageId="original-message" partIndex={0} part={part}/>
 {cases[index].compact?<section data-compact><ToolPayloadView label="结果" compact value={part.output} input={part.input}/></section>:null}</main>
 </WorkspaceExplorerPanelProvider></WorkspaceExplorerShellProvider>}
const root=createRoot(document.getElementById('root'));state.unmount=()=>root.unmount();state.modelsNow=models;root.render(<StrictMode><App/></StrictMode>);
`;

async function removeOwnedProfile(profile: string) {
  const root = await realpath(ownedRoot), resolved = await realpath(profile), relative = path.relative(root, resolved);
  assert.ok(relative && !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
  await rm(resolved, { recursive: true, force: true });
}

test("real ToolPart details and compact bodies preserve additional results through history, themes and narrow windows", { timeout: 90_000 }, async () => {
  await mkdir(ownedRoot, { recursive: true });
  const compiled = await build({ stdin: { contents: entry, loader: "tsx", resolveDir: gui }, absWorkingDir: gui, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", outfile: "tool-details-fixture.js", tsconfig: path.join(gui, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" }, plugins: [{ name: "installed-icon-modules", setup(builder) {
      builder.onResolve({ filter: /^@iconify\/icons-mdi\// }, input => ({ path: require.resolve(input.path) }));
    } }],
  });
  const profile = await mkdtemp(path.join(ownedRoot, "profile-")), evidence = path.join(ownedRoot, `evidence-${randomUUID()}`);
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined, page: Page | undefined;
  const errors: string[] = [], requests: string[] = [], samples: unknown[] = [];
  try {
    context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true, serviceWorkers: "block" });
    page = await context.newPage(); page.setDefaultTimeout(5_000);
    page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    const origin = `http://localhost/r4-tool-details-${randomUUID()}`;
    await page.route("**/*", route => {
      if (route.request().url() === origin) return route.fulfill({ contentType: "text/html", body: '<!doctype html><html data-theme="light"><head><link rel="icon" href="data:,"></head><body><div id="root"></div></body></html>' });
      requests.push(route.request().url()); return route.abort();
    });
    await page.goto(origin); await page.addStyleTag({ content: compiled.outputFiles.find(file => file.path.endsWith(".css"))!.text });
    await page.addScriptTag({ content: compiled.outputFiles.find(file => file.path.endsWith(".js"))!.text });
    await page.locator('main[data-current="known"] .tool-summary').waitFor();
    const cases = await page.evaluate(() => (window as any).toolDetailsFixture.cases.map(({ key, text, failure, partial, compact, outcome, blank, visual }: any) => ({ key, text, failure, partial, compact, outcome, blank, visual })));
    for (const sample of [{ width: 1024, height: 720, theme: "light" }, { width: 420, height: 650, theme: "dark" }, { width: 420, height: 650, theme: "light" }]) {
      await page.setViewportSize(sample); await page.evaluate(theme => document.documentElement.dataset.theme = theme, sample.theme);
      for (const current of cases) {
        await page.locator(`[data-case="${current.key}"]`).click();
        const row = page.locator(`main[data-current="${current.key}"] .tool-summary`); await row.waitFor();
        if (current.failure) assert.match(await row.innerText(), /失败/);
        if (current.partial) assert.match(await row.innerText(), /已写入动作.*基线更新失败.*勿重试/);
        if (current.compact) assert.match(await page.locator('[data-compact]').innerText(), /compact_full_answer/);
        await row.click(); const dialog = page.getByRole("dialog"); await dialog.waitFor();
        const visual = dialog.getByRole("tab", { name: "可视化", exact: true });
        assert.equal(await visual.isDisabled(), !current.visual, `${current.key}: generic visual availability`);
        if (!(await visual.isDisabled())) await visual.click();
        if (!current.blank) assert.ok((await dialog.locator('.tool-result-popup-body').innerText()).includes(current.text), `${current.key}: full result is reachable`);
        if (current.key === "display") {
          const body = await dialog.locator('.tool-result-popup-body').innerText();
          assert.match(body, /futureField\s+0/); assert.match(body, /enabled\s+false/);
          assert.ok(!body.includes("OWNED_UI_MODEL_ONLY"), "Visual uses the full UI payload");
        }
        const geometry = await dialog.evaluate(element => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight }; });
        assert.ok(geometry.left >= 0 && geometry.right <= geometry.width && geometry.top >= 0 && geometry.bottom <= geometry.height, "Details remain in the viewport");
        if (current.key === "display") {
          await mkdir(evidence, { recursive: true }); await page.screenshot({ path: path.join(evidence, `display-${sample.width}-${sample.theme}.png`) });
        }
        await dialog.getByRole("tab", { name: "模型数据", exact: true }).click();
        assert.equal(await dialog.locator('.tool-body--popup-model').count(), 1);
        if (current.key === "display") {
          const body = await dialog.locator('.tool-body--popup-model').innerText();
          assert.ok(body.includes("OWNED_UI_MODEL_ONLY")); assert.ok(!body.includes("OWNED_UI_FULL_RESULT"), "Full UI payload stays in its closed UI-only details");
          const projected = await page.evaluate(() => {
            const f = (window as any).toolDetailsFixture; return JSON.parse(f.modelsNow())[f.parts.filter((p: any) => p.state === 'output-available').findIndex((p: any) => p.toolCallId === 'original-display')];
          });
          assert.equal(projected.data.answer, "OWNED_UI_MODEL_ONLY"); assert.equal("displayData" in projected, false);
        }
        await dialog.getByRole("button", { name: "关闭", exact: true }).last().click(); await dialog.waitFor({ state: "hidden" });
        await page.evaluate(() => { const f = (window as any).toolDetailsFixture; f.row = document.querySelector('main .tool-summary'); f.history(); });
        await page.waitForFunction(() => { const f = (window as any).toolDetailsFixture; return f.part !== f.parts[f.index] && JSON.stringify(f.part) === JSON.stringify(f.parts[f.index]); });
        assert.equal(await page.evaluate(() => (window as any).toolDetailsFixture.row === document.querySelector('main .tool-summary')), true);
        await row.click(); await dialog.waitFor(); assert.equal(await visual.isDisabled(), !current.visual, `${current.key}: history visual availability`); if (!(await visual.isDisabled())) await visual.click();
        if (!current.blank) assert.ok((await dialog.locator('.tool-result-popup-body').innerText()).includes(current.text), `${current.key}: history retains full result`);
        await dialog.getByRole("button", { name: "关闭", exact: true }).last().click(); await dialog.waitFor({ state: "hidden" });
        samples.push({ ...sample, key: current.key, geometry });
      }
    }
    assert.equal(await page.evaluate(() => { const f = (window as any).toolDetailsFixture; return JSON.stringify(f.parts) === f.before && f.modelsNow() === f.modelsBefore; }), true, "UI projection preserves original history and model payloads");
    assert.deepEqual(errors, []); assert.deepEqual(requests, [], "No model, service, native operation or external network is permitted");
  } finally {
    try {
      if (page && !page.isClosed()) {
        await mkdir(evidence, { recursive: true });
        await page.screenshot({ path: path.join(evidence, "final.png") }).catch(() => {});
        await writeFile(path.join(evidence, "result.json"), JSON.stringify({ samples, errors, requests, body: await page.locator('body').innerText().catch(() => '') }, null, 2));
        await page.evaluate(() => (window as any).toolDetailsFixture?.unmount()).catch(() => {});
      }
    } finally {
      try { await context?.close(); } finally { await removeOwnedProfile(profile); }
    }
  }
});
