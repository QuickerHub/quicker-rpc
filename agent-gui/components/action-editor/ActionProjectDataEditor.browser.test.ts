import assert from "node:assert/strict";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

// The complete editor/controller graph is real. Only host/file/chrome boundaries
// are replaced, and browser requests can never reach a server or user workspace.
const fixture = `
import React, { StrictMode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ActionProjectDataEditor } from '@/components/action-editor/ActionProjectDataEditor';
import { StepRunnerItem } from '@/lib/action-editor/types/action_query';
import '@/app/globals.css';
const pathFor = id => '.quicker/actions/'+(id==='a'?'11111111-1111-4111-8111-111111111111':'22222222-2222-4222-8222-222222222222')+'/data.json';
const step = (id, note) => ({stepId:id,stepRunnerKey:'sys:fixture_note',note,inputParams:{'script.file':'files/script.cs'},fixtureStep:{keep:true}});
const body = id => ({steps:[step('s-'+id, id+' initial')],variables:[{id:'v-'+id,key:'var_'+id,varType:'Text','default.file':'files/default.txt',fixtureVariable:{keep:true}}]});
const makeDocument = id => JSON.stringify({...body(id),subPrograms:[{id:'child',name:'Child',kind:1,...body('child'),subPrograms:[{id:'nested',name:'Nested',kind:1,...body('nested'),subPrograms:[]}]}],fixtureRoot:{keep:true}},null,2)+'\\n';
const makeInfo = id => '{"kind":"action","id":"'+pathFor(id).split('/').at(-2)+'","title":"Fixture action","description":"original description","icon":"iconify:mdi:code-tags","editVersion":9223372036854775807,"fixtureFuture":9007199254740993}';
const runner = StepRunnerItem.fromPartial({key:'sys:fixture_note',name:'Fixture module',icon:'iconify:mdi:code-tags',inputParamDefs:[],outputParamDefs:[]});
const capability = StepRunnerItem.fromPartial({key:'sys:fixture_capability',name:'Fixture capability',category:'Text',secondaryCategories:['System'],inputParamDefs:[{key:'mode',name:'Mode',isControlField:true,varType:9,variableMode:1,allowInput:true,selectionItems:[{value:'copy',name:'Copy fixture'}]},{key:'text',name:'Text',varType:0,variableMode:1,allowInput:true}],outputParamDefs:[]});
const state = window.fixture = {calls:[],saved:[],requests:[],unexpected:[],pending:[],mode:'success',pathFor,makeDocument};
const bindingFor=id=>({schemaVersion:1,kind:'action',actionId:pathFor(id).split('/').at(-2),hostBinding:{hostInstanceId:'instance-'+id,hostSessionId:(id==='a'?'a':'b').repeat(32),endpoint:'QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_'+(id==='a'?'a':'b').repeat(32),protocolVersion:1,schemaVersion:1,hostKind:id==='a'?'v1':'v2',quickerVersion:window.fixtureOptions?.invalidVersion?{future:true}:'fixture-'+id,capabilities:{'action.legacyBody.read':true,'action.legacyBody.write':true}}});
state.targetFiles=Object.fromEntries(['a','b'].map(id=>[pathFor(id),bindingFor(id)]));state.targetMode=window.fixtureOptions?.targetMode||'bound';state.targetPending=[];state.transportCalls=[];
state.infoFiles=Object.fromEntries(['a','b'].map(id=>[pathFor(id).replace(/data.json$/,'info.json'),makeInfo(id)]));
state.documentCalls=[];state.documentPending=[];state.documentMode='success';
state.syncCalls=[];state.syncPending=[];state.syncMode='success';
state.catalogRequests=[];state.catalogPending=[];
state.faRequests=[];state.faPending=[];state.geometryRequests=[];state.faMode='success';
state.resolveFaPending=(index,tag)=>state.faPending[index].resolve(tag);
state.syncStatusMode='success';state.statusPending=[];
state.deferInfoRead=false;state.infoPending=[];state.infoReadError=null;
state.syncStatus={state:'in_sync',message:'fixture in sync',localEditVersion:1,remoteEditVersion:1};
state.commitDocument=(request,outcome)=>{if(request.metadata&&(outcome.ok||outcome.persistedParts?.metadata))state.infoFiles[request.path.replace(/data.json$/,'info.json')]=request.metadata.content;return outcome;};
window.fetch = async (input, init) => {
 const url = new URL(typeof input==='string'?input:input.url,'http://fixture.invalid');
 state.requests.push(url.pathname);
 let value;
 let syncRequest;
 const catalogRequest=init?.method==='POST'?JSON.parse(init.body||'{}'):{key:url.searchParams.get('key')};
 if(url.pathname.startsWith('/api/step-runner/')||url.pathname==='/api/subprogram/list')state.catalogRequests.push({path:url.pathname,method:init?.method||'GET',body:catalogRequest});
 if(url.pathname==='/api/workspace' && url.searchParams.get('op')==='program-document-target') {
   const path=url.searchParams.get('path');
   const result=state.targetMode==='error'?{ok:false,code:'unsafe_path',error:'fixture unsafe target'}:{ok:true,projectDirectory:path.replace(/\\/data.json$/,''),projectBinding:state.targetMode==='unbound'?null:state.targetFiles[path]};
   value=state.targetMode==='defer'?await new Promise(resolve=>state.targetPending.push({path,resolve:()=>resolve(result)})):result;
 }
 else if(url.pathname==='/api/workspace' && init?.method==='POST') {
   const request=JSON.parse(init.body);state.transportCalls.push(request);value=await state.legacySave(request.content);
 }
 else if(url.pathname==='/api/workspace/action-sync') {
   const request=JSON.parse(init?.body||'{}');state.syncCalls.push(request);
   syncRequest=request;
   if(request.op==='status' && state.syncStatusMode==='defer')value=await new Promise(resolve=>state.statusPending.push({request,resolve}));
   else if(request.op==='status')value={ok:true,status:state.syncStatus};
   else if(request.op==='push' && state.syncMode==='defer')value=await new Promise(resolve=>state.syncPending.push({request,resolve}));
   else if(request.op==='push')value={ok:true,message:'fixture synced',editVersion:2};
   else {state.unexpected.push('sync:'+request.op);throw new Error('Unexpected sync operation');}
 }
 else if(url.pathname==='/api/step-runner/list') value={ok:true,items:[runner,capability]};
 else if(url.pathname==='/api/step-runner/get' && catalogRequest.key==='sys:fixture_note') {
   const id=catalogRequest.catalogContext?.expectedProjectBinding?.hostBinding?.hostInstanceId?.endsWith('-b')?'b':'a';
   const item=window.fixtureOptions?.catalogByTarget?StepRunnerItem.fromPartial({...runner,inputParamDefs:[{key:id+'_input',name:id.toUpperCase()+' parameter',varType:0,variableMode:1,allowInput:true}]}):runner;
   const result={ok:true,item};
   value=window.fixtureOptions?.catalogDeferA&&id==='a'?await new Promise(resolve=>state.catalogPending.push({id,resolve:()=>resolve(result)})):result;
 }
 else if(url.pathname==='/api/step-runner/get' && catalogRequest.key==='sys:fixture_capability') value={ok:true,item:capability};
 else if(url.pathname==='/api/step-runner/get' && catalogRequest.key==='sys:subprogram') value={ok:true,item:StepRunnerItem.fromPartial({key:'sys:subprogram',name:'调用子程序',inputParamDefs:[{key:'subProgram',name:'子程序',varType:0,variableMode:1,allowInput:true}],outputParamDefs:[]})};
 else if(url.pathname==='/api/step-runner/get' && ['future:branch','sys:future:branch'].includes(catalogRequest.key)) value={ok:true,item:StepRunnerItem.fromPartial({key:catalogRequest.key,name:'Future branch fixture',inputParamDefs:[],outputParamDefs:[]})};
 else if(url.pathname==='/api/step-runner/toolbox-search') value={ok:true,json:JSON.stringify({items:[{kind:'runner',id:'r:sys:fixture_capability:copy',label:'Copy fixture',parentLabel:'Fixture capability',payload:{stepRunnerKey:'sys:fixture_capability',name:'Fixture capability',controlFieldValue:'copy',inputPresets:{mode:'copy',text:'preset text'}}}],totalCount:1,hasMore:false})};
 else if(url.pathname==='/api/step-runner/summaries') {const request=JSON.parse(init?.body||'{}');value={ok:true,items:(request.steps||[]).map(row=>({stepId:row.stepId,summary:'Fixture summary'}))};}
 else if(url.pathname==='/api/subprogram/list') value={ok:true,items:[]};
 else if(url.pathname==='/api/fa/page') {
   if(!catalogRequest.catalogContext?.expectedProjectBinding){state.unexpected.push('unbound fa page');throw new Error('Unbound FA page');}
   const letter=catalogRequest.catalogContext.expectedProjectBinding.hostBinding.hostInstanceId.endsWith('-b')?'b':'a';
   const q=catalogRequest.query,style=catalogRequest.style,skip=catalogRequest.skip,take=catalogRequest.take;
   const namesFor=(prefix,count)=>Array.from({length:q==='empty'?0:count},(_,i)=>prefix+'_'+letter+'_'+q+'_'+i);
   const catalogs={Solid:namesFor('Solid',2),Regular:namesFor('Regular',98),Brands:namesFor('Brands',5),Light:namesFor('Light',210)};
   const all=style?catalogs[style]||[]:Object.values(catalogs).flat();
   const result={ok:true,query:q,style,skip,take,names:all.slice(skip,skip+take),totalCount:all.length,hasMore:skip+take<all.length};
   const row={body:catalogRequest,aborted:false};state.faRequests.push(row);
   init.signal?.addEventListener('abort',()=>{row.aborted=true},{once:true});
   if(state.faMode==='more-fail'&&skip>0)return new Response(JSON.stringify({ok:false,code:'PAGE_READ_FAILED',error:'fixture next page failed',retryable:false}),{status:503,headers:{'Content-Type':'application/json'}});
   if(state.faMode==='unsupported')return new Response(JSON.stringify({ok:false,code:'UNSUPPORTED_HOST',error:'fixture page unsupported',retryable:false}),{status:503,headers:{'Content-Type':'application/json'}});
   value=state.faMode==='defer'?await new Promise(resolve=>state.faPending.push({row,resolve:tag=>resolve(tag?{...result,names:result.names.map(name=>name.replace('_'+letter+'_','_'+tag+'_'))}:result)})):result;
 }
 else if(url.pathname==='/api/fa/resolve') {
   if(!catalogRequest.catalogContext?.expectedProjectBinding){state.unexpected.push('unbound fa geometry');throw new Error('Unbound FA geometry');}
   state.geometryRequests.push(catalogRequest);
   value={ok:true,items:catalogRequest.specs.map(spec=>({spec,enumName:spec.slice(3).split(':')[0],path:'M0 0H20V20H0Z',width:20,height:20,color:spec.split(':')[2]||null})),errors:[]};
 }
 else {state.unexpected.push(url.pathname+url.search+(url.pathname==='/api/step-runner/get'?':'+catalogRequest.key:''));throw new Error('Unexpected fixture request: '+url.pathname+url.search);}
 if(syncRequest?.expectedProjectBinding&&value.ok)value={...value,projectBinding:syncRequest.expectedProjectBinding,projectDirectory:syncRequest.projectDirectory};
 return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
};
function Fixture(){
 const [document,setDocument]=useState({path:pathFor('a'),content:makeDocument('a')});
 const [documentSaveEnabled,setDocumentSaveEnabled]=useState(false);
 const [generation,setGeneration]=useState(0);
 const [visible,setVisible]=useState(true);
 useLayoutEffect(()=>{
   if(visible||!state.probeHiddenColorOwner)return;
   const escape=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});
   globalThis.document.body.dispatchEvent(escape);
   state.hiddenColorOwnerProbe={prevented:escape.defaultPrevented};
 },[visible]);
 const documentRef=useRef(document);documentRef.current=document;
 const onSave=useCallback(async content=>{
   const call={path:document.path,content};state.calls.push(call);
   if(state.mode==='fail') return {ok:false,error:'fixture save rejected'};
   if(state.mode==='defer') return new Promise(resolve=>state.pending.push({call,resolve}));
   return {ok:true};
 },[document.path]);
 state.legacySave=onSave;
 const onSaveDocument=useCallback(async request=>{
   state.documentCalls.push(request);
   if(state.documentMode==='defer')return new Promise(resolve=>state.documentPending.push({request,resolve:outcome=>resolve(state.commitDocument(request,outcome))}));
   if(state.documentMode==='partial')return state.commitDocument(request,{ok:false,error:'fixture metadata write failed',persistedParts:{body:true}});
   if(state.documentMode==='conflict')return {ok:false,code:'metadata_conflict',error:'fixture external metadata conflict'};
   if(state.documentMode==='identity')return {ok:false,code:'identity_conflict',error:'fixture external target changed'};
   return state.commitDocument(request,{ok:true});
 },[]);
 const onSaved=useCallback(()=>state.saved.push(document.path),[document.path]);
 useEffect(()=>{
   state.current=()=>documentRef.current;
   state.setDocument=(id,content)=>setDocument({path:pathFor(id),content:content??makeDocument(id)});
   state.replaceContent=content=>setDocument(current=>({...current,content}));
   state.echoPending=index=>{const pending=state.pending[index];setDocument(current=>current.path===pending.call.path?{...current,content:pending.call.content}:current)};
   state.resolvePending=(index,outcome)=>state.pending[index].resolve(outcome);
   state.enableDocumentSave=()=>setDocumentSaveEnabled(true);
   state.setActive=setVisible;
   state.remountEditor=()=>setGeneration(value=>value+1);
   state.resolveDocumentPending=(index,outcome)=>state.documentPending[index].resolve(outcome);
 },[]);
 const editor=<ActionProjectDataEditor key={generation} active={!window.fixtureOptions?.exclusiveDocuments||visible} path={document.path} content={document.content} cwd="C:/fixture-workspace" onSave={onSave} onSaveDocument={documentSaveEnabled?onSaveDocument:undefined} onSaved={onSaved}/>;
 return window.fixtureOptions?.dualDocuments?<div className="fixture-shell" style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:12}}>
  <div data-fixture-document="a" hidden={window.fixtureOptions?.exclusiveDocuments&&!visible}>{editor}</div><div data-fixture-document="b" hidden={window.fixtureOptions?.exclusiveDocuments&&visible}><ActionProjectDataEditor active={!window.fixtureOptions?.exclusiveDocuments||!visible} path={pathFor('b')} content={makeDocument('b')} cwd="C:/fixture-workspace" onSave={async()=>({ok:true})} onSaveDocument={window.fixtureOptions?.exclusiveDocuments&&documentSaveEnabled?onSaveDocument:undefined}/></div>
 </div>:<div className="fixture-shell" data-fixture-path={document.path}>{editor}</div>;
}
createRoot(document.getElementById('root')).render(<StrictMode><Fixture/></StrictMode>);
`;

