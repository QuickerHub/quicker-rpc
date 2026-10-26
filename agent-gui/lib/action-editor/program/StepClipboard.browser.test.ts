import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {mkdtemp,mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {test} from "node:test";
import {build} from "esbuild";
import {chromium,type Page,type Browser} from "playwright";
import {parseLosslessJson} from "../shared/losslessJson";
import {fingerprintProgramDocumentContent} from "../document/programDocumentWire";
import {expandWireInputParams} from "../../input-param-wire";

const initial='{"steps":[{"stepId":"branch","stepRunnerKey":"sys:if","inputParams":{"condition":{"value":"$=true","future":9223372036854775807}},"ifSteps":[{"stepId":"inside","stepRunnerKey":"sys:comment","inputParams":{"note":{"varKey":"中文"}},"future":1.0000000000000001}],"elseSteps":[{"stepId":"else","stepRunnerKey":"sys:comment","note":"else branch"}],"note":"copied branch","future":9007199254740993},{"stepId":"anchor","stepRunnerKey":"sys:comment","note":"concurrent anchor","inputParams":{}}],"variables":[{"id":"value","key":"中文","varType":0,"defaultValue":"$$ {依赖}","future":1e999},{"id":"dependency","key":"依赖","varType":0,"defaultValue":"text"},{"id":"unrelated","key":"unrelated","default.file":"files/unrelated"}],"subPrograms":[],"future":0.123456789012345678901}';
const fixture=`
import React,{StrictMode,useState}from'react';import{createRoot}from'react-dom/client';
import{ActionProjectDataEditor}from'@/components/action-editor/ActionProjectDataEditor';
import'@/app/globals.css';
const config=window.fixtureConfig;
const f=window.fixture={saved:[],unexpected:[],text:'',reads:0,textReads:0,textWrites:0,writes:[],deferRead:false,deferWrite:false,pendingReads:[],pendingWrites:[]};
window.ClipboardItem=class{constructor(values){this.values=values;}getType(type){return Promise.resolve(this.values[type]);}};
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
 read:async()=>{f.reads++;const text=f.deferRead?await new Promise(resolve=>f.pendingReads.push(resolve)):f.text;return[{types:['quicker-action-steps'],getType:async()=>new Blob([text],{type:'text/plain'})}];},
 readText:async()=>{f.textReads++;return f.text;},
 write:async items=>{if(f.deferWrite)return await new Promise((_resolve,reject)=>f.pendingWrites.push(()=>reject(Error('fixture denied write'))));f.text=await(await items[0].getType('text/plain')).text();f.writes.push(f.text);},
 writeText:async text=>{f.textWrites++;f.text=text;f.writes.push(text);},
}});
function App(){const[active,setActive]=useState('a'),[visible,setVisible]=useState(true),[epoch,setEpoch]=useState(0);
 f.switch=setActive;f.setVisible=setVisible;f.replace=()=>setEpoch(x=>x+1);
 return <><nav><button onClick={()=>setActive('a')}>Document A</button><button onClick={()=>setActive('b')}>Document B</button><input aria-label="ordinary fixture input"/><div contentEditable suppressContentEditableWarning aria-label="ordinary editable text">native text</div></nav>
 {['a','b'].map(owner=><section key={owner+':'+(owner==='a'?epoch:0)} data-fixture-document={owner} hidden={!visible||active!==owner}>
 <ActionProjectDataEditor active={visible&&active===owner} path={config.paths[owner]} content={config.contents[owner]} cwd={config.cwd}
 onSave={async()=>{throw Error('Legacy save must not run');}} onSaved={()=>f.saved.push(owner)}/></section>)}
 </>;
}
createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);
`;
let compilation:ReturnType<typeof build>|undefined;
function compile(){return compilation??=build({stdin:{contents:fixture,loader:"tsx",resolveDir:process.cwd()},bundle:true,write:false,metafile:true,platform:"browser",format:"iife",jsx:"automatic",outfile:"fixture.js",define:{"process.env.NODE_ENV":'"development"'},tsconfig:path.join(process.cwd(),"tsconfig.json"),
 plugins:[{name:"isolated-step-clipboard-leaves",setup(builder){
 builder.onResolve({filter:/(shared\/IconControl$|^@\/components\/chat\/(FileEditorCard|ActionIcon|FaIconProvider)$|^@\/lib\/(workspace-explorer|chat-composer-bridge|action-command-client|action-trace-client)$)/},args=>({path:args.path,namespace:"fixture-leaf"}));
 builder.onLoad({filter:/.*/,namespace:"fixture-leaf"},args=>{
  if(args.path.endsWith('FileEditorCard'))return{contents:"import React from'react';export function FileEditorCard(p){return <pre data-source-content>{p.content}</pre>}",loader:"jsx",resolveDir:process.cwd()};
  if(args.path.endsWith('FaIconProvider'))return{contents:"export function FaIconProvider(p){return p.children}",loader:"js"};
  if(args.path.endsWith('workspace-explorer'))return{contents:"export const workspaceExplorerActionsRef={current:{notifyProjectRemoved(){}}}",loader:"js"};
  if(args.path.endsWith('chat-composer-bridge'))return{contents:"export const chatComposerActionsRef={current:{insertProgramStepTag(){throw Error('No pin in clipboard test')},focusComposer(){}}}",loader:"js"};
  if(args.path.endsWith('action-command-client'))return{contents:"export function isQuickerActionMissingError(){return false}export function invokeActionCommand(){throw Error('No real action')}",loader:"js"};
  if(args.path.endsWith('action-trace-client'))return{contents:"export function startActionTrace(){throw Error('No real trace')}",loader:"js"};
  return{contents:"export function IconControl(){return null}export function ActionIcon(){return null}",loader:"js"};
 });
 }}]});}

const childSource=`
import{createServer}from'node:http';import{readFile,writeFile}from'node:fs/promises';
globalThis.fetch=async()=>{throw Error('Fixture forbids outbound HTTP and native hosts')};
const route=await import(process.env.FIXTURE_WORKSPACE_ROUTE);
const html=await readFile(process.env.FIXTURE_HTML,'utf8');
const server=createServer(async(req,res)=>{try{
 const origin='http://127.0.0.1',url=new URL(req.url,origin);let reply;
 if(url.pathname==='/'){res.setHeader('content-type','text/html;charset=utf-8');res.end(html);return;}
 if(url.pathname==='/favicon.ico'){res.statusCode=204;res.end();return;}
 if(url.pathname==='/api/workspace'){
  let body='';for await(const part of req)body+=part;
  const payload=req.method==='POST'?JSON.parse(body):Object.fromEntries(url.searchParams);
  if(payload.cwd!==process.env.FIXTURE_CWD)throw Error('Wrong synthetic workspace');
  if(!['read','list','program-document-target','save-program-document'].includes(payload.op))throw Error('Unexpected filesystem operation '+payload.op);
  reply=await route[req.method==='POST'?'POST':'GET'](new Request(origin+req.url,{method:req.method,...(req.method==='POST'?{headers:{'content-type':'application/json'},body}:{} )}));
 }else if(url.pathname==='/api/clipboard/write-special-format')reply=Response.json({ok:false,stub:true});
 else if(url.pathname==='/api/clipboard/read-special-format')reply=Response.json({hasData:false});
 else if(url.pathname==='/api/step-runner/list'||url.pathname==='/api/step-runner/summaries'||url.pathname==='/api/subprogram/list')reply=Response.json({ok:true,items:[]});
 else if(url.pathname==='/api/step-runner/get')reply=Response.json({ok:true,item:{key:'sys:if',name:'Fixture conditional',inputParamDefs:[],outputParamDefs:[]},source:'fixture'});
 else throw Error('Unexpected request '+url.pathname);
 res.statusCode=reply.status;res.setHeader('content-type','application/json');res.end(await reply.text());
 }catch(error){res.statusCode=500;res.end(JSON.stringify({ok:false,error:String(error)}));console.error(String(error));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));console.log(JSON.stringify({port:server.address().port}));
process.on('message',message=>{if(message==='close')server.close(()=>{process.disconnect();});});
`;
async function open(source=initial){
  const parent=path.resolve("../.tmp/step-clipboard-dom");await mkdir(parent,{recursive:true});const root=await mkdtemp(path.join(parent,"case-")),cwd=path.join(root,"workspace");
  const paths={a:".quicker/actions/11111111-1111-4111-8111-111111111111/data.json",b:".quicker/actions/22222222-2222-4222-8222-222222222222/data.json"};
  const contents={a:source,b:source.replaceAll('copied branch','B copied branch')};
  for(const owner of ["a","b"] as const){const full=path.join(cwd,paths[owner]);await mkdir(path.dirname(full),{recursive:true});await writeFile(full,contents[owner]);await writeFile(path.join(path.dirname(full),"info.json"),JSON.stringify({kind:"action",id:paths[owner].split('/').at(-2),title:"Clipboard "+owner,editVersion:1}));}
  const bundle=await compile();assert.ok(Object.keys(bundle.metafile!.inputs).every(file=>!/(?:^|\/)lib\/(?:db\/|qkrpc\.ts|llm-config)/.test(file.replaceAll("\\","/"))));
  const js=bundle.outputFiles.find(file=>file.path.endsWith('.js'))!.text,css=bundle.outputFiles.find(file=>file.path.endsWith('.css'))?.text??'';
  const html=path.join(root,"fixture.html"),childPath=path.join(root,"api.mjs");
  await writeFile(html,`<html data-theme="dark"><style>${css}\nhtml,body{margin:0;height:100%;font:14px system-ui;background:var(--ad-bg-panel);color:var(--ad-fg-primary)}nav{display:flex;gap:8px;flex-wrap:wrap;padding:8px}section[data-fixture-document]{height:calc(100vh - 80px)}[hidden]{display:none!important}</style><div id="root"></div><script>window.fixtureConfig=${JSON.stringify({cwd,paths,contents})}</script><script>${js.replaceAll('</script','<\\/script')}</script></html>`);
  await writeFile(childPath,childSource);
  const env:NodeJS.ProcessEnv={};for(const key of ["SystemRoot","SystemDrive","ComSpec","PATH","PATHEXT","TEMP","TMP"])env[key]=process.env[key];
  Object.assign(env,{APPDATA:path.join(root,'roaming'),LOCALAPPDATA:path.join(root,'local'),USERPROFILE:path.join(root,'home'),HOME:path.join(root,'home'),QUICKER_AGENT_DATA_DIR:path.join(root,'profile'),LLM_CONFIG_PATH:path.join(root,'absent.json'),BUNDLED_LLM_CONFIG:'{}',BUNDLED_LLM_REMOTE_CONFIG_DISABLED:'1',AGENT_GUI_DEFAULT_CWD:cwd,FIXTURE_CWD:cwd,FIXTURE_HTML:html,FIXTURE_WORKSPACE_ROUTE:pathToFileURL(path.resolve('app/api/workspace/route.ts')).href});
  const child=spawn(process.execPath,["--conditions=react-server","--import",pathToFileURL(path.resolve('node_modules/tsx/dist/loader.mjs')).href,childPath],{cwd:process.cwd(),env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
  const exited=once(child,'exit');let output='',errors='';child.stderr!.on('data',part=>errors+=part);
  let browser:Browser|undefined;
  try {
  const port=await new Promise<number>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('API start timed out '+errors)),15000);child.once('exit',()=>{clearTimeout(timer);reject(Error(errors));});child.stdout!.on('data',part=>{output+=part;for(const line of output.split(/\r?\n/)){try{const value=JSON.parse(line);if(value.port){clearTimeout(timer);resolve(value.port);}}catch{}}});});
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1200,height:850}});const pageErrors:string[]=[];
  page.setDefaultTimeout(10000);page.on('pageerror',error=>pageErrors.push(error.message));await page.route('**/*',route=>new URL(route.request().url()).origin===`http://127.0.0.1:${port}`?route.continue():route.abort());
  await page.goto(`http://127.0.0.1:${port}`);await page.locator('[data-fixture-document="a"] [data-step-id]').first().waitFor();
  return{page,root,cwd,paths,errors:pageErrors,read:(owner:'a'|'b'='a')=>readFile(path.join(cwd,paths[owner]),'utf8'),close:async()=>{await browser!.close();if(child.connected)child.send('close');const[exitCode,signal]=await exited;assert.equal(exitCode,0);assert.equal(signal,null);assert.equal(errors,'');assert.deepEqual(pageErrors,[]);await writeFile(path.join(root,'receipt.json'),JSON.stringify({root,cwd,paths,ownedApiPid:child.pid,apiExitCode:exitCode,apiSignal:signal,browserClose:'await browser.close',realWorkspaceApi:true,realDiskSave:true,unexpectedOutbound:0,pageErrors},null,2));console.log('Step clipboard DOM evidence: '+root);}};
  } catch(error) {await browser?.close();if(child.exitCode===null)child.kill();await exited;throw error;}
}
const doc=(page:Page)=>page.locator('[data-fixture-document]:visible');
async function key(page:Page,key:'c'|'v',id='branch'){await doc(page).locator(`[data-step-id="${id}"]`).click();await doc(page).locator('.step-editor').focus();await page.keyboard.press('Control+'+key);}
async function raw(page:Page){await doc(page).getByRole('tab',{name:'源码 JSON',exact:true}).click();const value=await doc(page).locator('[data-source-content]').innerText();await doc(page).getByRole('tab',{name:/^可视化/}).click();return value;}
async function save(page:Page){const before=await page.evaluate(()=>(window as any).fixture.saved.length);const button=doc(page).getByRole('button',{name:'保存到工作区',exact:true});await button.waitFor();await button.click();await page.waitForFunction(before=>(window as any).fixture.saved.length>before,before);await page.waitForFunction(()=>[...document.querySelectorAll('[data-fixture-document]:not([hidden]) button')].find(node=>node.textContent==='保存到工作区')?.hasAttribute('disabled'));}

