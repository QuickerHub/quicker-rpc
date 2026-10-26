import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Page } from "playwright";
import { parseLosslessJson, stringifyLosslessJson } from "../shared/losslessJson";

const fixture = `
import React,{StrictMode,useCallback,useLayoutEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import XProgramEditor from '@/lib/action-editor/program/XProgramEditor';
import {createProgramDocumentSession} from '@/lib/action-editor/document/programDocumentSession';
import {createProgramDocumentEditorController} from '@/lib/action-editor/program/programDocumentEditorController';
import {fingerprintXProgramPresent} from '@/lib/action-editor/program/xProgramHistory';
import '@/components/action-editor/action-editor-theme.css';
import '@/components/action-editor/action-editor.css';
const variable=(id,key,extra={})=>({id,key,varType:0,...extra});
const step=(id)=>({stepId:id,stepRunnerKey:'fixture:inputs',note:'before',inputParams:{'value.var':'old',legacy:{VarKey:'old',Value:'',future:123},expression:'$$ {old} {older}',literal:'literal unchanged'},outputParams:{result:'old.member'},ifSteps:[{stepId:id+'-branch',stepRunnerKey:'fixture:branch',inputParams:{value:'$={old}'}}]});
const program={steps:[step('main-step')],variables:[variable('old-id','old'),variable('older-id','older'),variable('spare-id','spare')],
 subPrograms:[{id:'child',name:'Child',kind:1,steps:[step('child-step')],variables:[variable('child-old','old')],subPrograms:[]},{id:'sibling',name:'Sibling',kind:1,steps:[step('sibling-step')],variables:[variable('sibling-old','old')],subPrograms:[]}],future:123};
if(window.options?.external) program.variables[0]['default.file']='files/default.txt';
if(window.options?.interface) program.subPrograms[0].variables[0].isInput=true;
if(window.options?.opaque) program.steps[0].inputParams.opaque=['{old}'];
if(window.options?.plainUnknown) program.steps[0].inputParams.literal='literal {old}';
if(window.options?.clipboardRich) Object.assign(program.variables[0],{desc:'original description',customType:'System.String',future:123,
 inputParamInfo:{isRequired:true,selectionItems:'one|two',future:123},outputParamInfo:{visibleExpression:'true',future:123},
 tableDef:{fields:[{fieldKey:'column',label:'Column',quickerVarType:0,future:123}]}});
const raw=JSON.stringify(program).replaceAll('123','9223372036854775807');
window.fixture={saves:[],events:[],reads:[],handles:{},raw};
function App(){
 const [,update]=useState(0);const [surface,setSurface]=useState('main');const [visible,setVisible]=useState(true);const [replaced,setReplaced]=useState(false);
 const state=useRef(null);
 if(!state.current){
  const session=createProgramDocumentSession({content:raw,identity:{documentKey:'owned-a',projectBinding:null}});
  const other=createProgramDocumentSession({content:raw.replaceAll('old-id','other-old-id'),identity:{documentKey:'owned-b',projectBinding:null}});
  const onChange=result=>{window.fixture.events.push({ok:result.ok,revision:result.state.revision});update(n=>n+1)};
  const controller=createProgramDocumentEditorController(session,{isCurrent:()=>!session.isClosed(),onChange});
  const otherController=createProgramDocumentEditorController(other,{isCurrent:()=>!other.isClosed(),onChange});
  state.current={session,controller,other,otherController};
 }
 const {session,controller,other,otherController}=state.current;
 const current=replaced?other:session, currentController=replaced?otherController:controller;
 const refs=useRef({});
 const mainHandle=useCallback(h=>{refs.current.main=h;window.fixture.handles.main=h},[]);
 const childHandle=useCallback(h=>{refs.current.child=h;window.fixture.handles.child=h},[]);
 const flush=()=>{for(const h of Object.values(refs.current)) if(h?.flushPendingEdits?.()===false)return false;return true};
 const save=()=>{if(!flush())return false;const started=current.beginSave(()=>current.readSnapshot());if(!started.ok)return false;window.fixture.saves.push(started.ticket.content);current.completeSave(started.ticket,{ok:true});update(n=>n+1);return true};
 useLayoutEffect(()=>{Object.assign(window.fixture,{session,controller,other,current:()=>current,read:()=>session.getState().content,save,setSurface,setVisible,setReplaced,
   agentNote:(note)=>controller.applyAgentStepNote({expectedRevision:session.getState().revision,expectedIdentity:session.getState().identity,stepId:'main-step',note}),
   changeSelectedVariable:()=>session.transact({expectedRevision:session.getState().revision,source:'agent',update:body=>{body.variables[0].desc='newer agent description'}}),
   notify:()=>update(n=>n+1)});});
 return <div className="fixture">
  <nav><button onClick={()=>setSurface('main')}>Main</button><button onClick={()=>setSurface('child')}>Child</button><button onClick={()=>{if(flush())currentController.undo()}}>Undo document</button><button onClick={()=>{if(flush())currentController.redo()}}>Redo document</button><button onClick={save}>Save document</button></nav>
  <div className="fixture-editor" hidden={!visible||surface!=='main'}><XProgramEditor control={window.options?.standalone?undefined:currentController.getSurface('main')} initialPresent={current.readSnapshot()} baselineFingerprint={fingerprintXProgramPresent(current.readSnapshot())} editorTabId="main" programDocumentKey={replaced?'b/data.json':'a/data.json'} active={visible&&surface==='main'} onEditorHandleChange={mainHandle}/></div>
  <div className="fixture-editor" hidden={!visible||surface!=='child'}><XProgramEditor control={controller.getSurface('sub-child')} initialPresent={controller.getSurface('sub-child').getPresent()} baselineFingerprint="child" editorTabId="sub-child" programDocumentKey="a/data.json" programSurface="subProgram" active={visible&&surface==='child'} onEditorHandleChange={childHandle}/></div>
 </div>;
}
createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);
`;
let compiled: { javascript: string; stylesheet: string } | undefined;
async function compile() {
  if (compiled) return compiled;
  const output = await build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", outfile: "fixture.js", define: { "process.env.NODE_ENV": '"development"' },
    tsconfig: path.join(process.cwd(), "tsconfig.json"), plugins: [{ name: "owned-editor-leaves", setup(builder) {
      builder.onResolve({ filter: /(^@\/lib\/action-editor\/steps\/(StepListEditor|useStepParamFileContents)$|shared\/IconControl$)/ }, args => ({ path: args.path, namespace: "fixture-leaf" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture-leaf" }, args => {
        if (args.path.endsWith("useStepParamFileContents")) return { contents: "export function useStepParamFileContents(){return {}}", loader: "js" };
        if (args.path.endsWith("IconControl")) return { contents: "import React from 'react';export function IconControl(){return <svg width='12' height='12' viewBox='0 0 12 12'><path d='M2 6h8M6 2v8' stroke='currentColor'/></svg>}", loader: "jsx", resolveDir: process.cwd() };
        return { contents: "import React from 'react';export default function StepListEditor(p){return <output data-step-note>{p.steps[0]?.note}</output>}", loader: "jsx", resolveDir: process.cwd() };
      });
    } }] });
  compiled = { javascript: output.outputFiles.find(file => file.path.endsWith(".js"))!.text,
    stylesheet: output.outputFiles.find(file => file.path.endsWith(".css"))!.text };
  return compiled;
}
async function open(options: Record<string, boolean> = {}, width = 1100, theme = "dark") {
  const bundle = await compile(), browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width, height: 850 } }), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => route.abort());
  await page.setContent(`<html data-theme="${theme}"><head><style>${bundle.stylesheet}\nhtml,body,#root{margin:0;width:100%;height:100%;background:var(--ad-bg-panel);color:var(--ad-fg-primary);font:14px system-ui}.fixture{height:100%;display:flex;flex-direction:column}nav{display:flex;flex-wrap:wrap;gap:8px;padding:8px}nav button{color:inherit;background:var(--ad-bg-input);border:1px solid var(--ad-border-input)}.fixture-editor{flex:1;min-height:0}.fixture-editor[hidden]{display:none}.x-program-editor{height:100%}</style></head><body><div id="root"></div></body></html>`);
  await page.evaluate(value => { (window as any).options = value; }, options);
  await page.addScriptTag({ content: `
    const state = window.clipboardFixture = {
      text: "", writes: [], reads: 0, textWrites: 0, deferRead: false, deferWrite: false,
      pendingReads: [], pendingWrites: [],
    };
    Object.defineProperty(window, "ClipboardItem", { configurable: true, value: class {
      constructor(values) { this.values = values; }
      getType(type) { return Promise.resolve(this.values[type]); }
    } });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      readText: async () => { state.reads++; return state.deferRead ? await new Promise(resolve => state.pendingReads.push(resolve)) : state.text; },
      write: async (items) => {
        if (state.deferWrite) return await new Promise((_resolve, reject) => state.pendingWrites.push(() => reject(new Error("fixture write denied"))));
        state.text = await (await items[0].getType("text/plain")).text(); state.writes.push(state.text);
      },
      writeText: async (text) => { state.textWrites++; state.text = text; state.writes.push(text); },
    } });
  ` });
  await page.addScriptTag({ content: bundle.javascript });
  await page.waitForFunction(() => !!(window as any).fixture?.handles.main);
  return { page, browser, errors };
}
const nameInput = (page: Page) => page.locator('.fixture-editor:visible input[title="变量名"]');
async function variables(page: Page) { await page.locator('.fixture-editor:visible').getByRole("button", { name: "打开变量面板", exact: true }).click(); }
async function raw(page: Page) { return page.evaluate(() => (window as any).fixture.read() as string); }
async function body(page: Page) { return JSON.parse(await raw(page)); }
async function variableClipboardKey(page: Page, key: "c" | "v", id = "old-id") {
  await page.locator(`.fixture-editor:visible [data-variable-id="${id}"]`).focus();
  await page.keyboard.press(`Control+${key}`);
}

