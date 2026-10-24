import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";
// Extend the existing explicit local DOM check without changing the shared CI scripts.
import "../../../components/action-editor/ActionResourceInsertion.browser.test";
import "../steps/paramEditors/ColorTextTool.browser.test";
import "../steps/paramEditors/ErrorMessageOutput.browser.test";
import "../steps/paramEditors/StepEditorParamSection.browser.test";

// Exercise the production editor, variable form, history hook and registry.
// Step edits and resource leaves are isolated from catalogs and real hosts.
const fixture = `
import React, { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import XProgramEditor from "@/lib/action-editor/program/XProgramEditor";
import { ActiveXProgramBridgeProvider, useActiveXProgramBridge } from "@/lib/action-editor/program/activeXProgramBridge";
import { assembleActionProgramSnapshot } from "@/lib/action-editor/program/assembleActionProgramSnapshot";
import { fingerprintXProgramPresent } from "@/lib/action-editor/program/xProgramHistory";
import { ActionStep, ActionSubProgram, ActionVariable } from "@/lib/action-editor/types/common";
const body = (id) => ({ steps: [ActionStep.fromPartial({ stepId:id, stepRunnerKey:'fixture:'+id })], variables:[Object.assign(ActionVariable.fromPartial({id:'var-'+id,key:'var_'+id}), {defaultValueFile:'files/default.txt'})] });
const main = body('main'), child = body('child'), other = body('other');
const payload = { ...main, subPrograms:[ActionSubProgram.fromPartial({ id:'child', name:'child', ...child })] };
window.fixture = { reports:[], immediate:[] };
function Workspace({ name }) {
 const bridge = useActiveXProgramBridge();
 const [active, setActive] = useState('main');
 const [mounted, setMounted] = useState(true);
 const report = useCallback((present, meta) => { window.fixture.reports.push({ name, note:present.steps[0]?.note, dirty:meta.dirty }); }, [name]);
 useEffect(() => {
   window.fixture[name] = { bridge, setActive, setMounted, read:() => bridge.getEditorForSurface('main')?.getPresent(),
     snapshot:() => assembleActionProgramSnapshot({ payload, getEditorForSurface:bridge.getEditorForSurface }) };
   if (name==='a') window.fixture.readImmediate = () => bridge.getEditorForSurface(active)?.getPresent();
 }, [bridge, name, active]);
 const initial = name==='a' ? main : other;
 return <section data-workspace={name} data-active={active}>
   <button onClick={() => setActive(active==='main'?'sub-child':'main')}>switch</button>
   {mounted && <div hidden={active!=='main'}><XProgramEditor initialPresent={initial} baselineFingerprint={fingerprintXProgramPresent(initial)} editorTabId="main" active={active==='main'} onPresentChange={report}/></div>}
   {name==='a' && <div hidden={active!=='sub-child'}><XProgramEditor initialPresent={child} baselineFingerprint={fingerprintXProgramPresent(child)} editorTabId="sub-child" active={active==='sub-child'}/></div>}
 </section>;
}
const root = createRoot(document.getElementById('root'));
root.render(<StrictMode><ActiveXProgramBridgeProvider><Workspace name="a"/></ActiveXProgramBridgeProvider><ActiveXProgramBridgeProvider><Workspace name="b"/></ActiveXProgramBridgeProvider></StrictMode>);
`;

