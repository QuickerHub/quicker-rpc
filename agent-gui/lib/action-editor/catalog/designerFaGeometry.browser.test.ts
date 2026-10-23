import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

const fixture = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { DesignerCatalogProvider } from '@/lib/action-editor/catalog/DesignerCatalogProvider';
import { createDesignerCatalogPort } from '@/lib/action-editor/catalog/designerCatalogPort';
import { IconControl } from '@/lib/action-editor/shared/IconControl';
import { ActionProjectMetaSummary } from '@/components/workspace/ActionProjectMetaSummary';
import StepListEditor from '@/lib/action-editor/steps/StepListEditor';
import { ActionStep } from '@/lib/action-editor/types/common';
import { StepRunnerItem } from '@/lib/action-editor/types/action_query';
const spec='fa:Light_Fixture:#123456';
const state=window.fixture={requests:[],catalogRequests:[],pending:new Map(),globalReads:window.__faImportReads??0,globalFetches:0,allowGlobal:false};
Object.defineProperty(window,'localStorage',{configurable:true,get(){state.globalReads++;if(!state.allowGlobal)throw new Error('scoped global persistence');return {getItem:()=>null,setItem:()=>{},removeItem:()=>{}};}});
window.fetch=async(url,init)=>{
 const body=JSON.parse(init.body);
 if(!body.catalogContext){state.globalFetches++;if(!state.allowGlobal)throw new Error('scoped global fetch');return Response.json({ok:true,items:[{spec:'fa:Light_Legacy',enumName:'Light_Legacy',path:'M1 2L3 4',width:27,height:13}],errors:[]});}
 const id=body.catalogContext.expectedProjectBinding.hostBinding.hostInstanceId;
 if(String(url)!=='/api/fa/resolve'){
   state.catalogRequests.push({url,id});
   if(String(url).endsWith('/list'))return Response.json({ok:true,items:[runner]});
   if(String(url).endsWith('/get'))return Response.json({ok:true,item:{...runner,key:body.key}});
   if(String(url).endsWith('/subprogram-io'))return Response.json({ok:true,found:true,displayName:'global-'+id,icon:spec,variables:[]});
   if(String(url).endsWith('/summaries'))return Response.json({ok:true,items:[]});
   throw new Error('Unexpected fixture catalog '+url);
 }
 state.requests.push({id,body,signal:init.signal});
 return new Promise(resolve=>{state.pending.set(id,()=>resolve(Response.json({ok:true,items:body.specs.map(value=>({spec:value,enumName:'Light_Fixture',path:id==='a'?'M1 1L2 2':id==='b'?'M3 3L4 4':id==='late-a'?'M5 5L6 6':'M7 7L8 8',width:37,height:19,color:'#123456'})),errors:[]})));});
};
const scope=id=>({cwd:'C:/fixture',projectDirectory:'.quicker/actions/'+id,expectedProjectBinding:{schemaVersion:1,kind:'action',actionId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',hostBinding:{hostInstanceId:id,hostSessionId:'a'.repeat(32),endpoint:'QuickerRpc_User_'+ 'C'.repeat(24)+'_'+'a'.repeat(32),protocolVersion:1,schemaVersion:1,hostKind:'v1',capabilities:{},quickerVersion:id}}});
const a=createDesignerCatalogPort(scope('a')),b=createDesignerCatalogPort(scope('b'));
const lateA=createDesignerCatalogPort(scope('late-a')),lateB=createDesignerCatalogPort(scope('late-b'));
const loading=createDesignerCatalogPort(null),unbound=createDesignerCatalogPort({...scope('unbound'),expectedProjectBinding:null});
const runner=StepRunnerItem.fromPartial({key:'sys:fixture',name:'Fixture runner',icon:spec,inputParamDefs:[],outputParamDefs:[]});
for(const port of [a,b,loading,unbound])port.set('list',[runner]);
const steps=[ActionStep.fromPartial({stepId:'fixture-step',stepRunnerKey:'sys:fixture'}),ActionStep.fromPartial({stepId:'global-step',stepRunnerKey:'sys:subprogram',inputParams:{subProgram:{value:'%%bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',varKey:''}}})];
function Surface({name,port}){return <DesignerCatalogProvider port={port}><section data-surface={name}><ActionProjectMetaSummary icon={spec} title={'title-'+name}/><IconControl spec={spec} size={22}/>{port&&name!=='late'&&<StepListEditor steps={steps} variables={[]} onCommitSteps={()=>{}} programDocumentKey={name}/>}{createPortal(<div data-portal={name}><IconControl spec={spec} size={18}/></div>,document.getElementById('portals'))}</section></DesignerCatalogProvider>;}
function App(){const [next,setNext]=useState(false),[legacy,setLegacy]=useState(false);state.switch=()=>setNext(true);state.legacy=()=>{state.allowGlobal=true;setLegacy(true)};return <><Surface name="a" port={a}/><Surface name="b" port={b}/><Surface name="loading" port={loading}/><Surface name="unbound" port={unbound}/><Surface name="unresolved"/><Surface name="late" port={next?lateB:lateA}/>{legacy&&<div data-legacy><IconControl spec="fa:Light_Legacy"/></div>}</>;}
state.resolve=id=>state.pending.get(id)?.();state.dispose=()=>{for(const port of [a,b,lateA,lateB,loading,unbound])port.dispose();root.unmount();};
const root=createRoot(document.getElementById('root'));root.render(<App/>);
`;

test("document FA previews and portals isolate hosts, deny global reads and ignore a departed owner's late geometry", { timeout: 30_000 }, async () => {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  const compiled = await build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", loader: { ".css": "empty" }, tsconfig: path.join(process.cwd(), "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "bundled-svg", setup(builder) {
      builder.onResolve({ filter: /^@iconify\/icons-mdi\// }, (args) => ({ path: require.resolve(args.path) }));
    } }] });
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
  try {
    const page = await browser.newPage(); const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message)); await page.route("**/*", (route) => route.abort());
    await page.setContent('<div id="root"></div><div id="portals"></div>');
    await page.evaluate(() => {
      (window as any).__faImportReads = 0;
      Object.defineProperty(window, "localStorage", { configurable: true, get() { (window as any).__faImportReads++; throw new Error("import read global persistence"); } });
    });
    await page.addScriptTag({ content: compiled.outputFiles[0].text });
    await page.waitForFunction(() => (window as any).fixture?.pending.size === 3);
    assert.deepEqual(await page.evaluate(() => { const state = (window as any).fixture; return [state.globalReads, state.globalFetches, state.requests.map((request: any) => request.id).sort()]; }), [0, 0, ["a", "b", "late-a"]]);
    await page.evaluate(() => { (window as any).fixture.resolve("a"); (window as any).fixture.resolve("b"); });
    await page.locator('[data-surface="a"] path[d="M1 1L2 2"]').first().waitFor();
    await page.locator('[data-portal="a"] path[d="M1 1L2 2"]').waitFor();
    await page.locator('[data-surface="b"] path[d="M3 3L4 4"]').first().waitFor();
    assert.equal(await page.locator('[data-surface="a"] svg').first().getAttribute("viewBox"), "0 0 37 19");
    assert.equal(await page.locator('[data-surface="a"] path').first().getAttribute("fill"), "#123456");
    assert.equal(await page.locator('[data-surface="a"] [role="img"]').getAttribute("aria-label"), "title-a");
    for (const name of ["loading", "unbound", "unresolved"]) assert.equal(await page.locator(`[data-surface="${name}"] path[fill="#123456"],[data-portal="${name}"] path`).count(), 0);
    await page.locator('[data-surface="a"]').getByText("global-a", { exact: true }).first().waitFor();
    await page.locator('[data-surface="b"]').getByText("global-b", { exact: true }).first().waitFor();
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.catalogRequests.every((request: any) => ["a", "b"].includes(request.id))), true);
    await page.evaluate(() => (window as any).fixture.switch());
    await page.waitForFunction(() => (window as any).fixture.pending.has("late-b"));
    assert.equal(await page.evaluate(() => (window as any).fixture.requests.find((request: any) => request.id === "late-a").signal.aborted), true);
    await page.evaluate(() => { (window as any).fixture.resolve("late-b"); (window as any).fixture.resolve("late-a"); });
    await page.locator('[data-surface="late"] path[d="M7 7L8 8"]').first().waitFor();
    assert.equal(await page.locator('[data-surface="late"] path[d="M5 5L6 6"],[data-portal="late"] path[d="M5 5L6 6"]').count(), 0);
    assert.deepEqual(await page.evaluate(() => [(window as any).fixture.globalReads, (window as any).fixture.globalFetches]), [0, 0]);
    await page.evaluate(() => (window as any).fixture.legacy());
    await page.locator('[data-legacy] path[d="M1 2L3 4"]').waitFor();
    assert.equal(await page.evaluate(() => (window as any).fixture.globalFetches), 1);
    assert.ok(await page.evaluate(() => (window as any).fixture.globalReads > 0)); assert.deepEqual(errors, []);
    await page.evaluate(() => (window as any).fixture.dispose());
  } finally { await browser.close(); }
});