test("variable rename updates actual native bindings and branches in one session history while other local scopes stay intact", { timeout: 60_000 }, async () => {
  const { page, browser, errors } = await open();
  try {
    await variables(page); await nameInput(page).fill("renamed"); await page.getByRole("button", { name: "Save document", exact: true }).click();
    const renamed = await body(page);
    assert.equal(renamed.variables[0].key, "renamed"); assert.equal(renamed.steps[0].inputParams["value.var"], "renamed");
    assert.equal(renamed.steps[0].inputParams.legacy.varKey ?? renamed.steps[0].inputParams.legacy.VarKey, "renamed");
    assert.equal(renamed.steps[0].inputParams.expression, "$$ {renamed} {older}");
    assert.equal(renamed.steps[0].inputParams.literal, "literal unchanged");
    assert.equal(renamed.steps[0].outputParams.result, "renamed.member");
    assert.equal(renamed.steps[0].ifSteps[0].inputParams.value, "$={renamed}");
    assert.equal(renamed.subPrograms[0].variables[0].key, "old"); assert.equal(renamed.subPrograms[1].variables[0].key, "old");
    assert.match(await raw(page), /9223372036854775807/);
    await page.getByRole("button", { name: "Undo document", exact: true }).click();
    assert.equal((await body(page)).variables[0].key, "old"); assert.equal((await body(page)).steps[0].inputParams["value.var"], "old");
    await page.getByRole("button", { name: "Redo document", exact: true }).click(); assert.equal((await body(page)).variables[0].key, "renamed");
    await page.getByRole("button", { name: "Child", exact: true }).click(); await variables(page);
    await nameInput(page).fill("childRenamed"); await page.getByRole("button", { name: "Save document", exact: true }).click();
    const child = await body(page); assert.equal(child.subPrograms[0].variables[0].key, "childRenamed");
    assert.equal(child.variables[0].key, "renamed"); assert.equal(child.subPrograms[1].variables[0].key, "old");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("invalid names retain draft and selection, block save, then recover; referenced deletion fails and unused deletion is undoable", { timeout: 60_000 }, async () => {
  const { page, browser, errors } = await open();
  try {
    await variables(page);
    for (const key of ["older", "quicker_in_param"]) {
      await nameInput(page).fill(key); await page.getByRole("button", { name: "Save document", exact: true }).click();
      await page.getByRole("alert").waitFor(); assert.equal(await nameInput(page).inputValue(), key);
      await page.locator('[data-variable-id="spare-id"]').click();
      assert.equal(await page.locator('[data-variable-id="old-id"]').getAttribute("class").then(value => value?.includes("selected")), true);
      assert.equal(await page.evaluate(() => (window as any).fixture.saves.length), 0);
      assert.equal((await body(page)).variables[0].key, "old");
    }
    await nameInput(page).fill("renamed"); await page.getByRole("button", { name: "Save document", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.saves.length), 1);
    await page.locator('.fixture-editor:visible').getByTitle("删除所选", { exact: true }).click();
    assert.equal((await body(page)).variables.length, 3); await page.getByRole("alert").waitFor();
    await page.locator('[data-variable-id="spare-id"]').click();
    await page.locator('.fixture-editor:visible').getByTitle("删除所选", { exact: true }).click();
    assert.equal((await body(page)).variables.length, 2);
    await page.getByRole("button", { name: "Undo document", exact: true }).click(); assert.equal((await body(page)).variables[2].key, "spare");
    await page.locator('.fixture-editor:visible').getByTitle("清除未使用变量", { exact: true }).click();
    assert.deepEqual((await body(page)).variables.map((variable: any) => variable.key), ["renamed", "older"]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("unblurred rename uses the latest Agent-edited steps and rejects a stale variable baseline without discarding input", { timeout: 60_000 }, async () => {
  const { page, browser, errors } = await open();
  try {
    await variables(page); await nameInput(page).fill("renamed");
    await page.evaluate(() => (window as any).fixture.agentNote("newer Agent note"));
    await page.getByRole("button", { name: "Save document", exact: true }).click();
    assert.equal((await body(page)).steps[0].note, "newer Agent note"); assert.equal((await body(page)).variables[0].key, "renamed");
    await nameInput(page).fill("notCommitted");
    await page.evaluate(() => { (window as any).fixture.changeSelectedVariable(); (window as any).fixture.notify(); });
    await page.getByRole("button", { name: "Save document", exact: true }).click(); await page.getByRole("alert").waitFor();
    assert.equal(await nameInput(page).inputValue(), "notCommitted"); assert.equal((await body(page)).variables[0].desc, "newer agent description");
    assert.equal((await body(page)).variables[0].key, "renamed"); assert.equal(await page.evaluate(() => (window as any).fixture.saves.length), 1);
    await page.getByRole("button", { name: "放弃修改", exact: true }).click();
    assert.equal(await nameInput(page).inputValue(), "renamed");
    assert.equal(await page.locator('.fixture-editor:visible input[title="备注"]').inputValue(), "newer agent description");
    await page.getByRole("button", { name: "Save document", exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.saves.length), 2);
    await page.locator('[data-variable-id="spare-id"]').click();
    await page.locator('.fixture-editor:visible .variable-toolbar-btn--close').click();
    await variables(page); assert.equal(await nameInput(page).inputValue(), "renamed");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("clear unused and rename fail closed for external or opaque references without file reads or writes", { timeout: 60_000 }, async () => {
  for (const options of [{ external: true }, { opaque: true }, { plainUnknown: true }]) {
    const { page, browser, errors } = await open(options);
    try {
      await variables(page); const before = await raw(page);
      await page.locator('.fixture-editor:visible').getByTitle("清除未使用变量", { exact: true }).click(); await page.getByRole("alert").waitFor();
      assert.equal(await raw(page), before);
      await nameInput(page).fill("renamed"); await page.getByRole("button", { name: "Save document", exact: true }).click();
      assert.equal(await nameInput(page).inputValue(), "renamed"); assert.equal(await raw(page), before);
      assert.equal(await page.evaluate(() => (window as any).fixture.saves.length), 0); assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
});

test("hidden drafts retain their owner and replacing the program rejects queued old blur work", { timeout: 60_000 }, async () => {
  const { page, browser, errors } = await open();
  try {
    await variables(page); await nameInput(page).fill("older");
    await page.evaluate(() => (window as any).fixture.setVisible(false));
    assert.equal((await body(page)).variables[0].key, "old");
    await page.evaluate(() => (window as any).fixture.setVisible(true)); await nameInput(page).waitFor();
    assert.equal(await nameInput(page).inputValue(), "older");
    await page.evaluate(() => {
      document.querySelector('.fixture-editor:not([hidden]) input[title="变量名"]')?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      (window as any).fixture.setReplaced(true);
    });
    await page.waitForFunction(() => (window as any).fixture.current().getState().identity.documentKey === 'owned-b');
    assert.equal(await nameInput(page).inputValue(), "old");
    assert.equal(await page.evaluate(() => JSON.parse((window as any).fixture.other.getState().content).variables[0].key), "old");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("standalone editor uses the same variable transaction and its existing undo; subprogram interface variables stay protected", { timeout: 60_000 }, async () => {
  const local = await open({ standalone: true });
  try {
    await variables(local.page); await nameInput(local.page).fill("standaloneName");
    await local.page.locator('.fixture-editor:visible .variable-toolbar-btn--close').click();
    const current = () => local.page.evaluate(() => (window as any).fixture.handles.main.getPresent());
    assert.equal((await current()).variables[0].key, "standaloneName"); assert.equal((await current()).steps[0].inputParams.value.varKey, "standaloneName");
    await local.page.locator('.fixture-editor:visible').getByTitle("撤销 (Ctrl+Z)", { exact: true }).click();
    assert.equal((await current()).variables[0].key, "old");
    assert.deepEqual(local.errors, []);
  } finally { await local.browser.close(); }
  const linked = await open({ interface: true });
  try {
    await linked.page.getByRole("button", { name: "Child", exact: true }).click(); await variables(linked.page);
    await nameInput(linked.page).fill("interfaceRename"); await linked.page.getByRole("button", { name: "Save document", exact: true }).click();
    await linked.page.getByRole("alert").waitFor(); assert.equal((await body(linked.page)).subPrograms[0].variables[0].key, "old");
    assert.equal(await nameInput(linked.page).inputValue(), "interfaceRename");
    await linked.page.getByRole("button", { name: "放弃修改", exact: true }).click();
    await linked.page.locator('.fixture-editor:visible').getByTitle("删除所选", { exact: true }).click();
    assert.equal((await body(linked.page)).subPrograms[0].variables.length, 1); assert.deepEqual(linked.errors, []);
  } finally { await linked.browser.close(); }
});

test("variable reference errors remain readable in narrow light and wide dark themes", { timeout: 60_000 }, async () => {
  const dir = path.resolve(process.cwd(), "../.tmp/variable-references"); await mkdir(dir, { recursive: true });
  for (const [width, theme] of [[420, "light"], [1100, "dark"]] as const) {
    const { page, browser, errors } = await open({ external: true }, width, theme);
    try {
      await variables(page); await nameInput(page).fill("renamed"); await page.getByRole("button", { name: "Save document", exact: true }).click();
      await page.getByRole("alert").waitFor(); await nameInput(page).focus();
      const visible = await page.getByRole("alert").evaluate(element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, width: innerWidth, top: r.top, bottom: r.bottom, height: innerHeight }; });
      assert.ok(visible.left >= 0 && visible.right <= visible.width && visible.top >= 0 && visible.bottom <= visible.height);
      await page.screenshot({ path: path.join(dir, `variable-references-${width}-${theme}.png`) }); assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
});

test("variable clipboard flushes the current draft and preserves complete native metadata through paste, save and one undo", { timeout: 60_000 }, async () => {
  const { page, browser, errors } = await open({ clipboardRich: true });
  try {
    await variables(page);
    await page.locator('.fixture-editor:visible input[title="备注"]').fill("latest unblurred description");
    // Focus and dispatch in one task: copy must consume the draft before the queued blur flusher.
    await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('.fixture-editor:not([hidden]) [data-variable-id="old-id"]')!;
      row.focus(); row.dispatchEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true, cancelable: true }));
    });
    await page.waitForFunction(() => (window as any).clipboardFixture.writes.length === 1);
    const copied = await page.evaluate(() => (window as any).clipboardFixture.text as string);
    assert.match(copied, /latest unblurred description/); assert.match(copied, /9223372036854775807/);
    await variableClipboardKey(page, "v");
    await page.waitForFunction(() => JSON.parse((window as any).fixture.read()).variables.length === 4);
    const added = (await body(page)).variables[3];
    assert.equal(added.desc, "latest unblurred description");
    assert.equal(added.inputParamInfo.isRequired, true); assert.equal(added.outputParamInfo.visibleExpression, "true");
    assert.equal(added.tableDef.fields[0].fieldKey, "column"); assert.equal(added.customType, "System.String");
    const nativeAdded = (parseLosslessJson(await raw(page)) as any).variables[3];
    for (const nested of [nativeAdded, nativeAdded.inputParamInfo, nativeAdded.outputParamInfo, nativeAdded.tableDef.fields[0]]) {
      assert.match(stringifyLosslessJson(nested), /"future":9223372036854775807/);
    }
    await page.getByRole("button", { name: "Save document", exact: true }).click();
    assert.match(await page.evaluate(() => (window as any).fixture.saves.at(-1)), /9223372036854775807/);
    await page.getByRole("button", { name: "Undo document", exact: true }).click();
    assert.equal((await body(page)).variables.length, 3); assert.equal((await body(page)).variables[0].desc, "latest unblurred description");
    await page.getByRole("button", { name: "Redo document", exact: true }).click(); assert.equal((await body(page)).variables.length, 4);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("variable clipboard allocates unique rows for multi and repeated pastes while preserving concurrent Agent steps", { timeout: 60_000 }, async () => {
  const { page, browser, errors } = await open();
  try {
    await variables(page); await page.locator('[data-variable-id="old-id"]').click();
    await page.locator('[data-variable-id="older-id"]').click({ modifiers: ["Control"] });
    await variableClipboardKey(page, "c", "older-id");
    await page.waitForFunction(() => (window as any).clipboardFixture.writes.length === 1);
    const initial = await raw(page);
    await page.evaluate(() => { (window as any).clipboardFixture.deferRead = true; });
    await variableClipboardKey(page, "v", "older-id");
    await page.waitForFunction(() => (window as any).clipboardFixture.pendingReads.length === 1);
    await page.evaluate(() => {
      const f = (window as any).fixture, c = (window as any).clipboardFixture;
      f.agentNote("Agent edited during clipboard read"); c.pendingReads[0](c.text);
    });
    await page.waitForFunction(() => JSON.parse((window as any).fixture.read()).variables.length === 5);
    assert.equal((await body(page)).steps[0].note, "Agent edited during clipboard read");
    await page.evaluate(() => { (window as any).clipboardFixture.deferRead = false; });
    await variableClipboardKey(page, "v");
    await page.waitForFunction(() => JSON.parse((window as any).fixture.read()).variables.length === 7);
    const rows = (await body(page)).variables;
    assert.equal(new Set(rows.map((v: any) => v.id)).size, 7); assert.equal(new Set(rows.map((v: any) => v.key)).size, 7);
    await page.getByRole("button", { name: "Undo document", exact: true }).click(); assert.equal((await body(page)).variables.length, 5);
    await page.getByRole("button", { name: "Undo document", exact: true }).click(); assert.equal((await body(page)).variables.length, 3);
    assert.equal((await body(page)).steps[0].note, "Agent edited during clipboard read"); assert.notEqual(await raw(page), initial);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("variable clipboard rejects invalid drafts and unsupported file defaults without writing clipboard or document", { timeout: 60_000 }, async () => {
  for (const options of [{}, { external: true }] as Record<string, boolean>[]) {
    const { page, browser, errors } = await open(options, options.external ? 420 : 1100, options.external ? "light" : "dark");
    try {
      await variables(page); const before = await raw(page);
      if (!options.external) await nameInput(page).fill("older");
      await variableClipboardKey(page, "c"); await page.getByRole("alert").waitFor();
      assert.equal(await page.evaluate(() => (window as any).clipboardFixture.writes.length), 0); assert.equal(await raw(page), before);
      if (!options.external) {
        assert.equal(await nameInput(page).inputValue(), "older");
        await page.evaluate(() => { (window as any).clipboardFixture.text = JSON.stringify([{ key: "incoming", varType: 0 }]); });
        await variableClipboardKey(page, "v"); assert.equal(await raw(page), before); assert.equal(await nameInput(page).inputValue(), "older");
      } else {
        await page.evaluate(() => { (window as any).clipboardFixture.text = JSON.stringify([{ key: "fileImport", varType: 0, "default.file": "files/foreign.txt" }]); });
        await variableClipboardKey(page, "v"); assert.equal(await raw(page), before);
      }
      const dir = path.resolve(process.cwd(), "../.tmp/variable-clipboard"); await mkdir(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, options.external ? "clipboard-420-light.png" : "clipboard-1100-dark.png") });
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
});

test("variable clipboard standalone paste uses its existing history without a second document", { timeout: 60_000 }, async () => {
  const { page, browser, errors } = await open({ standalone: true });
  try {
    await variables(page); await variableClipboardKey(page, "c");
    await page.waitForFunction(() => (window as any).clipboardFixture.writes.length === 1);
    await variableClipboardKey(page, "v");
    await page.waitForFunction(() => (window as any).fixture.handles.main.getPresent().variables.length === 4);
    assert.equal((await body(page)).variables.length, 3, "standalone does not silently switch to the fixture Session");
    await page.locator('.fixture-editor:visible').getByTitle("撤销 (Ctrl+Z)", { exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.handles.main.getPresent().variables.length), 3);
    await page.locator('.fixture-editor:visible').getByTitle("重做 (Ctrl+Y / Ctrl+Shift+Z)", { exact: true }).click();
    assert.equal(await page.evaluate(() => (window as any).fixture.handles.main.getPresent().variables.length), 4); assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("variable clipboard leaves input and contenteditable shortcuts to native text editing", { timeout: 60_000 }, async () => {
  const { page, browser, errors } = await open();
  try {
    await variables(page);
    const result = await page.evaluate(() => {
      const input = document.querySelector<HTMLElement>('.fixture-editor:not([hidden]) input[title="变量名"]')!;
      const editable = document.createElement("div"); editable.contentEditable = "true"; editable.textContent = "editable text";
      input.parentElement!.appendChild(editable);
      const prevented: boolean[] = [];
      for (const target of [input, editable]) for (const key of ["c", "v"]) {
        target.focus(); const event = new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true });
        target.dispatchEvent(event); prevented.push(event.defaultPrevented);
      }
      editable.remove(); return prevented;
    });
    assert.deepEqual(result, [false, false, false, false]);
    assert.equal(await page.evaluate(() => (window as any).clipboardFixture.reads + (window as any).clipboardFixture.writes.length), 0);
    assert.equal((await body(page)).variables.length, 3); assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("variable clipboard discards late reads after hide-show, owner replacement and a newer operation", { timeout: 60_000 }, async () => {
  const { page, browser, errors } = await open();
  try {
    await variables(page); await page.evaluate(() => { (window as any).clipboardFixture.deferRead = true; });
    await variableClipboardKey(page, "v"); await page.waitForFunction(() => (window as any).clipboardFixture.pendingReads.length === 1);
    await page.evaluate(() => (window as any).fixture.setVisible(false));
    await page.locator('.fixture-editor:visible').waitFor({ state: "hidden" });
    await page.evaluate(() => (window as any).fixture.setVisible(true)); await nameInput(page).waitFor();
    await page.evaluate(() => (window as any).clipboardFixture.pendingReads[0](JSON.stringify([{ key: "lateHidden", varType: 0 }])));
    await page.waitForTimeout(30); assert.equal((await body(page)).variables.length, 3);
    await variableClipboardKey(page, "v"); await variableClipboardKey(page, "v");
    await page.waitForFunction(() => (window as any).clipboardFixture.pendingReads.length === 3);
    await page.evaluate(() => { const c = (window as any).clipboardFixture; c.pendingReads[2](JSON.stringify([{ key: "newest", varType: 0 }])); });
    await page.waitForFunction(() => JSON.parse((window as any).fixture.read()).variables.length === 4);
    const afterNewest = await raw(page);
    await page.evaluate(() => (window as any).clipboardFixture.pendingReads[1](JSON.stringify([{ key: "olderRequest", varType: 0 }])));
    await page.waitForTimeout(30); assert.equal(await raw(page), afterNewest);
    await variableClipboardKey(page, "v"); await page.waitForFunction(() => (window as any).clipboardFixture.pendingReads.length === 4);
    await page.evaluate(() => (window as any).fixture.setReplaced(true));
    await page.waitForFunction(() => (window as any).fixture.current().getState().identity.documentKey === "owned-b");
    await page.evaluate(() => (window as any).clipboardFixture.pendingReads[3](JSON.stringify([{ key: "lateOwner", varType: 0 }])));
    await page.waitForTimeout(30); assert.equal(await raw(page), afterNewest);
    assert.equal(await page.evaluate(() => JSON.parse((window as any).fixture.other.getState().content).variables.length), 3);
    assert.equal(await nameInput(page).inputValue(), "old"); assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("variable clipboard stops a late copy fallback without stealing the new owner's focus", { timeout: 60_000 }, async () => {
  const { page, browser, errors } = await open();
  try {
    await variables(page); await page.evaluate(() => { (window as any).clipboardFixture.deferWrite = true; });
    await variableClipboardKey(page, "c"); await page.waitForFunction(() => (window as any).clipboardFixture.pendingWrites.length === 1);
    await page.evaluate(() => (window as any).fixture.setReplaced(true));
    await page.waitForFunction(() => (window as any).fixture.current().getState().identity.documentKey === "owned-b");
    await nameInput(page).focus(); await page.evaluate(() => (window as any).clipboardFixture.pendingWrites[0]());
    await page.waitForTimeout(30);
    assert.equal(await page.evaluate(() => (window as any).clipboardFixture.textWrites), 0);
    assert.equal(await nameInput(page).evaluate(element => document.activeElement === element), true);
    assert.equal(await page.locator("body > textarea").count(), 0); assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