async function compileEditorFixture() {
  return build({
    stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    tsconfig: path.join(process.cwd(), "tsconfig.json"),
    plugins: [{ name: "offline-editor-leaves", setup(builder) {
      builder.onResolve({ filter: /(^@\/lib\/action-editor\/(steps\/StepListEditor|steps\/useStepParamFileContents)$|shared\/IconControl$)/ }, (args) => ({ path: args.path, namespace: "fixture-leaf" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture-leaf" }, (args) => {
        if (args.path.endsWith("useStepParamFileContents")) return { contents: "export function useStepParamFileContents(){return {}}", loader: "js" };
        if (args.path.endsWith("IconControl")) return { contents: "export function IconControl(){return null}", loader: "js" };
        return { contents: `import React from 'react'; export default function StepListEditor(p){return <div>
          <button data-edit onClick={()=>p.onCommitSteps(rows=>rows.map(row=>({...row,note:row.note+'x'})))}>edit</button>
          <button data-batch onClick={()=>{p.onCommitSteps(rows=>rows.map(row=>({...row,note:row.note+'A'})));p.onCommitSteps(rows=>rows.map(row=>({...row,note:row.note+'B'})));window.fixture.immediate.push(window.fixture.readImmediate().steps[0].note)}}>batch</button>
          <output data-note>{p.steps[0]?.note}</output></div>}`, loader: "jsx", resolveDir: process.cwd() };
      });
    } }],
  });
}

test("live editor snapshots every dirty edit, reads same-event writes, isolates workspaces and inactive shortcuts", { timeout: 45_000 }, async () => {
  const compiled = await compileEditorFixture();
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", (route) => route.abort());
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: compiled.outputFiles[0].text });
    await page.waitForFunction(() => Boolean((window as any).fixture?.a?.read()));
    const mainEdit = page.locator('[data-workspace="a"] [data-edit]:visible');
    await mainEdit.click();
    await mainEdit.click();
    const afterTwo = await page.evaluate(() => {
      const f = (window as any).fixture;
      return { live:f.a.read().steps[0].note, reports:f.reports.filter((r: any) => r.name==='a' && r.dirty).map((r: any) => r.note), other:f.b.read().steps[0].note };
    });
    assert.equal(afterTwo.live, "xx");
    assert.deepEqual(afterTwo.reports, ["x", "xx"]);
    assert.equal(afterTwo.other, "");
    await page.locator('[data-workspace="a"] [data-batch]:visible').click();
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.immediate), ["xxAB"]);

    await page.locator('[data-workspace="a"] > button').click();
    await page.locator('[data-workspace="a"] [data-edit]:visible').click();
    await page.keyboard.press("Control+z");
    const afterUndo = await page.evaluate(() => (window as any).fixture.a.snapshot());
    assert.equal(afterUndo.steps[0].note, "xxAB");
    assert.equal(afterUndo.subPrograms[0].steps[0].note, "");

    const immediate = await page.evaluate(() => {
      const f = (window as any).fixture;
      const editor = f.a.bridge.getEditorForSurface("main");
      const next = editor.getPresent();
      next.steps[0].note = "external";
      editor.applyProgram(next);
      const live = editor.getPresent();
      live.steps[0].note = "caller-only";
      return editor.getPresent().steps[0].note;
    });
    assert.equal(immediate, "external");
    await page.evaluate(() => (window as any).fixture.a.setActive("source"));
    await page.waitForFunction(() => document.querySelector('[data-workspace="a"]')?.getAttribute("data-active") === "source");
    await page.keyboard.press("Control+z");
    assert.equal(await page.evaluate(() => (window as any).fixture.a.read().steps[0].note), "external");
    await page.locator('[data-workspace="a"] > button').click();
    await mainEdit.focus();
    await page.keyboard.press("Control+z");
    assert.equal(await page.evaluate(() => (window as any).fixture.a.read().steps[0].note), "xxAB");
    const reset = await page.evaluate(() => {
      const f = (window as any).fixture;
      const editor = f.a.bridge.getEditorForSurface("main");
      const next = editor.getPresent();
      next.steps[0].note = "new-baseline";
      editor.applyProgram(next, { recordUndo:false });
      return editor.getPresent().steps[0].note;
    });
    assert.equal(reset, "new-baseline");
    await page.keyboard.press("Control+z");
    assert.equal(await page.evaluate(() => (window as any).fixture.a.read().steps[0].note), "new-baseline");
    const replacementSurvived = await page.evaluate(() => {
      const bridge = (window as any).fixture.a.bridge;
      const oldOwner = bridge.getEditorForSurface("main");
      const newOwner = { ...oldOwner };
      bridge.registerEditor("replacement-fixture", oldOwner);
      bridge.registerEditor("replacement-fixture", newOwner);
      bridge.unregisterEditor("replacement-fixture", oldOwner);
      const survived = bridge.getEditorForSurface("replacement-fixture") === newOwner;
      bridge.unregisterEditor("replacement-fixture", newOwner);
      return survived && bridge.getEditorForSurface("replacement-fixture") == null;
    });
    assert.equal(replacementSurvived, true);

    // A keyboard/programmatic tab switch has no outside pointer event to close the portal.
    await page.getByRole("button", { name: "打开变量面板", exact: true }).first().click();
    const variableInput = page.locator('[data-workspace="a"] input[title="变量名"]');
    await variableInput.fill("edited-variable");
    await page.locator('[data-workspace="a"] .variable-form-type-picker-trigger').click();
    await page.waitForSelector(".variable-form-type-picker-popup--portal");
    await page.evaluate(() => (window as any).fixture.a.setActive("source"));
    await page.waitForFunction(() => document.querySelector('[data-workspace="a"]')?.getAttribute("data-active") === "source");
    assert.equal(await page.locator(".variable-form-type-picker-popup--portal").count(), 0);
    await page.waitForFunction(() => (window as any).fixture.a.read().variables[0].key === "edited-variable");
    assert.equal(await page.evaluate(() => (window as any).fixture.a.read().variables[0].defaultValueFile), "files/default.txt");
    await page.keyboard.press("Escape");
    await page.locator('[data-workspace="a"] > button').click();
    assert.equal(await variableInput.inputValue(), "edited-variable");
    assert.equal(await page.locator('[data-workspace="a"] .variable-row.selected').getAttribute("data-variable-id"), "var-main");
    assert.equal(await page.locator(".variable-form-type-picker-popup--portal").count(), 0);
    await page.locator('[data-workspace="a"] [data-edit]:visible').focus();
    await page.keyboard.press("Control+z");
    assert.equal(await page.evaluate(() => (window as any).fixture.a.read().variables[0].key), "var_main");
    await page.evaluate(() => (window as any).fixture.a.setMounted(false));
    await page.waitForFunction(() => (window as any).fixture.a.read() == null);
    assert.equal(await page.evaluate(() => (window as any).fixture.b.read().steps[0].stepId), "other");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("two workspaces with undo history route shortcuts to the focused editor or its owned portal only", { timeout: 45_000 }, async () => {
  const compiled = await compileEditorFixture();
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", (route) => route.abort());
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: compiled.outputFiles[0].text });
    await page.waitForFunction(() => (window as any).fixture?.a?.read && (window as any).fixture?.b?.read);
    const aEdit = page.locator('[data-workspace="a"] [data-edit]:visible');
    const bEdit = page.locator('[data-workspace="b"] [data-edit]:visible');
    const read = () => page.evaluate(() => {
      const f = (window as any).fixture;
      return { a: f.a.read().steps[0].note, b: f.b.read().steps[0].note, child: f.a.bridge.getEditorForSurface("sub-child").getPresent().steps[0].note };
    });
    await aEdit.click();
    await bEdit.click();
    assert.deepEqual(await read(), { a: "x", b: "x", child: "" });
    await page.keyboard.press("Control+z");
    assert.deepEqual(await read(), { a: "x", b: "", child: "" });
    await page.keyboard.press("Control+y");
    assert.deepEqual(await read(), { a: "x", b: "x", child: "" });

    await page.locator('[data-workspace="a"] > button').click();
    await aEdit.click();
    await page.keyboard.press("Control+z");
    assert.deepEqual(await read(), { a: "x", b: "x", child: "" });
    // The main editor still has undo history, but is inactive while its child has focus.
    await page.keyboard.press("Control+z");
    assert.deepEqual(await read(), { a: "x", b: "x", child: "" });
    await page.locator('[data-workspace="a"] > button').click();

    // Portal focus carries the token emitted by the owning production XProgramEditor.
    await page.evaluate(() => {
      const owner = document.querySelector('[data-workspace="b"] .x-program-editor')!.getAttribute("data-program-keyboard-owner")!;
      const portal = document.createElement("div");
      portal.id = "owned-portal-fixture";
      portal.setAttribute("data-program-keyboard-owner", owner);
      portal.innerHTML = '<button>portal focus</button><input class="x-program-history-isolate" />';
      document.body.append(portal);
    });
    await page.locator("#owned-portal-fixture button").focus();
    await page.keyboard.press("Control+z");
    assert.deepEqual(await read(), { a: "x", b: "", child: "" });
    await page.keyboard.press("Control+Shift+z");
    assert.deepEqual(await read(), { a: "x", b: "x", child: "" });
    await page.locator("#owned-portal-fixture input").focus();
    await page.keyboard.press("Control+z");
    assert.deepEqual(await read(), { a: "x", b: "", child: "" });
    await page.keyboard.press("Control+y");
    assert.deepEqual(await read(), { a: "x", b: "x", child: "" });
    await page.evaluate(() => {
      document.getElementById("owned-portal-fixture")?.remove();
      const unrelated = document.createElement("input");
      unrelated.id = "unowned-history-field";
      unrelated.className = "x-program-history-isolate";
      document.body.append(unrelated);
    });
    await page.locator("#unowned-history-field").focus();
    await page.keyboard.press("Control+z");
    assert.deepEqual(await read(), { a: "x", b: "x", child: "" });
    await page.evaluate(() => {
      (window as any).fixture.a.setActive("source");
      (window as any).fixture.b.setActive("source");
      document.getElementById("unowned-history-field")?.remove();
    });
    await page.waitForFunction(() => document.querySelectorAll('[data-workspace][data-active="source"]').length === 2);
    await page.keyboard.press("Control+z");
    assert.deepEqual(await read(), { a: "x", b: "x", child: "" });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