const fileBoundary = `
export async function fetchWorkspaceFile(_cwd,path){
 const f=window.fixture;
 if(path.endsWith('/info.json')){
  if(f.infoReadError)return{ok:false,error:f.infoReadError};
  const result={ok:true,path,content:f.infoFiles[path],truncated:false};
  if(f.deferInfoRead)return await new Promise(resolve=>f.infoPending.push({path,resolve:()=>resolve(result)}));
  return result;
 }
 if(path.endsWith('/files/script.cs'))return{ok:true,path,content:'// fixture only',truncated:false};
 if(path.endsWith('/files/default.txt'))return{ok:true,path,content:'fixture default',truncated:false};
 if(path===f.pathFor('a')||path===f.pathFor('b'))return{ok:true,path,content:path===f.current().path?f.current().content:f.makeDocument(path===f.pathFor('a')?'a':'b'),truncated:false};
 f.unexpected.push('file:'+path);return{ok:false,error:'Unknown fixture file'};
}
export async function fetchWorkspaceFileList(){return{ok:true,entries:[{path:'data.json',kind:'file'},{path:'info.json',kind:'file'},{path:'files/script.cs',kind:'file'},{path:'files/default.txt',kind:'file'}]}}
export async function writeWorkspaceFileApi(){throw new Error('No fixture file writes allowed')}
export async function deleteActionProjectApi(_cwd,path){const f=window.fixture;f.localDeletes=(f.localDeletes||[]).concat(path);return{ok:true}}
`;

let browser: Browser;
let javascript = "";
let stylesheet = "";
const closingBrowsers = new WeakSet<Browser>();
let caseOwnsBrowser = false;
let activeTest = "setup";
let pageSequence = 0;
const browserDiagnostics = process.env.QKRPC_ACTION_EDITOR_BROWSER_DIAGNOSTICS === "1";
const diagnose = (event: string) => {
  if (browserDiagnostics) console.error(JSON.stringify({ fixture: "action-project-data-editor", event, test: activeTest, pageSequence, connected: browser?.isConnected(), at: new Date().toISOString() }));
};
const requestedScreenshotDirectory = process.env.QKRPC_ACTION_EDITOR_SCREENSHOTS;
const screenshotDirectory = requestedScreenshotDirectory ? path.resolve(requestedScreenshotDirectory) : undefined;