test('step clipboard preserves raw branches, variable closure and concurrent edits through real disk Save/undo/redo',{timeout:90000},async()=>{
  const f=await open();try{
    await key(f.page,'c');await f.page.waitForFunction(()=>(window as any).fixture.writes.length===1);
    await f.page.evaluate(()=>{(window as any).fixture.deferRead=true;});await key(f.page,'v','anchor');await f.page.waitForFunction(()=>(window as any).fixture.pendingReads.length===1);
    await doc(f.page).locator('[data-step-id="anchor"]').click();const note=doc(f.page).locator('.step-form-note-input');await note.fill('concurrent unblurred note');
    await f.page.evaluate(()=>{const f=(window as any).fixture;f.pendingReads[0](f.text);});
    await f.page.waitForFunction(()=>document.querySelectorAll('[data-fixture-document]:not([hidden]) [data-step-id]').length>4);
    await save(f.page);const saved=await f.read();assert.match(saved,/concurrent unblurred note/);assert.match(saved,/9223372036854775807/);assert.match(saved,/1\.0000000000000001/);assert.match(saved,/0\.123456789012345678901/);
    const body=parseLosslessJson(saved) as {steps:{stepId:string;ifSteps:{inputParams:Record<string,unknown>}[]}[];variables:{key:string}[]};assert.equal(body.steps.length,3);assert.deepEqual(body.variables.map(row=>row.key),['中文','依赖','unrelated','中文_copy','依赖_copy']);
    const rawBody=body as unknown as {steps:{future:unknown;inputParams:{condition:{future:unknown}}}[]};
    assert.deepEqual(rawBody.steps[2]!.future,rawBody.steps[0]!.future);
    assert.deepEqual(rawBody.steps[2]!.inputParams.condition.future,rawBody.steps[0]!.inputParams.condition.future);
    const history=doc(f.page).getByRole('toolbar',{name:'文档历史',exact:true});await history.getByTitle('撤销 (Ctrl+Z)',{exact:true}).click();await save(f.page);const undone=await f.read();assert.equal((JSON.parse(undone).steps).length,2);assert.match(undone,/concurrent unblurred note/);
    await history.getByTitle('重做 (Ctrl+Y \/ Ctrl+Shift+Z)',{exact:true}).click();await save(f.page);assert.deepEqual(parseLosslessJson(await f.read()),parseLosslessJson(saved));
    for(const theme of ['light','dark']){await f.page.evaluate(value=>document.documentElement.dataset.theme=value,theme);await f.page.screenshot({path:path.join(f.root,theme+'.png')});}
    await f.page.setViewportSize({width:380,height:760});await f.page.screenshot({path:path.join(f.root,'narrow.png')});
  }finally{await f.close();}
});