before(async () => {
  if (screenshotDirectory) {
    const temporaryRoots = [path.resolve(process.cwd(), "../.tmp"), path.resolve(process.cwd(), "../../..", ".tmp")];
    assert.ok(path.isAbsolute(requestedScreenshotDirectory!) && temporaryRoots.some((root) => {
      const relative = path.relative(root, screenshotDirectory);
      return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
    }), "Screenshots must use an absolute directory inside workspace .tmp");
    await mkdir(screenshotDirectory, { recursive: true });
  }
  const compiled = await build({
    stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    outfile: "fixture.js",
    define: { "process.env.NODE_ENV": '"development"' },
    tsconfig: path.join(process.cwd(), "tsconfig.json"),
    plugins: [{ name: "offline-editor-boundaries", setup(builder) {
      builder.onResolve({ filter: /(^@\/components\/chat\/(FileEditorCard|ActionIcon|FaIconProvider)$|shared\/IconControl$|^@\/lib\/(workspace-file-tool|workspace-explorer-api|workspace-explorer|chat-composer-bridge|action-command-client|action-trace-client)$)/ }, (args) => ({ path: args.path, namespace: "fixture-boundary" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture-boundary" }, (args) => {
        if (args.path.endsWith("workspace-explorer-api")) return { contents: fileBoundary, loader: "js" };
        if (args.path.endsWith("workspace-file-tool")) return { contents: "export const basenamePath=value=>value.replace(/\\\\/g,'/').split('/').pop()||'';export const guessFileLanguage=()=> 'text';", loader: "js" };
        if (args.path.endsWith("chat-composer-bridge")) return { contents: "export const chatComposerActionsRef={current:{insertProgramStepTag(){},focusComposer(){}}};", loader: "js" };
        if (args.path.endsWith("action-command-client")) return { contents: "export function isQuickerActionMissingError(){return false}export function invokeActionCommand(){window.fixture.unexpected.push('unbound toolbar command');throw new Error('Toolbar must be gated')}", loader: "js" };
        if (args.path.endsWith("action-trace-client")) return { contents: "export function startActionTrace(){window.fixture.unexpected.push('unbound toolbar trace');throw new Error('Toolbar must be gated')}", loader: "js" };
        if (args.path.endsWith("workspace-explorer")) return { contents: "export const workspaceExplorerActionsRef={current:{notifyProjectRemoved(){}}};", loader: "js" };
        if (args.path.endsWith("IconControl")) return { contents: `
          import React from 'react';
          import { IconControl as ActualIconControl } from '@/lib/action-editor/shared/IconControl.tsx';
          import { IconifyIconSlot } from '@/lib/action-editor/shared/IconifyIconSlot';
          import { parseIconifyIconId } from '@/lib/action-editor/shared/parseIconifySpec';
          import { parseQuickerAssetIcon } from '@/lib/action-editor/shared/parseQuickerAssetIcon';
          import { resolveResIconToIconifyId } from '@/lib/action-editor/shared/resIconCatalog';
          import { faVectorSpecToBundledIconifyId } from '@/lib/action-editor/shared/faVectorToIconifyFallback';
          // Use the production bundled SVG renderer/assets, isolating only host/raster resolution.
          export function IconControl(props) {
            if(window.fixtureOptions?.realIcons)return <ActualIconControl {...props}/>;
            const spec = props.spec?.trim() || '';
            const asset = parseQuickerAssetIcon(spec);
            const iconId = parseIconifyIconId(spec) || (asset && resolveResIconToIconifyId(asset.path))
              || (/^fa:/i.test(spec) ? faVectorSpecToBundledIconifyId(spec) : null);
            return iconId ? <IconifyIconSlot {...props} iconId={iconId}/> : props.fallback ?? null;
          }`, loader: "jsx", resolveDir: process.cwd() };
        if (args.path.endsWith("ActionIcon")) return { contents: "export function ActionIcon(){return null}", loader: "js" };
        if (args.path.endsWith("FaIconProvider")) return { contents: "export function FaIconProvider(p){return p.children}", loader: "js" };
        if (args.path.endsWith("FileEditorCard")) return { contents: "import React from 'react';export function FileEditorCard(p){return <pre data-source-content data-source-path={p.path}>{p.content}</pre>}", loader: "jsx", resolveDir: process.cwd() };
        const name = args.path.split("/").at(-1)!;
        return { contents: `export function ${name}(){return null}`, loader: "js" };
      });
    } }],
  });
  javascript = compiled.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
  stylesheet = compiled.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "";
});

beforeEach(async (context) => {
  activeTest = context.name;
  caseOwnsBrowser = false;
  // Each case owns a fresh native process/profile; browser-wide state cannot leak across cases.
  const owned = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-gpu"] });
  browser = owned;
  caseOwnsBrowser = true;
  owned.on("disconnected", () => {
    if (browserDiagnostics) console.error(JSON.stringify({ fixture: "action-project-data-editor", event: closingBrowsers.has(owned) ? "expected-browser-disconnect" : "unexpected-browser-disconnect", test: context.name, connected: owned.isConnected(), at: new Date().toISOString() }));
  });
});
afterEach(async () => {
  if (!caseOwnsBrowser) return;
  try { assert.equal(browser.isConnected(), true, "Owned browser exited before fixture cleanup"); }
  finally { closingBrowsers.add(browser); await browser.close(); caseOwnsBrowser = false; }
});
after(async () => { if (caseOwnsBrowser) { closingBrowsers.add(browser); await browser.close(); } });

async function openFixture(options?: { targetMode?: string; invalidVersion?: boolean; catalogByTarget?: boolean; catalogDeferA?: boolean; dualDocuments?: boolean; exclusiveDocuments?: boolean; realIcons?: boolean }): Promise<{ page: Page; errors: string[] }> {
  pageSequence += 1;
  diagnose("create-page");
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("close", () => diagnose("page-closed"));
  page.setDefaultTimeout(5_000);
  const errors: string[] = [];
  await page.route("**/*", (route) => { errors.push(`network:${route.request().url()}`); return route.abort(); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.setContent('<html data-theme="light"><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: `${stylesheet}\nhtml,body,#root,.fixture-shell{height:100%;margin:0}body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--text)}.fixture-shell{display:flex;flex-direction:column;padding:12px;box-sizing:border-box}` });
  if (options) await page.evaluate((value) => { (window as any).fixtureOptions = value; }, options);
  await page.addScriptTag({ content: javascript });
  await page.waitForSelector('[data-step-id="s-a"]');
  await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  await page.locator(".program-editor-surface:visible .step-form-note-input").first().waitFor();
  return { page, errors };
}

const currentNote = (page: Page) => page.locator(".program-editor-surface:visible .step-form-note-input");
const saveButton = (page: Page) => page.locator(".action-project-data-editor-save");

async function loadPropertiesDocument(page: Page): Promise<void> {
  const call = (stepId: string) => ({ stepId, stepRunnerKey: "sys:subprogram", note: "properties fixture", inputParams: { subProgram: "Child", "script.file": "files/script.cs" }, futureStep: "__fixture_int64__" });
  const programBody = { steps: [call("s-a"), { stepId: "branch", stepRunnerKey: "future:branch", ifSteps: [call("branch-call")], elseSteps: [] }], variables: [],
      subPrograms: [{ id: "child", name: "Child", kind: 1, description: "original child description", icon: "iconify:mdi:plus", steps: [call("child-call")], variables: [], futureSub: "__fixture_int64__", subPrograms: [{ id: "nested", name: "Nested", kind: 1, steps: [call("nested-call")], variables: [] }] },
        { id: "other", name: "Other", kind: 1, steps: [], variables: [] },
        { id: "linked", name: "Linked", kind: 2, steps: [call("linked-call")], subPrograms: [{ id: "cached", name: "Foreign cached child", kind: 1, steps: [], variables: [] }] }], futureRoot: "__fixture_int64__" };
  await page.evaluate((content) => {
    const f = (window as any).fixture;
    f.enableDocumentSave();
    f.setDocument("a", content);
  }, JSON.stringify(programBody).replaceAll('"__fixture_int64__"', "9223372036854775807"));
  await page.waitForFunction(() => document.querySelector('[data-step-id="s-a"]')?.textContent?.includes("properties fixture"));
  await page.locator('[aria-label="打开或新建内部子程序"]').click();
  assert.equal(await page.locator(".program-editor-tab-menu").getByRole("button", { name: "Foreign cached child", exact: true }).count(), 0);
  await page.locator(".program-editor-tab-menu").getByRole("button", { name: "Child", exact: true }).click();
  await page.getByRole("tab", { name: "Child", exact: true }).waitFor();
}

const propertiesDialog = (page: Page) => page.getByRole("dialog", { name: "子程序属性", exact: true });

async function openProperties(page: Page, name: string): Promise<void> {
  await page.getByRole("tab", { name, exact: true }).dblclick();
  await propertiesDialog(page).getByLabel("名称", { exact: true }).waitFor();
}

async function openInternalTab(page: Page, name: string): Promise<void> {
  await page.getByLabel("打开或新建内部子程序", { exact: true }).click();
  await page.locator(".program-editor-tab-menu").getByRole("button", { name, exact: true }).click();
}

async function createInternalTab(page: Page): Promise<void> {
  await page.getByLabel("打开或新建内部子程序", { exact: true }).click();
  await page.locator(".program-editor-tab-menu").getByRole("button", { name: "新建内部子程序", exact: true }).click();
}

async function prepareInternalDelete(page: Page, name: string): Promise<void> {
  const tab = page.getByRole("tab", { name, exact: true });
  await tab.focus();
  await tab.press("Shift+F10");
  await page.getByRole("menuitem", { name: "属性…", exact: true }).focus();
  await page.keyboard.press("Tab");
  const remove = page.getByRole("menuitem", { name: "删除子程序…", exact: true });
  assert.equal(await remove.evaluate((node) => node === document.activeElement), true);
  await page.keyboard.press("Enter");
  await page.getByRole("alertdialog").waitFor();
}

const iconDialog = (page: Page) => page.getByRole("dialog", { name: "选择图标", exact: true });
async function openAppearancePicker(page: Page) {
  await page.evaluate(() => (window as any).fixture.enableDocumentSave());
  await page.getByRole("tab", { name: "属性", exact: true }).click();
  await page.getByRole("button", { name: "选择动作图标", exact: true }).click();
  await iconDialog(page).waitFor();
}

test("shared FA picker applies an icon-only appearance transaction with real scoped SVG and one document undo", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture({ realIcons: true });
  try {
    await editNote(page, "body retained while choosing an icon");
    await page.evaluate(() => { const f = (window as any).fixture; f.enableDocumentSave(); f.documentMode = "defer"; });
    await waitSaveEnabled(page); await saveButton(page).click();
    await page.waitForFunction(() => (window as any).fixture.documentPending.length === 1);
    await openAppearancePicker(page);
    const picker = iconDialog(page);
    await picker.getByRole("option", { name: "Light_a__2", exact: true }).click();
    await picker.getByTitle("#ef4444", { exact: true }).click();
    assert.match(await picker.getByLabel("所选图标预览").innerText(), /fa:Light_a__2:#EF4444/);
    assert.equal(await picker.getByRole("option", { name: "Light_a__2", exact: true }).locator("svg path").getAttribute("d"), "M0 0H20V20H0Z");
    assert.equal(await picker.getByRole("option", { name: "Light_a__2", exact: true }).locator("svg path").evaluate((element) => getComputedStyle(element).fill), "rgb(239, 68, 68)");
    await picker.getByTitle("自由选色", { exact: true }).click();
    const alpha = page.getByRole("dialog", { name: "自由颜色选择", exact: true });
    await alpha.getByLabel("十六进制颜色").fill("#80112233"); await alpha.getByLabel("十六进制颜色").press("Enter");
    await page.keyboard.press("Escape"); await alpha.waitFor({ state: "detached" });
    assert.match(await picker.getByLabel("所选图标预览").innerText(), /fa:Light_a__2:#80112233/);
    const rgba = await picker.getByRole("option", { name: "Light_a__2", exact: true }).locator("svg path").evaluate((element) => getComputedStyle(element).fill);
    assert.match(rgba, /^rgba\(17, 34, 51, /); assert.ok(Math.abs(Number(rgba.split(",").at(-1)!.replace(")", "")) - 128 / 255) < .002);
    assert.equal(await page.evaluate(() => (window as any).fixture.documentCalls.length), 1, "the picker itself never starts another save");
    await picker.getByRole("button", { name: "使用此图标", exact: true }).click();
    await picker.waitFor({ state: "detached" });
    assert.equal(await page.getByLabel("图标", { exact: true }).inputValue(), "fa:Light_a__2:#80112233");
    await page.evaluate(() => { const f = (window as any).fixture; f.resolveDocumentPending(0, { ok: true }); f.documentMode = "success"; });
    await waitSaveEnabled(page);
    assert.equal(await page.getByLabel("图标", { exact: true }).inputValue(), "fa:Light_a__2:#80112233", "an older save cannot acknowledge the picker draft");
    await waitSaveEnabled(page); await saveButton(page).click(); await waitClean(page);
    const saved = await page.evaluate(() => (window as any).fixture.documentCalls.at(-1));
    assert.ok(saved.metadata.content.includes('"icon":"fa:Light_a__2:#80112233"'));
    assert.ok(saved.metadata.content.includes("9223372036854775807")); assert.ok(saved.metadata.content.includes("9007199254740993"));
    await page.getByRole("toolbar", { name: "文档历史" }).getByTitle("撤销 (Ctrl+Z)", { exact: true }).click();
    assert.equal(await page.getByLabel("图标", { exact: true }).inputValue(), "iconify:mdi:code-tags");
    await page.getByRole("tab", { name: "主程序", exact: true }).click();
    assert.equal(await currentNote(page).inputValue(), "body retained while choosing an icon");
    const calls = await page.evaluate(() => (window as any).fixture.geometryRequests);
    assert.ok(calls.length > 0); assert.ok(calls.every((call: any) => call.catalogContext.expectedProjectBinding.hostBinding.hostInstanceId === "instance-a"));
    assert.ok(calls.some((call: any) => call.specs.length === 80), "the grid uses native batched geometry");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("shared FA picker keeps nested subprogram drafts and applies properties plus literal calls in one history entry", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture({ realIcons: true });
  try {
    await loadPropertiesDocument(page); await openProperties(page, "Child");
    const properties = propertiesDialog(page);
    await properties.getByLabel("名称", { exact: true }).fill("Picked child");
    await properties.getByRole("button", { name: "选择子程序图标", exact: true }).click();
    await iconDialog(page).getByRole("option", { name: "Light_a__0", exact: true }).waitFor();
    await iconDialog(page).getByLabel("搜索图标").press("Escape");
    await iconDialog(page).waitFor({ state: "detached" });
    assert.equal(await properties.getByLabel("名称", { exact: true }).inputValue(), "Picked child");
    assert.equal(await properties.getByLabel("图标", { exact: true }).inputValue(), "iconify:mdi:plus");
    assert.equal(await properties.getByRole("button", { name: "选择子程序图标", exact: true }).evaluate((element) => element === document.activeElement), true);
    await properties.getByRole("button", { name: "选择子程序图标", exact: true }).click();
    await iconDialog(page).getByRole("option", { name: "Light_a__3", exact: true }).dblclick();
    await iconDialog(page).waitFor({ state: "detached" });
    assert.equal(await properties.getByLabel("图标", { exact: true }).inputValue(), "fa:Light_a__3");
    assert.equal(await saveButton(page).isDisabled(), true, "picker selection is only the property popup's draft");
    await properties.getByRole("button", { name: "确定", exact: true }).click();
    await properties.waitFor({ state: "detached" });
    await waitSaveEnabled(page); await saveButton(page).click(); await waitClean(page);
    const body = JSON.parse(await page.evaluate(() => (window as any).fixture.documentCalls.at(-1).content));
    assert.equal(body.subPrograms[0].icon, "fa:Light_a__3"); assert.equal(body.subPrograms[0].name, "Picked child");
    assert.equal(body.steps[0].inputParams.subProgram, "Picked child");
    await page.getByRole("toolbar", { name: "文档历史" }).getByTitle("撤销 (Ctrl+Z)", { exact: true }).click();
    await openProperties(page, "Child");
    assert.equal(await propertiesDialog(page).getByLabel("图标", { exact: true }).inputValue(), "iconify:mdi:plus");
    await propertiesDialog(page).getByRole("button", { name: "取消", exact: true }).click();
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("shared FA picker composes the Regular Brands page seam and retains visible controls in narrow light and dark themes", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture({ realIcons: true });
  try {
    await openAppearancePicker(page); const picker = iconDialog(page);
    await picker.getByRole("button", { name: "普通/商标", exact: true }).click();
    await picker.getByRole("option", { name: "Regular_a__95", exact: true }).waitFor();
    await picker.getByRole("listbox", { name: "图标列表" }).evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await picker.getByRole("option", { name: "Brands_a__4", exact: true }).waitFor();
    const names = await picker.getByRole("option").evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label")));
    assert.equal(names.length, 103); assert.equal(new Set(names).size, 103); assert.equal(names[97], "Regular_a__97"); assert.equal(names[98], "Brands_a__0");
    const calls = await page.evaluate(() => (window as any).fixture.faRequests.map((row: any) => row.body));
    assert.ok(calls.some((call: any) => call.style === "Regular" && call.skip === 96));
    assert.ok(calls.some((call: any) => call.style === "Brands" && call.skip === 0 && call.take === 94));
    await page.setViewportSize({ width: 420, height: 720 });
    await page.mouse.move(1, 1);
    for (const theme of ["light", "dark"] as const) {
      await capture(page, `icon-picker-narrow-${theme}.png`, theme);
      const bounds = await picker.boundingBox(), button = await picker.getByRole("button", { name: "使用此图标", exact: true }).boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 420 && bounds.y + bounds.height <= 720);
      assert.ok(button && button.y + button.height <= 720);
      const vectors = await picker.getByRole("option").locator("svg").evaluateAll((elements) => elements.map((element) => {
        const bounds = element.getBoundingClientRect(); return { width: bounds.width, height: bounds.height };
      }));
      assert.ok(vectors.every((bounds) => Math.abs(bounds.width - bounds.height) < 1), JSON.stringify(vectors));
      const layout = await picker.getByRole("listbox").evaluate((element) => ({ rows: getComputedStyle(element).gridTemplateRows,
        cells: [...element.querySelectorAll('[role="option"]')].slice(-20).map((cell) => {
          const bounds = cell.getBoundingClientRect(), vector = cell.querySelector("svg")?.getBoundingClientRect();
          return { y: bounds.y, height: bounds.height, width: bounds.width, vectorY: vector?.y, vectorHeight: vector?.height };
        }) }));
      if (browserDiagnostics) console.error(JSON.stringify({ phase: "icon-picker-grid-bounds", theme, ...layout }));
      const rowBounds = [...new Map(layout.cells.map((cell) => [cell.y, cell])).values()];
      for (let index = 1; index < rowBounds.length; index++) assert.ok(rowBounds[index].y >= rowBounds[index - 1].y + rowBounds[index - 1].height + 7.5,
        "Responsive cell hit areas must fit their grid tracks and preserve the row gap");
    }
    await picker.getByRole("button", { name: "使用此图标", exact: true }).focus(); await page.keyboard.press("Tab");
    assert.equal(await picker.getByRole("tab", { name: "内置矢量图", exact: true }).evaluate((element) => element === document.activeElement), true);
    await picker.getByLabel("搜索图标").fill("empty");
    await picker.getByText("没有匹配的图标", { exact: true }).waitFor();
    assert.equal(await picker.getByRole("option").count(), 0);
    await picker.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(await page.getByLabel("图标", { exact: true }).inputValue(), "iconify:mdi:code-tags");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("shared FA picker pauses automatic pagination after an error until an explicit retry", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture({ realIcons: true });
  try {
    await page.evaluate(() => { (window as any).fixture.faMode = "more-fail"; });
    await openAppearancePicker(page); const picker = iconDialog(page);
    await picker.getByRole("option", { name: "Light_a__95", exact: true }).waitFor();
    const grid = picker.getByRole("listbox", { name: "图标列表" });
    await grid.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await picker.getByRole("alert").filter({ hasText: "fixture next page failed" }).waitFor();
    await picker.getByRole("button", { name: "加载更多", exact: true }).scrollIntoViewIfNeeded();
    // A visible observer gets several delivery frames; a failed page must not recreate an automatic retry loop.
    await page.evaluate("new Promise(resolve=>{let frames=0;const next=()=>{if(++frames===5)resolve();else requestAnimationFrame(next)};requestAnimationFrame(next)})");
    const moreCalls = () => page.evaluate(() => (window as any).fixture.faRequests.filter((row: any) => row.body.skip > 0).length);
    assert.equal(await moreCalls(), 1, "a visible sentinel cannot retry a failed page without a user action");
    assert.equal(await picker.getByRole("option").count(), 96, "the first page remains usable");
    await page.evaluate(() => { (window as any).fixture.faMode = "success"; });
    await picker.getByRole("button", { name: "加载更多", exact: true }).click();
    await picker.getByRole("option", { name: "Light_a__191", exact: true }).waitFor();
    assert.equal(await moreCalls(), 2, "one explicit retry dispatches the next page once");
    assert.equal(await picker.getByRole("alert").count(), 0, "a successful retry clears the earlier page error");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("shared FA picker manual preview uses its own colored geometry without rewriting the spec", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture({ realIcons: true });
  try {
    await openAppearancePicker(page); const picker = iconDialog(page);
    await picker.getByRole("option", { name: "Light_a__0", exact: true }).waitFor();
    await picker.getByTitle("#4f9bd8", { exact: true }).click();
    await picker.getByRole("tab", { name: "URL / 图标规格", exact: true }).click();
    const spec = "fa:Light_Manual:#ff0000";
    await picker.getByLabel("图片 URL 或图标规格").fill(spec);
    await page.waitForFunction(() => document.querySelector('.icon-picker-dialog__preview svg path')?.getAttribute('fill')?.toLowerCase() === '#ff0000');
    assert.equal(await picker.getByLabel("所选图标预览").locator("svg path").evaluate((element) => getComputedStyle(element).fill), "rgb(255, 0, 0)",
      "manual geometry cannot inherit the FA tab's earlier color selection");
    await picker.getByRole("button", { name: "使用此图标", exact: true }).click();
    assert.equal(await page.getByLabel("图标", { exact: true }).inputValue(), spec, "manual spec spelling stays unchanged");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("shared FA picker keeps IME queries and nested color keyboard ownership local without consuming document undo", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture({ realIcons: true });
  try {
    await editNote(page, "body history must survive picker keys");
    await openAppearancePicker(page); const picker = iconDialog(page), search = picker.getByLabel("搜索图标");
    await picker.getByRole("option", { name: "Light_a__0", exact: true }).waitFor();
    await page.clock.install();
    await search.dispatchEvent("compositionstart"); await search.fill("文件夹");
    await page.clock.runFor(500);
    assert.equal(await page.evaluate(() => (window as any).fixture.faRequests.some((row: any) => row.body.query === "文件夹")), false);
    await search.dispatchEvent("compositionend", { data: "文件夹" }); await page.clock.runFor(220); await page.clock.resume();
    await picker.getByRole("option", { name: "Light_a_文件夹_0", exact: true }).waitFor();
    await search.focus(); await page.keyboard.press("Control+a"); await page.keyboard.insertText("native undo draft"); await page.keyboard.press("Control+z");
    assert.equal(await search.inputValue(), "文件夹");
    await picker.getByTitle("自由选色", { exact: true }).click();
    const color = page.getByRole("dialog", { name: "自由颜色选择", exact: true });
    await color.getByLabel("十六进制颜色").fill("#123456");
    await color.getByLabel("十六进制颜色").press("Enter");
    await page.keyboard.press("Control+s");
    assert.equal(await page.evaluate(() => (window as any).fixture.documentCalls.length), 0, "nested color shortcuts cannot save the underlying document");
    await color.getByRole("button", { name: "默认", exact: true }).focus(); await page.keyboard.press("Tab");
    assert.equal(await color.getByLabel("十六进制颜色").evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press("Escape"); await color.waitFor({ state: "detached" });
    assert.equal(await picker.count(), 1); assert.match(await picker.getByLabel("所选图标预览").innerText(), /#123456/);
    await picker.getByLabel("搜索图标").press("Escape"); await picker.waitFor({ state: "detached" });
    await page.getByRole("tab", { name: "主程序", exact: true }).click(); assert.equal(await currentNote(page).inputValue(), "body history must survive picker keys");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("shared FA picker makes zero FA requests for loading or unbound documents while manual specs and native undo stay available", { timeout: 45_000 }, async () => {
  for (const targetMode of ["defer", "unbound"]) {
    const { page, errors } = await openFixture({ realIcons: true, targetMode });
    try {
      await openAppearancePicker(page); const picker = iconDialog(page);
      assert.match(await picker.getByRole("alert").innerText(), /尚未绑定/);
      assert.equal(await picker.getByRole("button", { name: "使用此图标", exact: true }).isDisabled(), true);
      await picker.getByRole("tab", { name: "URL / 图标规格", exact: true }).click();
      const manual = picker.getByLabel("图片 URL 或图标规格"); await manual.focus(); await page.keyboard.press("Control+a"); await page.keyboard.insertText("fa:Light_Manual");
      await page.keyboard.press("Control+z"); assert.equal(await manual.inputValue(), "iconify:mdi:code-tags");
      await manual.fill("fa:Light_Manual"); await picker.getByRole("button", { name: "使用此图标", exact: true }).click();
      assert.equal(await page.getByLabel("图标", { exact: true }).inputValue(), "fa:Light_Manual");
      assert.equal(await page.evaluate(() => (window as any).fixture.faRequests.length), 0);
      assert.equal(await page.evaluate(() => (window as any).fixture.geometryRequests.length), 0);
      await assertIsolated(page, errors);
    } finally { await page.close(); }
  }
});

test("shared FA picker rejects stale A B A pages and unsupported errors without losing the hidden document draft", { timeout: 60_000 }, async () => {
  const { page, errors } = await openFixture({ realIcons: true, dualDocuments: true, exclusiveDocuments: true });
  try {
    await page.evaluate(() => { (window as any).fixture.faMode = "defer"; });
    await openAppearancePicker(page);
    await iconDialog(page).getByLabel("搜索图标").fill("alpha");
    await page.waitForFunction(() => (window as any).fixture.faPending.some((item: any) => item.row.body.query === "alpha"));
    await iconDialog(page).getByTitle("自由选色", { exact: true }).click();
    await page.getByRole("dialog", { name: "自由颜色选择", exact: true }).waitFor();
    await page.evaluate(() => { const f = (window as any).fixture; f.probeHiddenColorOwner = true; f.setActive(false); });
    await page.waitForFunction(() => (window as any).fixture.hiddenColorOwnerProbe);
    assert.equal(await page.evaluate(() => (window as any).fixture.hiddenColorOwnerProbe.prevented), false,
      "A color listener must relinquish B Escape during layout, before passive cleanup");
    await iconDialog(page).waitFor({ state: "hidden" });
    const b = page.locator('[data-fixture-document="b"]');
    await b.getByRole("tab", { name: "属性", exact: true }).click(); await b.getByRole("button", { name: "选择动作图标", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.faPending.some((item: any) => item.row.body.catalogContext.expectedProjectBinding.hostBinding.hostInstanceId === "instance-b"));
    await page.evaluate(() => (window as any).fixture.setActive(true));
    await iconDialog(page).getByLabel("搜索图标").waitFor(); assert.equal(await iconDialog(page).getByLabel("搜索图标").inputValue(), "alpha");
    await page.waitForFunction(() => (window as any).fixture.faPending.filter((item: any) => item.row.body.query === "alpha").length === 2);
    await page.evaluate(() => {
      const f = (window as any).fixture; f.faPending.slice(0, -1).forEach((item: any) => item.resolve("stale")); f.faPending.at(-1).resolve();
    });
    await iconDialog(page).getByRole("option", { name: "Light_a_alpha_0", exact: true }).waitFor();
    assert.equal(await iconDialog(page).getByRole("option", { name: /stale/ }).count(), 0);
    const rows = await page.evaluate(() => (window as any).fixture.faRequests); assert.ok(rows.slice(0, -1).every((row: any) => row.aborted));
    await iconDialog(page).getByRole("button", { name: "使用此图标", exact: true }).click();
    assert.equal(await page.locator('[data-fixture-document="a"]').getByLabel("图标", { exact: true }).inputValue(), "fa:Light_a_alpha_0");
    await page.evaluate(() => (window as any).fixture.setActive(false));
    await iconDialog(page).getByLabel("搜索图标").waitFor(); await iconDialog(page).getByLabel("搜索图标").press("Escape");
    assert.equal(await b.getByLabel("图标", { exact: true }).inputValue(), "iconify:mdi:code-tags");
    await page.evaluate(() => { const f = (window as any).fixture; f.faMode = "unsupported"; f.faPending.forEach((item: any) => item.resolve()); });
    await b.getByRole("button", { name: "选择动作图标", exact: true }).click();
    await iconDialog(page).getByRole("alert").waitFor(); assert.match(await iconDialog(page).getByRole("alert").innerText(), /fixture page unsupported/);
    assert.equal(await iconDialog(page).getByRole("option").count(), 0);
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("internal subprogram root create opens stable tabs and close only changes the view", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await page.evaluate(() => {
      const f = (window as any).fixture;
      const body = JSON.parse(f.makeDocument("a")); body.subPrograms = []; body.futureNumber = "__int64__";
      f.setDocument("a", JSON.stringify(body).replace('"__int64__"', "9223372036854775807"));
    });
    await createInternalTab(page);
    await page.getByRole("tab", { name: "子程序1", exact: true }).waitFor();
    await page.evaluate(() => { (window as any).fixture.mainNode = document.querySelector('[data-step-id="s-a"]'); });
    await page.getByRole("button", { name: "关闭子程序1标签", exact: true }).click();
    await page.getByRole("tab", { name: "主程序", exact: true }).waitFor();
    await openInternalTab(page, "子程序1");
    await waitSaveEnabled(page); await saveButton(page).click(); await waitClean(page);
    const first = await page.evaluate(() => JSON.parse((window as any).fixture.calls.at(-1).content));
    assert.equal(first.subPrograms.length, 1);
    assert.equal(first.subPrograms[0].kind, 1);
    assert.ok(first.subPrograms[0].id);
    const originalId = first.subPrograms[0].id;
    await createInternalTab(page);
    await page.getByRole("tab", { name: "子程序2", exact: true }).waitFor();
    const history = page.getByRole("toolbar", { name: "文档历史", exact: true });
    await history.getByTitle("撤销 (Ctrl+Z)", { exact: true }).click();
    assert.equal(await page.getByRole("tab", { name: "子程序2", exact: true }).count(), 0);
    await history.getByTitle("重做 (Ctrl+Y / Ctrl+Shift+Z)", { exact: true }).click();
    await openInternalTab(page, "子程序2");
    await waitSaveEnabled(page); await saveButton(page).click(); await waitClean(page);
    const content = await page.evaluate(() => (window as any).fixture.calls.at(-1).content);
    const saved = JSON.parse(content);
    assert.equal(saved.subPrograms[0].id, originalId);
    assert.equal(new Set(saved.subPrograms.map((row: { id: string }) => row.id)).size, 2);
    assert.ok(content.includes("9223372036854775807"));
    assert.equal(saved.steps[0].inputParams["script.file"], "files/script.cs");
    assert.equal(await page.evaluate(() => (window as any).fixture.mainNode === document.querySelector('[data-step-id="s-a"]')), true);
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("internal subprogram delete flushes the editor and one undo restores its entire owned subtree", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await openInternalTab(page, "Child");
    await currentNote(page).fill("child draft before delete");
    await prepareInternalDelete(page, "Child");
    const dialog = page.getByRole("alertdialog", { name: "删除内部子程序", exact: true });
    assert.equal(await dialog.getByRole("button", { name: "取消", exact: true }).evaluate((node) => node === document.activeElement), true);
    await capture(page, "subprogram-delete-confirm-light.png", "light");
    await capture(page, "subprogram-delete-confirm-dark.png", "dark");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await currentNote(page).inputValue(), "child draft before delete");
    await prepareInternalDelete(page, "Child");
    await dialog.getByRole("button", { name: "确定删除", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(await page.getByRole("tab", { name: "Child", exact: true }).count(), 0);
    assert.equal(await currentNote(page).inputValue(), "a initial");
    await page.getByRole("toolbar", { name: "文档历史", exact: true }).getByTitle("撤销 (Ctrl+Z)", { exact: true }).click();
    await openInternalTab(page, "Child");
    assert.equal(await currentNote(page).inputValue(), "child draft before delete");
    await openInternalTab(page, "Child / Nested");
    assert.equal(await currentNote(page).inputValue(), "nested initial");
    await waitSaveEnabled(page); await saveButton(page).click(); await waitClean(page);
    const body = await page.evaluate(() => JSON.parse((window as any).fixture.calls.at(-1).content));
    assert.equal(body.subPrograms[0].id, "child");
    assert.equal(body.subPrograms[0].steps[0].note, "child draft before delete");
    assert.equal(body.subPrograms[0].subPrograms[0].id, "nested");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("used subprogram deletion refuses with human reference locations and traps narrow dialog keyboard", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await loadPropertiesDocument(page);
    await page.setViewportSize({ width: 420, height: 600 });
    await prepareInternalDelete(page, "Child");
    const dialog = page.getByRole("alertdialog", { name: "无法删除子程序", exact: true });
    assert.equal(await dialog.getByRole("button", { name: "确定删除", exact: true }).count(), 0);
    const locations = dialog.getByRole("list", { name: "子程序引用位置", exact: true });
    assert.match(await locations.innerText(), /主程序 · 第 1 步/);
    assert.match(await locations.innerText(), /Nested · 第 1 步/);
    const bounds = await dialog.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 420 && bounds.y + bounds.height <= 600);
    await capture(page, "subprogram-delete-references-narrow-light.png", "light");
    await capture(page, "subprogram-delete-references-narrow-dark.png", "dark");
    const close = dialog.getByRole("button", { name: "关闭", exact: true });
    await close.focus(); await page.keyboard.press("Tab");
    assert.equal(await dialog.locator("summary").first().evaluate((node) => node === document.activeElement), true);
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await page.getByRole("tab", { name: "Child", exact: true }).count(), 1);
    await waitClean(page);
    assert.equal(await page.evaluate(() => (window as any).fixture.documentCalls.length), 0);
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("subprogram deletion rejects stale confirmations and a late save never restores the removed definition", { timeout: 60_000 }, async () => {
  const { page, errors } = await openFixture({ targetMode: "defer" });
  try {
    await openInternalTab(page, "Child"); await prepareInternalDelete(page, "Child");
    const dialog = page.getByRole("alertdialog", { name: "删除内部子程序", exact: true });
    await page.evaluate(() => {
      const f = (window as any).fixture;
      f.targetMode = "bound";
      f.targetPending.forEach((pending: { resolve(): void }) => pending.resolve());
    });
    await page.waitForFunction(() => (window as any).fixture.catalogRequests.length > 0);
    await dialog.getByRole("button", { name: "确定删除", exact: true }).click();
    assert.match(await dialog.getByRole("alert").innerText(), /identity|revision|身份|目标|版本|修订/i);
    assert.equal(await dialog.getByRole("button", { name: "确定删除", exact: true }).isDisabled(), true);
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await prepareInternalDelete(page, "Child");
    // An owner can hide the workspace while a modal is open; ordinary pointer input remains blocked.
    await page.getByRole("tab", { name: "源码 JSON", exact: true }).evaluate((node: HTMLButtonElement) => node.click());
    await dialog.waitFor({ state: "detached" });
    await page.getByRole("tab", { name: /^可视化/ }).click();
    assert.equal(await page.getByRole("alertdialog").count(), 0);
    await prepareInternalDelete(page, "Child");
    await page.evaluate(() => (window as any).fixture.setDocument("b"));
    await page.waitForSelector('[data-step-id="s-b"]');
    await dialog.waitFor({ state: "detached" });
    await page.evaluate(() => (window as any).fixture.setDocument("a"));
    await page.waitForSelector('[data-step-id="s-a"]');
    await openInternalTab(page, "Child");
    await editNote(page, "saved child before deletion");
    await page.evaluate(() => { (window as any).fixture.mode = "defer"; });
    await waitSaveEnabled(page); await saveButton(page).click();
    await page.waitForFunction(() => (window as any).fixture.pending.length === 1);
    await prepareInternalDelete(page, "Child");
    await dialog.getByRole("button", { name: "确定删除", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    await page.evaluate(() => (window as any).fixture.resolvePending(0, { ok: true }));
    await waitSaveEnabled(page);
    await page.evaluate(() => { (window as any).fixture.mode = "success"; });
    await saveButton(page).click(); await waitClean(page);
    const saved = await page.evaluate(() => JSON.parse((window as any).fixture.calls.at(-1).content));
    assert.deepEqual(saved.subPrograms, []);
    await page.getByRole("toolbar", { name: "文档历史", exact: true }).getByTitle("撤销 (Ctrl+Z)", { exact: true }).click();
    await openInternalTab(page, "Child");
    assert.equal(await currentNote(page).inputValue(), "saved child before deletion");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("subprogram properties reject duplicate drafts then rename every owned literal in one document undo", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await loadPropertiesDocument(page);
    await openProperties(page, "Child");
    const dialog = propertiesDialog(page);
    await dialog.getByLabel("名称", { exact: true }).fill("Other");
    await dialog.getByLabel("说明", { exact: true }).fill("kept draft description");
    await dialog.getByLabel("图标", { exact: true }).fill("iconify:mdi:undo");
    await dialog.getByRole("button", { name: "确定", exact: true }).click();
    assert.match(await dialog.getByRole("alert").innerText(), /同名/);
    assert.equal(await dialog.getByLabel("名称", { exact: true }).inputValue(), "Other");
    assert.equal(await dialog.getByLabel("说明", { exact: true }).inputValue(), "kept draft description");
    assert.equal(await saveButton(page).isDisabled(), true);
    await dialog.getByLabel("名称", { exact: true }).fill("Renamed");
    await dialog.getByLabel("名称", { exact: true }).press("Enter");
    await dialog.waitFor({ state: "detached" });
    await page.getByRole("tab", { name: "Renamed", exact: true }).waitFor();
    await waitSaveEnabled(page); await saveButton(page).click(); await waitClean(page);
    const saved = await page.evaluate(() => (window as any).fixture.documentCalls.at(-1).content);
    const body = JSON.parse(saved);
    assert.equal(body.subPrograms[0].name, "Renamed");
    assert.equal(body.subPrograms[0].description, "kept draft description");
    assert.equal(body.subPrograms[0].icon, "iconify:mdi:undo");
    for (const call of [body.steps[0], body.steps[1].ifSteps[0], body.subPrograms[0].steps[0], body.subPrograms[0].subPrograms[0].steps[0]]) assert.equal(call.inputParams.subProgram, "Renamed");
    assert.equal(body.subPrograms[2].steps[0].inputParams.subProgram, "Child");
    assert.ok(saved.includes("9223372036854775807"));
    await page.getByRole("toolbar", { name: "文档历史" }).getByTitle("撤销 (Ctrl+Z)", { exact: true }).click();
    await page.getByRole("tab", { name: "Child", exact: true }).waitFor();
    await waitSaveEnabled(page); await saveButton(page).click(); await waitClean(page);
    const restored = JSON.parse(await page.evaluate(() => (window as any).fixture.documentCalls.at(-1).content));
    assert.equal(restored.subPrograms[0].description, "original child description");
    for (const call of [restored.steps[0], restored.steps[1].ifSteps[0], restored.subPrograms[0].steps[0], restored.subPrograms[0].subPrograms[0].steps[0]]) assert.equal(call.inputParams.subProgram, "Child");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("subprogram properties survive a late save and cannot leak a departed document draft", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await loadPropertiesDocument(page); await openProperties(page, "Child");
    await propertiesDialog(page).getByLabel("名称", { exact: true }).fill("First");
    await propertiesDialog(page).getByRole("button", { name: "确定", exact: true }).click();
    await page.evaluate(() => { (window as any).fixture.documentMode = "defer"; });
    await waitSaveEnabled(page); await saveButton(page).click();
    await page.waitForFunction(() => (window as any).fixture.documentPending.length === 1);
    await openProperties(page, "First");
    await propertiesDialog(page).getByLabel("名称", { exact: true }).fill("Second");
    await propertiesDialog(page).getByLabel("说明", { exact: true }).fill("newer than saved ticket");
    await propertiesDialog(page).getByRole("button", { name: "确定", exact: true }).click();
    await page.evaluate(() => { (window as any).fixture.resolveDocumentPending(0, { ok: true }); });
    await page.getByRole("tab", { name: "Second", exact: true }).waitFor(); await waitSaveEnabled(page);
    await page.evaluate(() => { (window as any).fixture.documentMode = "success"; });
    await saveButton(page).click(); await waitClean(page);
    assert.equal(JSON.parse(await page.evaluate(() => (window as any).fixture.documentCalls.at(-1).content)).subPrograms[0].name, "Second");
    await openProperties(page, "Second");
    await propertiesDialog(page).getByLabel("名称", { exact: true }).fill("Never document B");
    await page.evaluate(() => { (window as any).fixture.setDocument("b"); });
    await page.locator('[data-step-id="s-b"]').waitFor();
    assert.equal(await propertiesDialog(page).count(), 0);
    assert.equal(await page.getByRole("tab", { name: "Second", exact: true }).count(), 0);
    assert.equal(await saveButton(page).isDisabled(), true);
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("subprogram tab context keyboard, native draft undo, discard and narrow themes keep their owner", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await loadPropertiesDocument(page);
    const tab = page.getByRole("tab", { name: "Child", exact: true });
    await tab.focus(); await tab.press("Shift+F10");
    await page.getByRole("menuitem", { name: "属性…", exact: true }).press("Enter");
    const dialog = propertiesDialog(page); const name = dialog.getByLabel("名称", { exact: true });
    await name.waitFor(); await name.press("End"); await name.pressSequentially(" keyboard"); await name.press("Control+Z");
    assert.equal(await name.inputValue(), "Child");
    await name.fill("Unsaved child");
    await dialog.getByLabel("说明", { exact: true }).fill("draft survives cancel");
    await page.setViewportSize({ width: 420, height: 820 });
    for (const theme of ["light", "dark"] as const) {
      await capture(page, `subprogram-properties-${theme}.png`, theme);
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      const bounds = await dialog.evaluate((element) => ({ left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom, width: element.clientWidth, content: element.scrollWidth }));
      assert.ok(bounds.left >= 0 && bounds.right <= 420 && bounds.top >= 0 && bounds.bottom <= 820 && bounds.content <= bounds.width, JSON.stringify(bounds));
    }
    await name.press("Escape"); const confirmation = page.getByRole("alertdialog", { name: "是否保存更改？" }); await confirmation.waitFor();
    await confirmation.getByRole("button", { name: "取消", exact: true }).press("Escape");
    assert.equal(await name.inputValue(), "Unsaved child");
    assert.equal(await dialog.getByLabel("说明", { exact: true }).inputValue(), "draft survives cancel");
    await name.press("Escape"); await page.getByRole("alertdialog").getByRole("button", { name: "不保存", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(await tab.evaluate((element) => element === document.activeElement), true);
    assert.equal(await saveButton(page).isDisabled(), true);
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

async function editNote(page: Page, note: string): Promise<void> {
  await currentNote(page).fill(note);
  await page.locator(".program-editor-surface:visible .step-row").first().focus();
  await page.waitForFunction((value) => document.querySelector(".program-editor-surface:not([hidden]) .step-row")?.textContent?.includes(value), note);
}

async function waitSaveEnabled(page: Page): Promise<void> {
  await page.waitForFunction(() => !(document.querySelector(".action-project-data-editor-save") as HTMLButtonElement)?.disabled);
}

async function waitClean(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((document.querySelector(".action-project-data-editor-save") as HTMLButtonElement)?.disabled)
    && !document.querySelector('.action-project-data-editor-tab[aria-selected="true"]')?.textContent?.includes("*"));
}

async function assertIsolated(page: Page, errors: string[]): Promise<void> {
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.unexpected), []);
  assert.deepEqual(errors, []);
}

async function capture(page: Page, filename: string, theme: "light" | "dark"): Promise<void> {
  if (!screenshotDirectory) return;
  await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
  await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  await page.screenshot({ path: path.join(screenshotDirectory, filename), fullPage: false });
}

test("a delayed local identity read retains edits and saves the exact displayed full target", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture({ targetMode: "defer" });
  try {
    await editNote(page, "draft before target read");
    assert.equal(await page.evaluate(() => (window as any).fixture.catalogRequests.length), 0);
    assert.equal(await saveButton(page).isDisabled(), true);
    assert.equal(await page.locator(".project-info-sync-btn").isDisabled(), true);
    for (const label of ["运行", "调试", "编辑", "悬浮"]) assert.equal(await page.getByRole("button", { name: label, exact: true }).isDisabled(), true);
    await page.evaluate(() => { for (const pending of (window as any).fixture.targetPending) pending.resolve(); });
    await waitSaveEnabled(page);
    assert.equal(await currentNote(page).inputValue(), "draft before target read");
    await page.locator(".action-project-target summary").click();
    assert.match(await page.locator(".action-project-target").innerText(), /V1.*fixture-a/s);
    assert.match(await page.locator(".action-project-target").innerText(), /instance-a/);
    assert.match(await page.locator(".action-project-target").innerText(), /QuickerRpc_User_A{24}_a{32}/);
    for (const label of ["运行", "调试", "编辑", "悬浮"]) assert.equal(await page.getByRole("button", { name: label, exact: true }).isDisabled(), true);
    await capture(page, "00-target-details-light.png", "light");
    await capture(page, "00-target-details-dark.png", "dark");
    await page.setViewportSize({ width: 420, height: 820 });
    const narrowTarget = await page.locator(".action-project-target dd").evaluateAll((elements) => elements.map((element) => ({ width: element.clientWidth, content: element.scrollWidth })));
    assert.ok(narrowTarget.every(({ width, content }) => content <= width), JSON.stringify(narrowTarget));
    const narrowButtonHeights = await page.locator(".action-project-data-editor-toolbar button").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
    assert.ok(narrowButtonHeights.every((height) => height <= 48), JSON.stringify(narrowButtonHeights));
    await capture(page, "00-target-details-narrow-light.png", "light");
    await capture(page, "00-target-details-narrow-dark.png", "dark");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.setViewportSize({ width: 1280, height: 900 });
    await saveButton(page).click();
    await waitClean(page);
    assert.equal(await page.evaluate(() => {
      const f = (window as any).fixture;
      return JSON.stringify(f.transportCalls.at(-1).expectedProjectBinding) === JSON.stringify(f.targetFiles[f.pathFor("a")]);
    }), true);
    await page.locator(".program-project-delete-btn").click();
    const deletion = page.getByRole("alertdialog");
    await deletion.waitFor();
    assert.equal(await deletion.getByRole("checkbox").count(), 0);
    assert.match(await deletion.innerText(), /Quicker 内的项目保留/);
    await deletion.getByRole("button", { name: "删除", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.localDeletes?.length === 1);
    assert.equal(await page.evaluate(() => (window as any).fixture.localDeletes[0]), await page.evaluate(() => (window as any).fixture.pathFor("a").replace(/\/data.json$/, "")));
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("unbound projects can save locally with null identity while invalid targets and identity conflicts retain the draft", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture({ targetMode: "unbound" });
  try {
    await editNote(page, "unbound local draft");
    assert.equal(await page.evaluate(() => (window as any).fixture.catalogRequests.length), 0);
    await waitSaveEnabled(page);
    assert.match(await page.locator(".action-project-target").innerText(), /未绑定宿主/);
    assert.equal(await page.locator(".project-info-sync-btn").isDisabled(), true);
    assert.equal(await page.evaluate(() => (window as any).fixture.syncCalls.length), 0);
    await saveButton(page).click(); await waitClean(page);
    assert.equal(await page.evaluate(() => (window as any).fixture.transportCalls.at(-1).expectedProjectBinding), null);
    await page.evaluate(() => { const f = (window as any).fixture; f.enableDocumentSave(); f.documentMode = "identity"; });
    await editNote(page, "preserved on identity conflict"); await waitSaveEnabled(page);
    await saveButton(page).click();
    await page.getByRole("alert").filter({ hasText: "动作目标已在外部变更" }).waitFor();
    assert.equal(await currentNote(page).inputValue(), "preserved on identity conflict");
    assert.equal(await saveButton(page).isDisabled(), true);
    await assertIsolated(page, errors);
  } finally { await page.close(); }
  const invalid = await openFixture({ targetMode: "error" });
  try {
    await editNote(invalid.page, "unsafe target draft");
    await invalid.page.getByRole("alert").filter({ hasText: "无法确认动作目标" }).waitFor();
    assert.equal(await saveButton(invalid.page).isDisabled(), true);
    assert.equal(await invalid.page.evaluate(() => (window as any).fixture.syncCalls.length), 0);
    await assertIsolated(invalid.page, invalid.errors);
  } finally { await invalid.page.close(); }
  const future = await openFixture({ invalidVersion: true });
  try {
    await future.page.waitForFunction(() => document.querySelector(".action-project-target summary")?.textContent?.includes("版本未知"));
    await assertIsolated(future.page, future.errors);
  } finally { await future.page.close(); }
});

test("late status from the previous binding cannot clear a new document busy owner or show its status", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await page.locator(".action-project-target summary").waitFor();
    await page.evaluate(() => { (window as any).fixture.syncStatusMode = "defer"; });
    await page.locator(".project-info-sync-btn").click();
    await page.waitForFunction(() => (window as any).fixture.statusPending.length >= 1);
    await page.evaluate(() => { (window as any).fixture.setDocument("b"); });
    await page.locator('[data-step-id="s-b"]').waitFor();
    await page.waitForFunction(() => document.querySelector(".action-project-target summary")?.textContent?.includes("V2"));
    await page.locator(".project-info-sync-btn").click();
    await page.waitForFunction(() => (window as any).fixture.statusPending.filter((p: any) => p.request.expectedProjectBinding.hostBinding.hostKind === "v2").length >= 2);
    await page.evaluate(() => { const f = (window as any).fixture; for (const p of f.statusPending.filter((p: any) => p.request.expectedProjectBinding.hostBinding.hostKind === "v1")) p.resolve({ ok: false, error: "stale A status must stay hidden" }); });
    await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    assert.equal(await page.locator(".project-info-sync-btn").isDisabled(), true);
    assert.doesNotMatch(await page.locator(".action-project-data-editor").innerText(), /stale A status/);
    await page.evaluate(() => { const f = (window as any).fixture; for (const p of f.statusPending.filter((p: any) => p.request.expectedProjectBinding.hostBinding.hostKind === "v2")) p.resolve({ ok: true, status: f.syncStatus }); });
    await page.waitForFunction(() => !(document.querySelector(".project-info-sync-btn") as HTMLButtonElement)?.disabled);
    assert.equal(await currentNote(page).inputValue(), "b initial");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("StrictMode starts clean; real compact/variable edits and nested tabs retain the full latest document and history", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await waitClean(page);
    await capture(page, "01-main-light.png", "light");
    await capture(page, "02-main-dark.png", "dark");
    assert.equal(await page.getByRole("tab", { name: "可视化", exact: true }).count(), 1);
    await editNote(page, "main first");
    await editNote(page, "main latest");
    await waitSaveEnabled(page);
    await saveButton(page).click();
    await waitClean(page);
    let saved = await page.evaluate(() => JSON.parse((window as any).fixture.calls.at(-1).content));
    assert.equal(saved.steps[0].note, "main latest");
    assert.deepEqual(saved.fixtureRoot, { keep: true });
    assert.deepEqual(saved.steps[0].fixtureStep, { keep: true });
    assert.equal(saved.steps[0].inputParams["script.file"], "files/script.cs");

    await page.getByRole("button", { name: "打开变量面板", exact: true }).click();
    await page.locator('.variable-form input[title="备注"]').fill("variable latest");
    await page.locator(".variable-toolbar-btn--close").click();
    const addTab = page.locator('summary[aria-label="打开或新建内部子程序"]');
    const nestedChoice = page.locator(".program-editor-tab-menu button").filter({ hasText: "Child / Nested" });
    await addTab.click();
    await nestedChoice.focus();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("details.program-editor-tab-add").getAttribute("open"), null);
    assert.equal(await addTab.evaluate((element) => document.activeElement === element), true);
    await page.keyboard.press("Enter");
    await nestedChoice.click();
    await editNote(page, "nested first");
    await editNote(page, "nested latest");
    await capture(page, "03-nested-light.png", "light");
    const mainTab = page.getByRole("tab", { name: "主程序", exact: true });
    const nestedTab = page.getByRole("tab", { name: "Nested", exact: true });
    await mainTab.focus();
    await page.keyboard.press("End");
    assert.equal(await nestedTab.getAttribute("aria-selected"), "true");
    assert.equal(await nestedTab.evaluate((element) => document.activeElement === element), true);
    await page.keyboard.press("Home");
    assert.equal(await mainTab.getAttribute("aria-selected"), "true");
    assert.equal(await currentNote(page).inputValue(), "main latest");
    await page.keyboard.press("ArrowRight");
    assert.equal(await nestedTab.getAttribute("aria-selected"), "true");
    await page.keyboard.press("ArrowRight");
    assert.equal(await mainTab.getAttribute("aria-selected"), "true");
    await page.keyboard.press("ArrowLeft");
    assert.equal(await nestedTab.getAttribute("aria-selected"), "true");
    assert.equal(await currentNote(page).inputValue(), "nested latest");
    await page.getByRole("button", { name: "关闭Nested标签", exact: true }).click();
    await page.locator('summary[aria-label="打开或新建内部子程序"]').click();
    await page.locator(".program-editor-tab-menu button").filter({ hasText: "Child / Nested" }).click();
    assert.equal(await currentNote(page).inputValue(), "nested latest");
    await page.locator(".program-editor-surface:visible .step-row").first().focus();
    await page.keyboard.press("Control+z");
    assert.equal(await currentNote(page).inputValue(), "nested first");
    await page.getByRole("tab", { name: "源码 JSON", exact: true }).click();
    saved = JSON.parse(await page.locator("[data-source-content]").textContent() ?? "{}");
    assert.equal(saved.subPrograms[0].subPrograms[0].steps[0].note, "nested first");
    assert.equal(saved.variables[0].desc, "variable latest");
    assert.equal(saved.variables[0]["default.file"], "files/default.txt");
    await page.getByRole("tab", { name: /^可视化/ }).click();
    await page.locator(".program-editor-surface:visible .step-row").first().focus();
    await page.keyboard.press("Control+y");
    assert.equal(await currentNote(page).inputValue(), "nested latest");
    await saveButton(page).click();
    await waitClean(page);
    saved = await page.evaluate(() => JSON.parse((window as any).fixture.calls.at(-1).content));
    assert.equal(saved.subPrograms[0].subPrograms[0].steps[0].note, "nested latest");
    assert.deepEqual(saved.subPrograms[0].subPrograms[0].steps[0].fixtureStep, { keep: true });
    if (screenshotDirectory) {
      await page.setViewportSize({ width: 480, height: 760 });
      await editNote(page, "narrow editable");
      await waitSaveEnabled(page);
      await saveButton(page).click();
      await waitClean(page);
      await page.getByRole("tab", { name: "源码 JSON", exact: true }).click();
      assert.equal(JSON.parse(await page.locator("[data-source-content]").textContent() ?? "{}").subPrograms[0].subPrograms[0].steps[0].note, "narrow editable");
      await page.getByRole("tab", { name: /^可视化/ }).click();
      await mainTab.click();
      assert.equal(await currentNote(page).inputValue(), "main latest");
      await nestedTab.click();
      await capture(page, "04-nested-dark-480px.png", "dark");
    }
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("editing during a pending save keeps the newer draft dirty after its late acknowledgement; failed writes can retry", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await editNote(page, "saved ticket");
    await page.evaluate(() => { (window as any).fixture.mode = "defer"; });
    await waitSaveEnabled(page);
    await saveButton(page).click();
    await page.waitForFunction(() => (window as any).fixture.pending.length === 1);
    await editNote(page, "newer local draft");
    await page.evaluate(() => (window as any).fixture.echoPending(0));
    await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    await page.evaluate(() => (window as any).fixture.resolvePending(0, { ok: true }));
    await page.waitForFunction(() => document.querySelector(".action-project-data-editor-save")?.textContent?.includes("保存到工作区"));
    assert.deepEqual(await page.getByRole("alert").allTextContents(), [], "an owned in-flight content echo must not become an external conflict");
    await waitSaveEnabled(page);
    assert.equal(await currentNote(page).inputValue(), "newer local draft");
    assert.match(await page.getByRole("tab", { name: /^可视化/ }).textContent() ?? "", /\*/);
    await page.evaluate(() => { (window as any).fixture.mode = "fail"; });
    await saveButton(page).click();
    await page.getByText("fixture save rejected", { exact: true }).waitFor();
    await waitSaveEnabled(page);
    await page.evaluate(() => { (window as any).fixture.mode = "success"; });
    await saveButton(page).click();
    await waitClean(page);
    const calls = await page.evaluate(() => (window as any).fixture.calls.map((call: any) => JSON.parse(call.content).steps[0].note));
    assert.deepEqual(calls, ["saved ticket", "newer local draft", "newer local draft"]);
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("external content preserves a dirty draft and blocks overwrite; an old path save cannot mutate the new document", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await editNote(page, "local draft");
    await page.evaluate(() => {
      const f = (window as any).fixture;
      const remote = JSON.parse(f.makeDocument("a"));remote.steps[0].note = "remote change";
      f.replaceContent(JSON.stringify(remote));
    });
    await page.getByRole("alert").filter({ hasText: "工作区文件已在外部变更" }).waitFor();
    assert.equal(await currentNote(page).inputValue(), "local draft");
    assert.equal(await saveButton(page).isDisabled(), true);
    await page.getByRole("tab", { name: "源码 JSON", exact: true }).click();
    assert.equal(JSON.parse(await page.locator("[data-source-content]").textContent() ?? "{}").steps[0].note, "local draft");
    assert.equal(await page.evaluate(() => (window as any).fixture.calls.length), 0);

    // Restoring the original observed baseline clears the external-content conflict.
    await page.evaluate(() => { const f=(window as any).fixture;f.replaceContent(f.makeDocument("a"));f.mode="defer"; });
    await page.getByRole("tab", { name: /^可视化/ }).click();
    await waitSaveEnabled(page);
    await saveButton(page).click();
    await page.waitForFunction(() => (window as any).fixture.pending.length === 1);
    await page.evaluate(() => (window as any).fixture.setDocument("b"));
    await page.waitForSelector('[data-step-id="s-b"]');
    await waitClean(page);
    await page.evaluate(() => (window as any).fixture.resolvePending(0, { ok: true }));
    await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    assert.equal(await currentNote(page).inputValue(), "b initial");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.saved), []);
    await editNote(page, "b local latest");
    await page.evaluate(() => { (window as any).fixture.mode="success"; });
    await saveButton(page).click();
    await waitClean(page);
    const result = await page.evaluate(() => {
      const f=(window as any).fixture;return{path:f.calls.at(-1).path,body:JSON.parse(f.calls.at(-1).content),saved:f.saved};
    });
    assert.match(result.path, /22222222/);
    assert.equal(result.body.steps[0].stepId, "s-b");
    assert.equal(result.body.steps[0].note, "b local latest");
    assert.deepEqual(result.saved, [result.path]);
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("module catalog inserts a capability through the real popup, undo and controller save into the active surface", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    const toolbox = page.getByRole("region", { name: "模块工具箱" });
    await toolbox.getByRole("tab", { name: "Text", exact: true }).waitFor();
    await toolbox.getByPlaceholder("搜索模块…").fill("copy");
    await toolbox.locator(".toolbox-sub-item").filter({ hasText: "Copy fixture" }).dblclick();
    const popup = page.locator(".step-editor-popup");
    await popup.waitFor();
    assert.equal(await page.locator(".program-editor-surface:visible .step-row").count(), 1, "opening params is not a document mutation");
    await popup.getByRole("button", { name: "确定", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll(".program-editor-surface:not([hidden]) .step-row").length === 2);
    await waitSaveEnabled(page);
    await saveButton(page).click();
    await waitClean(page);
    let saved = await page.evaluate(() => JSON.parse((window as any).fixture.calls.at(-1).content));
    const inserted = saved.steps.find((step: any) => step.stepRunnerKey === "sys:fixture_capability");
    assert.equal(inserted.inputParams.mode, "copy");
    assert.equal(inserted.inputParams.text, "preset text");
    await page.locator(".program-editor-surface:visible .step-row").first().focus();
    await page.keyboard.press("Control+z");
    await page.waitForFunction(() => document.querySelectorAll(".program-editor-surface:not([hidden]) .step-row").length === 1);
    await page.keyboard.press("Control+y");
    await page.waitForFunction(() => document.querySelectorAll(".program-editor-surface:not([hidden]) .step-row").length === 2);
    await page.getByLabel("打开或新建内部子程序", { exact: true }).click();
    await page.locator(".program-editor-tab-menu").getByRole("button", { name: "Child / Nested", exact: true }).click();
    await toolbox.locator(".toolbox-sub-item").filter({ hasText: "Copy fixture" }).dblclick();
    await popup.waitFor();
    await popup.getByRole("button", { name: "确定", exact: true }).click();
    await waitSaveEnabled(page);
    await saveButton(page).click();
    await waitClean(page);
    saved = await page.evaluate(() => JSON.parse((window as any).fixture.calls.at(-1).content));
    assert.equal(saved.steps.length, 2, "nested insert must not mutate the main body");
    assert.equal(saved.subPrograms[0].subPrograms[0].steps.length, 2);
    assert.equal(saved.subPrograms[0].subPrograms[0].steps.at(-1).inputParams.text, "preset text");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("appearance and body share save tickets, preserve native metadata and retain drafts through partial and late saves", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await page.evaluate(() => (window as any).fixture.enableDocumentSave());
    const properties = page.getByRole("tab", { name: "属性", exact: true });
    await properties.click();
    const appearance = page.getByRole("region", { name: "动作属性" });
    await appearance.getByLabel("标题", { exact: true }).fill("Appearance A");
    await appearance.getByLabel("说明", { exact: true }).fill("First line\nSecond line");
    await appearance.getByLabel("图标", { exact: true }).fill("iconify:mdi:check");
    assert.equal(await page.locator(".program-editor-catalog").isVisible(), false);
    if (screenshotDirectory) {
      await page.screenshot({ path: path.join(screenshotDirectory, "05-properties-light.png"), fullPage: true });
      await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
      await page.setViewportSize({ width: 480, height: 760 });
      await page.screenshot({ path: path.join(screenshotDirectory, "06-properties-dark-480px.png"), fullPage: true });
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    await page.getByRole("tab", { name: "主程序", exact: true }).click();
    await editNote(page, "body A");
    await saveButton(page).click();
    await waitClean(page);
    let calls = await page.evaluate(() => (window as any).fixture.documentCalls);
    assert.equal(calls.length, 1);
    assert.equal(JSON.parse(calls[0].content).steps[0].note, "body A");
    assert.equal(JSON.parse(calls[0].metadata.content).title, "Appearance A");
    assert.match(calls[0].metadata.content, /"editVersion":9223372036854775807/);
    assert.match(calls[0].metadata.content, /"fixtureFuture":9007199254740993/);
    assert.equal(await page.evaluate(() => (window as any).fixture.calls.length), 0, "one document save must not also invoke the legacy body writer");

    await editNote(page, "body B");
    await properties.click();
    await appearance.getByLabel("标题", { exact: true }).fill("Appearance B");
    await page.evaluate(() => { (window as any).fixture.documentMode = "partial"; });
    await saveButton(page).click();
    await page.getByText("fixture metadata write failed", { exact: true }).waitFor();
    await waitSaveEnabled(page);
    assert.equal(await appearance.getByLabel("标题", { exact: true }).inputValue(), "Appearance B");
    await page.evaluate(() => { (window as any).fixture.documentMode = "success"; });
    await saveButton(page).click();
    await waitClean(page);
    calls = await page.evaluate(() => (window as any).fixture.documentCalls);
    assert.equal(calls[2].expectedContent, calls[1].content, "retry uses only the body part known to have reached disk");
    assert.equal(calls[2].metadata.expectedContent, calls[0].metadata.content, "failed metadata keeps its earlier baseline");

    await appearance.getByLabel("标题", { exact: true }).fill("Pending C");
    await page.evaluate(() => { (window as any).fixture.documentMode = "defer"; });
    await saveButton(page).click();
    await page.waitForFunction(() => (window as any).fixture.documentPending.length === 1);
    await appearance.getByLabel("标题", { exact: true }).fill("Newer D");
    await page.evaluate(() => (window as any).fixture.resolveDocumentPending(0, { ok: true }));
    await waitSaveEnabled(page);
    assert.equal(await appearance.getByLabel("标题", { exact: true }).inputValue(), "Newer D");
    assert.deepEqual(await page.getByRole("alert").allTextContents(), []);
    await page.evaluate(() => { (window as any).fixture.documentMode = "success"; });
    await appearance.getByLabel("标题", { exact: true }).press("Control+s");
    await waitClean(page);
    calls = await page.evaluate(() => (window as any).fixture.documentCalls);
    assert.equal(JSON.parse(calls.at(-1).metadata.content).title, "Newer D");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("metadata callbacks remain bound to their document and server conflicts preserve the draft and block overwrite", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await page.evaluate(() => (window as any).fixture.enableDocumentSave());
    await page.getByRole("tab", { name: "属性", exact: true }).click();
    const appearance = page.getByRole("region", { name: "动作属性" });
    await appearance.getByLabel("标题", { exact: true }).fill("old document A");
    await page.evaluate(() => { (window as any).fixture.documentMode = "defer"; });
    await saveButton(page).click();
    await page.waitForFunction(() => (window as any).fixture.documentPending.length === 1);
    await page.evaluate(() => (window as any).fixture.setDocument("b"));
    await page.waitForSelector('[data-step-id="s-b"]');
    await waitClean(page);
    await page.evaluate(() => (window as any).fixture.resolveDocumentPending(0, { ok: true }));
    await page.getByRole("tab", { name: "属性", exact: true }).click();
    assert.equal(await appearance.getByLabel("标题", { exact: true }).inputValue(), "Fixture action");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.saved), []);
    await appearance.getByLabel("标题", { exact: true }).fill("new document B");
    await page.evaluate(() => { (window as any).fixture.documentMode = "success"; });
    await saveButton(page).click();
    await waitClean(page);
    const call = await page.evaluate(() => (window as any).fixture.documentCalls.at(-1));
    assert.match(call.path, /22222222/);
    assert.match(call.metadata.content, /22222222/);

    await appearance.getByLabel("标题", { exact: true }).fill("preserved conflict draft");
    await page.evaluate(() => { (window as any).fixture.documentMode = "conflict"; });
    await saveButton(page).click();
    await page.getByRole("alert").filter({ hasText: "动作属性已在外部变更" }).waitFor();
    assert.equal(await appearance.getByLabel("标题", { exact: true }).inputValue(), "preserved conflict draft");
    assert.equal(await saveButton(page).isDisabled(), true);
    await page.getByRole("tab", { name: "主程序", exact: true }).click();
    await editNote(page, "body after metadata conflict");
    assert.equal(await saveButton(page).isDisabled(), true, "body edits cannot clear an independent metadata conflict");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("explicit host sync keeps the current document inert until completion and cannot lock a different document", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await page.evaluate(() => (window as any).fixture.enableDocumentSave());
    await page.getByRole("tab", { name: "属性", exact: true }).click();
    const title = page.getByRole("region", { name: "动作属性" }).getByLabel("标题", { exact: true });
    await title.fill("local metadata before sync");
    await saveButton(page).click();
    await waitClean(page);
    assert.equal(await page.evaluate(() => (window as any).fixture.syncCalls.some((call: any) => call.op === "push")), false, "ordinary Save never writes to the host");
    await page.evaluate(() => { (window as any).fixture.syncMode = "defer"; });
    await page.getByRole("button", { name: "同步", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.syncPending.length === 1);
    await page.waitForFunction(() => document.querySelector(".action-project-data-editor-visual")?.hasAttribute("inert"));
    assert.equal(await title.isDisabled(), true);
    assert.equal(await saveButton(page).isDisabled(), true);
    await page.evaluate(() => {
      const f = (window as any).fixture;
      f.deferInfoRead = true;
      const infoPath = f.pathFor("a").replace(/data.json$/, "info.json");
      f.infoFiles[infoPath] = f.infoFiles[infoPath].replace("9223372036854775807", "2");
      f.syncPending[0].resolve({ ok: true, message: "fixture synced", editVersion: 2 });
    });
    await page.waitForFunction(() => (window as any).fixture.infoPending.length > 0);
    assert.equal(await title.isDisabled(), true, "host acknowledgement must not unlock edits before stamped info is adopted");
    assert.equal(await saveButton(page).isDisabled(), true);
    await page.evaluate(() => {
      const f = (window as any).fixture;
      f.deferInfoRead = false;
      f.infoPending.splice(0).forEach((pending: any) => pending.resolve());
    });
    await page.waitForFunction(() => !document.querySelector(".action-project-data-editor-visual")?.hasAttribute("inert"));
    assert.equal(await title.isDisabled(), false);
    await title.fill("second local metadata");
    await saveButton(page).click();
    await waitClean(page);
    assert.equal(await page.evaluate(() => JSON.parse((window as any).fixture.documentCalls.at(-1).metadata.expectedContent).editVersion), 2, "the next metadata save uses this Sync's adopted version");
    await page.getByRole("button", { name: "同步", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.syncPending.length === 2);
    await page.evaluate(() => (window as any).fixture.setDocument("b"));
    await page.waitForSelector('[data-step-id="s-b"]');
    await page.getByRole("tab", { name: "属性", exact: true }).click();
    assert.equal(await title.isDisabled(), false);
    await page.evaluate(() => (window as any).fixture.syncPending[1].resolve({ ok: true, message: "fixture old document synced", editVersion: 3 }));
    await title.fill("unlocked document B");
    await waitSaveEnabled(page);
    assert.equal(await title.inputValue(), "unlocked document B");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("a failed post-sync info refresh blocks local overwrite without replaying the host write", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await page.evaluate(() => (window as any).fixture.enableDocumentSave());
    await page.getByRole("tab", { name: "属性", exact: true }).click();
    const title = page.getByRole("region", { name: "动作属性" }).getByLabel("标题", { exact: true });
    await title.fill("preserved synced title");
    await saveButton(page).click();
    await waitClean(page);
    await page.evaluate(() => {
      const f = (window as any).fixture;
      f.syncMode = "defer";
    });
    await page.getByRole("button", { name: "同步", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.syncPending.length === 1);
    await page.evaluate(() => {
      const f = (window as any).fixture;
      f.infoReadError = "fixture post-sync info read failed";
      f.syncPending[0].resolve({ ok: true, message: "fixture synced", editVersion: 2 });
    });
    await page.getByText(/宿主已同步.*工作区刷新失败/).first().waitFor();
    await page.waitForFunction(() => !document.querySelector(".action-project-data-editor-visual")?.hasAttribute("inert"));
    assert.equal(await title.inputValue(), "preserved synced title");
    await title.fill("preserved newer draft after refresh failure");
    assert.equal(await saveButton(page).isDisabled(), true);
    assert.equal(await page.evaluate(() => (window as any).fixture.syncCalls.filter((call: any) => call.op === "push").length), 1);
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("Int64 sync versions keep push available and show distinct adjacent versions in the real conflict dialog", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await page.evaluate(() => {
      const f = (window as any).fixture;
      f.infoFiles[f.pathFor("a").replace(/data.json$/, "info.json")] = f.infoFiles[f.pathFor("a").replace(/data.json$/, "info.json")].replace("9223372036854775807", "9007199254740992");
      f.syncStatus = { state: "in_sync", message: "exact Int64 fixture", localEditVersion: "9007199254740992", remoteEditVersion: "9007199254740992" };
      f.enableDocumentSave();
    });
    await page.getByRole("tab", { name: "属性", exact: true }).click();
    const title = page.getByRole("region", { name: "动作属性" }).getByLabel("标题", { exact: true });
    await title.fill("Int64 local title");
    await saveButton(page).click();
    await waitClean(page);
    await page.evaluate(() => { (window as any).fixture.syncMode = "defer"; });
    await page.getByRole("button", { name: "同步", exact: true }).click();
    await page.waitForFunction(() => (window as any).fixture.syncPending.length === 1);
    await page.evaluate(() => {
      const f = (window as any).fixture;
      const infoPath = f.pathFor("a").replace(/data.json$/, "info.json");
      f.infoFiles[infoPath] = f.infoFiles[infoPath].replace("9007199254740992", "9007199254740993");
      f.syncPending[0].resolve({ ok: true, message: "exact Int64 synced", editVersion: "9007199254740993" });
    });
    await page.locator(".project-info-sync-btn--in-sync").waitFor();
    await page.waitForFunction(() => !document.querySelector(".action-project-data-editor-visual")?.hasAttribute("inert"));
    await title.fill("unsynced Int64 title");
    await saveButton(page).click();
    await waitClean(page);
    await page.evaluate(() => {
      (window as any).fixture.syncStatus = { state: "quicker_ahead", message: "adjacent Int64 remote change", localEditVersion: "9007199254740993", remoteEditVersion: "9007199254740994" };
    });
    await page.getByRole("button", { name: "同步", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "同步冲突" });
    await dialog.waitFor();
    assert.equal(await dialog.getByText("工作区 v9007199254740993", { exact: true }).count(), 1);
    assert.equal(await dialog.getByText("Quicker v9007199254740994", { exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => (window as any).fixture.syncCalls.filter((call: any) => call.op === "push").length), 1, "a conflict never dispatches an implicit second write");
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(await title.inputValue(), "unsynced Int64 title");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});


test("document catalog schemas and late responses remain owned by their target across main and embedded surfaces", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture({ catalogByTarget: true, catalogDeferA: true });
  try {
    await page.waitForFunction(() => (window as any).fixture.catalogPending.length > 0);
    await editNote(page, "A draft with pending catalog");
    await page.getByLabel("打开或新建内部子程序", { exact: true }).click();
    await page.locator(".program-editor-tab-menu").getByRole("button", { name: "Child", exact: true }).click();
    await page.waitForSelector('[data-step-id="s-child"]');
    assert.equal(await page.evaluate(() => (window as any).fixture.catalogRequests.filter((row: any) => row.body.catalogContext?.expectedProjectBinding?.hostBinding.hostInstanceId !== "instance-a").length), 0);
    await page.getByRole("tab", { name: "主程序", exact: true }).click();
    assert.equal(await currentNote(page).inputValue(), "A draft with pending catalog");

    await page.evaluate(() => (window as any).fixture.setDocument("b"));
    await page.waitForSelector('[data-step-id="s-b"]');
    await editNote(page, "B retained draft");
    await page.locator('.program-editor-surface:visible .step-row').first().dblclick();
    const popup = page.locator('.step-editor-popup');
    await popup.waitFor();
    await popup.getByText("B parameter", { exact: true }).waitFor();
    await page.evaluate(() => { for (const pending of (window as any).fixture.catalogPending) pending.resolve(); });
    await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    assert.equal(await popup.getByText("A parameter", { exact: true }).count(), 0);
    assert.equal(await popup.getByText("B parameter", { exact: true }).count(), 1);
    await popup.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(await currentNote(page).inputValue(), "B retained draft");
    await page.locator('.program-editor-surface:visible .step-row').first().focus();
    await page.keyboard.press("Control+z");
    assert.equal(await currentNote(page).inputValue(), "b initial", "catalog lifecycle must not reset document undo history");
    await page.keyboard.press("Control+y");
    await waitSaveEnabled(page);
    await saveButton(page).click();
    await waitClean(page);
    const saved = await page.evaluate(() => JSON.parse((window as any).fixture.calls.at(-1).content));
    assert.equal(saved.steps[0].note, "B retained draft");
    assert.deepEqual(saved.fixtureRoot, { keep: true });
    assert.deepEqual(saved.steps[0].fixtureStep, { keep: true });
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.catalogRequests.map((row: any) => row.method).filter((method: string) => method !== "POST")), []);
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});


test("one document history orders main, variable, nested and property edits without replacing opened surface nodes", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await page.evaluate(() => (window as any).fixture.enableDocumentSave());
    await page.getByRole("tab", { name: "属性", exact: true }).waitFor();
    await page.evaluate(() => { (window as any).historyMainRow = document.querySelector('[data-step-id="s-a"]'); });
    await editNote(page, "unified main");
    await page.getByRole("button", { name: "打开变量面板", exact: true }).click();
    await page.locator('.variable-form input[title="备注"]').fill("unified variable");
    await page.locator(".variable-toolbar-btn--close").click();
    await page.locator('summary[aria-label="打开或新建内部子程序"]').click();
    await page.locator(".program-editor-tab-menu button").filter({ hasText: "Child / Nested" }).click();
    await editNote(page, "unified nested");
    await page.evaluate(() => { (window as any).historyNestedRow = document.querySelector('[data-step-id="s-nested"]'); });
    await page.getByRole("tab", { name: "属性", exact: true }).click();
    await page.getByRole("textbox", { name: "标题", exact: true }).fill("Unified title");
    const undo = page.getByRole("toolbar", { name: "文档历史", exact: true }).getByTitle("撤销 (Ctrl+Z)", { exact: true });
    const redo = page.getByRole("toolbar", { name: "文档历史", exact: true }).getByTitle("重做 (Ctrl+Y / Ctrl+Shift+Z)", { exact: true });
    assert.equal(await undo.locator("svg path").count(), 1, "undo uses its actual bundled SVG");
    assert.equal(await redo.locator("svg path").count(), 1, "redo uses its actual bundled SVG");
    await undo.click();
    assert.equal(await page.getByRole("textbox", { name: "标题", exact: true }).inputValue(), "Fixture action");
    await undo.click();
    await page.getByRole("tab", { name: "Nested", exact: true }).click();
    assert.equal(await currentNote(page).inputValue(), "nested initial");
    await undo.click();
    await page.getByRole("tab", { name: "主程序", exact: true }).click();
    await page.getByRole("button", { name: "打开变量面板", exact: true }).click();
    assert.equal(await page.locator('.variable-form input[title="备注"]').inputValue(), "");
    await page.locator(".variable-toolbar-btn--close").click();
    await undo.click();
    assert.equal(await currentNote(page).inputValue(), "a initial");
    await waitClean(page);
    assert.equal(await undo.isDisabled(), true);
    for (let i = 0; i < 4; i++) await redo.click();
    assert.equal(await currentNote(page).inputValue(), "unified main");
    await page.getByRole("tab", { name: "Nested", exact: true }).click();
    assert.equal(await currentNote(page).inputValue(), "unified nested");
    assert.equal(await page.evaluate(() => (window as any).historyMainRow === document.querySelector('[data-step-id="s-a"]')
      && (window as any).historyNestedRow === document.querySelector('[data-step-id="s-nested"]')), true);
    await page.setViewportSize({ width: 480, height: 760 });
    await currentNote(page).focus();
    await page.locator(".program-editor-surface:visible .step-row").first().focus();
    assert.equal(await page.evaluate(() => {
      const root = document.querySelector(".program-editor-tab-workspace") as HTMLElement;
      const toolbar = root.querySelector('[aria-label="文档历史"]')!.getBoundingClientRect();
      const container = root.getBoundingClientRect();
      return root.scrollTop === 0 && toolbar.top >= container.top && toolbar.bottom <= container.bottom;
    }), true, "focusing a narrow editor scrolls its content, retaining the document history toolbar");
    await capture(page, "05-history-controls-dark-480px.png", "dark");
    await saveButton(page).click(); await waitClean(page);
    const saved = await page.evaluate(() => (window as any).fixture.documentCalls.at(-1));
    const body = JSON.parse(saved.content);
    assert.equal(body.variables[0].desc, "unified variable");
    assert.equal(body.variables[0]["default.file"], "files/default.txt");
    assert.deepEqual(body.subPrograms[0].subPrograms[0].steps[0].fixtureStep, { keep: true });
    assert.equal(JSON.parse(saved.metadata.content).title, "Unified title");
    assert.match(saved.metadata.content, /9223372036854775807/);
    assert.match(saved.metadata.content, /9007199254740993/);
    await page.getByRole("tab", { name: "属性", exact: true }).click();
    await capture(page, "06-properties-dark-480px.png", "dark");
    const toolbarAncestors = await page.evaluate(() => {
      const toolbar = document.querySelector('[aria-label="文档历史"]')!.getBoundingClientRect();
      const toolbarNode = document.querySelector('[aria-label="文档历史"]') as HTMLElement;
      const ancestors: { className: string; scrollTop: number; top: number; bottom: number }[] = [];
      let parent = document.querySelector(".program-editor-tab-workspace") as HTMLElement | null;
      while (parent) {
        const rect = parent.getBoundingClientRect();
        ancestors.push({ className: parent.className, scrollTop: parent.scrollTop, top: rect.top, bottom: rect.bottom });
        parent = parent.parentElement;
      }
      const strip = document.querySelector(".program-editor-tab-strip")!.getBoundingClientRect();
      return { toolbar: { top: toolbar.top, bottom: toolbar.bottom, height: toolbar.height, display: getComputedStyle(toolbarNode).display,
        painted: document.elementFromPoint(toolbar.left + 10, toolbar.top + 10)?.outerHTML.slice(0, 180) }, strip: { top: strip.top, bottom: strip.bottom }, ancestors };
    });
    if (browserDiagnostics) console.error(JSON.stringify({ phase: "metadata-toolbar-bounds", ...toolbarAncestors }));
    assert.equal(toolbarAncestors.toolbar.height > 0 && toolbarAncestors.ancestors.every((rect) => toolbarAncestors.toolbar.top >= rect.top && toolbarAncestors.toolbar.bottom <= rect.bottom), true,
      `metadata also retains the document toolbar inside every clipping ancestor: ${JSON.stringify(toolbarAncestors)}`);
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("document undo flushes inline drafts once and late save acknowledgements retain the shared history", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await currentNote(page).fill("uncommitted first draft");
    await page.keyboard.press("Control+z");
    assert.equal(await currentNote(page).inputValue(), "a initial");
    await page.locator(".program-editor-surface:visible .step-row").first().focus();
    await waitClean(page);
    await editNote(page, "saved first");
    await currentNote(page).fill("saved last draft");
    await page.evaluate(() => (document.querySelector(".action-project-data-editor-save") as HTMLButtonElement).click());
    await waitClean(page);
    assert.equal(await page.evaluate(() => JSON.parse((window as any).fixture.calls.at(-1).content).steps[0].note), "saved last draft");
    const toolbar = page.getByRole("toolbar", { name: "文档历史", exact: true });
    await toolbar.getByTitle("撤销 (Ctrl+Z)", { exact: true }).click();
    assert.equal(await currentNote(page).inputValue(), "saved first", "one committed inline draft creates exactly one history entry");
    await page.evaluate(() => { (window as any).fixture.mode = "defer"; });
    await saveButton(page).click();
    await page.waitForFunction(() => (window as any).fixture.pending.length === 1);
    await toolbar.getByTitle("撤销 (Ctrl+Z)", { exact: true }).click();
    assert.equal(await currentNote(page).inputValue(), "a initial");
    await page.evaluate(() => (window as any).fixture.resolvePending(0, { ok: true }));
    await waitSaveEnabled(page);
    assert.equal(await currentNote(page).inputValue(), "a initial");
    await toolbar.getByTitle("重做 (Ctrl+Y / Ctrl+Shift+Z)", { exact: true }).click();
    assert.equal(await currentNote(page).inputValue(), "saved first");
    await waitClean(page);
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});

test("two mounted document owners and their body portals isolate shared document undo", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture({ dualDocuments: true });
  try {
    const first = page.locator('[data-fixture-document="a"]');
    const second = page.locator('[data-fixture-document="b"]');
    for (const [root, note] of [[first, "first edit"], [second, "second edit"]] as const) {
      await root.locator(".step-form-note-input").fill(note);
      await root.locator(".step-row").first().focus();
      await root.locator(".step-row").filter({ hasText: note }).waitFor();
    }
    await page.keyboard.press("Control+z");
    assert.equal(await second.locator(".step-form-note-input").inputValue(), "b initial");
    assert.equal(await first.locator(".step-form-note-input").inputValue(), "first edit");
    await page.keyboard.press("Control+y");
    assert.equal(await second.locator(".step-form-note-input").inputValue(), "second edit");
    await first.locator(".step-row").first().focus();
    await page.keyboard.press("Control+z");
    assert.equal(await first.locator(".step-form-note-input").inputValue(), "a initial");
    assert.equal(await second.locator(".step-form-note-input").inputValue(), "second edit");
    await second.locator(".step-row").first().dblclick();
    const popup = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "确定", exact: true }) });
    await popup.waitFor();
    await popup.getByRole("button", { name: "取消", exact: true }).focus();
    await page.keyboard.press("Control+z");
    await popup.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(await second.locator(".step-form-note-input").inputValue(), "b initial", "the body portal keeps its exact document owner");
    assert.equal(await first.locator(".step-form-note-input").inputValue(), "a initial");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});


test("native property text undo stays inside the input while document toolbar follows the shared timeline", { timeout: 45_000 }, async () => {
  const { page, errors } = await openFixture();
  try {
    await page.evaluate(() => (window as any).fixture.enableDocumentSave());
    await page.getByRole("tab", { name: "属性", exact: true }).waitFor();
    await editNote(page, "body before native text");
    await page.getByRole("tab", { name: "属性", exact: true }).click();
    const title = page.getByRole("textbox", { name: "标题", exact: true });
    await title.focus();
    await page.keyboard.press("Control+a");
    // One native insertion has one undo unit; per-key typing is grouped by the browser/OS.
    await page.keyboard.insertText("Native input edit");
    await page.keyboard.press("Control+z");
    assert.equal(await title.inputValue(), "Fixture action");
    await page.getByRole("tab", { name: "主程序", exact: true }).click();
    assert.equal(await currentNote(page).inputValue(), "body before native text", "native input undo never consumes body history");
    await page.getByRole("tab", { name: "属性", exact: true }).click();
    await title.fill("one property transaction");
    await page.getByRole("toolbar", { name: "文档历史", exact: true }).getByTitle("撤销 (Ctrl+Z)", { exact: true }).click();
    assert.equal(await title.inputValue(), "Fixture action");
    await assertIsolated(page, errors);
  } finally { await page.close(); }
});