test('step clipboard invalidates delayed reads across hide-show, document replacement and manual popup intent',{timeout:90000},async()=>{
  const f=await open();try{
    await key(f.page,'c');await f.page.waitForFunction(()=>(window as any).fixture.writes.length===1);
    await f.page.evaluate(()=>{(window as any).fixture.deferRead=true;});
    for(const mode of ['hidden','replace','popup','popupClosed','quick']){
      await key(f.page,'v');const index=await f.page.evaluate(()=>(window as any).fixture.pendingReads.length-1);await f.page.waitForFunction(index=>(window as any).fixture.pendingReads[index]!=null,index);
      if(mode==='hidden'){await f.page.evaluate(()=>(window as any).fixture.setVisible(false));await doc(f.page).waitFor({state:'hidden'});await f.page.evaluate(()=>(window as any).fixture.setVisible(true));}
      if(mode==='replace'){await f.page.evaluate(()=>(window as any).fixture.replace());await doc(f.page).locator('[data-step-id="branch"]').waitFor();}
      if(mode==='popup'||mode==='popupClosed'){await doc(f.page).locator('[data-step-id="branch"]').dblclick();await f.page.locator('.step-editor-popup').waitFor();if(mode==='popupClosed')await f.page.locator('.step-editor-popup').getByRole('button',{name:'取消',exact:true}).click();}
      if(mode==='quick'){await f.page.keyboard.press('Enter');await f.page.locator('.step-quick-insert-input').fill('new search draft');}
      await f.page.evaluate(index=>{const f=(window as any).fixture;f.pendingReads[index](f.text);},index);await f.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.equal(await doc(f.page).locator('[data-step-id]').count(),4);assert.equal(await f.read(),initial);
      if(mode==='popup'){assert.equal(await f.page.locator('.step-editor-popup').isVisible(),true);await f.page.locator('.step-editor-popup').getByRole('button',{name:'取消',exact:true}).click();}
      if(mode==='quick'){assert.equal(await f.page.locator('.step-quick-insert-input').inputValue(),'new search draft');await f.page.keyboard.press('Escape');}
    }
    assert.equal(await raw(f.page),initial);
  }finally{await f.close();}
});

test('step clipboard brings the necessary internal program and interface pins through APDE Save as one transaction',{timeout:90000},async()=>{
  const source=JSON.stringify({steps:[{stepId:'call',stepRunnerKey:'sys:subprogram',inputParams:{subProgram:{value:'worker'},'var:argument':{varKey:'caller'}},outputParams:{'var:answer':'caller'},note:'internal call'}],
    variables:[{id:'caller',key:'caller',varType:0}],subPrograms:[{id:'worker',name:'worker',kind:1,future:'__wide__',steps:[{stepId:'work',stepRunnerKey:'sys:comment',inputParams:{note:{varKey:'argument'}},outputParams:{value:'answer'}}],variables:[{id:'arg',key:'argument',varType:0,isInput:true,inputParamInfo:{future:'__wide__'}},{id:'answer',key:'answer',varType:0,isOutput:true}],subPrograms:[]}]}).replaceAll('"__wide__"','9223372036854775807');
  const f=await open(source);try{
    await key(f.page,'c','call');await f.page.waitForFunction(()=>(window as any).fixture.writes.length===1);await key(f.page,'v','call');
    await f.page.waitForFunction(()=>document.querySelectorAll('[data-fixture-document]:not([hidden]) .step-editor [data-step-id]').length===2);
    await save(f.page);const saved=await f.read(),body=JSON.parse(saved);assert.equal(body.steps.length,2);assert.equal(body.variables.length,2);assert.equal(body.subPrograms.length,2);
    // Save uses the existing compact wire codec; decode known bindings without losing extension assertions.
    const inputs=expandWireInputParams(body.steps[1].inputParams);
    assert.equal(inputs.subProgram!.value,'$="worker_copy"');assert.equal(inputs['var:argument_copy']!.varKey,'caller_copy');
    assert.equal(body.steps[1].outputParams['var:answer_copy'],'caller_copy');assert.match(saved,/9223372036854775807/);
    const history=doc(f.page).getByRole('toolbar',{name:'文档历史',exact:true});await history.getByTitle('撤销 (Ctrl+Z)',{exact:true}).click();await save(f.page);
    assert.equal(fingerprintProgramDocumentContent(await f.read()),fingerprintProgramDocumentContent(source));
  }finally{await f.close();}
});

test('step clipboard keeps native text shortcuts and stops old copy fallback after owner change',{timeout:90000},async()=>{
  const f=await open();try{
    await doc(f.page).locator('[data-step-id="anchor"]').click();const note=doc(f.page).locator('.step-form-note-input');await note.focus();
    assert.equal(await note.evaluate(node=>{const event=new KeyboardEvent('keydown',{key:'c',ctrlKey:true,bubbles:true,cancelable:true});node.dispatchEvent(event);return event.defaultPrevented;}),false);
    await doc(f.page).locator('.step-editor').evaluate(node=>{const editable=document.createElement('div');editable.contentEditable='true';editable.setAttribute('aria-label','owned editable text');editable.textContent='native text';node.appendChild(editable);});
    const editable=doc(f.page).getByLabel('owned editable text',{exact:true});await editable.focus();
    assert.equal(await editable.evaluate(node=>{const event=new KeyboardEvent('keydown',{key:'v',ctrlKey:true,bubbles:true,cancelable:true});node.dispatchEvent(event);return event.defaultPrevented;}),false);
    assert.equal(await f.page.evaluate(()=>(window as any).fixture.reads+(window as any).fixture.writes.length),0);
    await f.page.evaluate(()=>{(window as any).fixture.deferWrite=true;});await key(f.page,'c');await f.page.waitForFunction(()=>(window as any).fixture.pendingWrites.length===1);
    await f.page.evaluate(()=>(window as any).fixture.switch('b'));await f.page.locator('[data-fixture-document="b"] [data-step-id="anchor"]').click();const nextNote=doc(f.page).locator('.step-form-note-input');await nextNote.focus();
    await f.page.evaluate(()=>(window as any).fixture.pendingWrites[0]());await f.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await f.page.evaluate(()=>(window as any).fixture.textWrites),0);assert.equal(await nextNote.evaluate(node=>document.activeElement===node),true);assert.equal(await f.read(),initial);
  }finally{await f.close();}
});

test('opaque step and pin expressions keep the previous clipboard and document unchanged',{timeout:90000},async()=>{
  for(const carrier of ['step','pin'])for(const marker of ['{count+1=}','{count']){
    const source=JSON.stringify({steps:[{stepId:'one',stepRunnerKey:'sys:comment',note:'opaque carrier',inputParams:{note:{varKey:'count',...(carrier==='pin'?{future:marker}:{})}},...(carrier==='step'?{future:marker}:{})}],variables:[{id:'count',key:'count',varType:1,defaultValue:'1'}],subPrograms:[]});
    const f=await open(source);try{
      const before=await raw(f.page);await f.page.evaluate(()=>(window as any).fixture.text='keep previous clipboard');
      await key(f.page,'c','one');await f.page.getByText('未知字段 future 可能含依赖，尚不能证明可移交',{exact:true}).waitFor();
      assert.equal(await f.page.evaluate(()=>(window as any).fixture.text),'keep previous clipboard');
      assert.equal(await f.page.evaluate(()=>(window as any).fixture.writes.length+(window as any).fixture.textWrites),0);
      assert.equal(await raw(f.page),before);assert.equal(await f.read(),source);assert.equal(await f.page.evaluate(()=>(window as any).fixture.saved.length),0);
    }finally{await f.close();}
  }
});
