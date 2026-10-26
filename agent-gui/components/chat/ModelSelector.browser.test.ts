import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium, type Page } from "playwright";

// Real selector and CSS in an owned browser; every HTTP call is replaced or denied.
const fixture = `
import React,{StrictMode,useLayoutEffect,useState}from'react';
import{createRoot}from'react-dom/client';
import{ModelSelector}from'@/components/chat/ModelSelector';
import{dispatchLlmKeysUpdated}from'@/lib/llm-settings-events';
import'@/app/globals.css';
const options=[
 {kind:'profile',selection:'profile:alpha/model-a',profileId:'alpha',profileTitle:'Alpha',label:'Alpha',
  description:'First profile',modelId:'model-a',profileModels:['model-a','model-b'],configured:true,contextLimit:128000},
 {kind:'profile',selection:'profile:beta/model-c',profileId:'beta',profileTitle:'Beta',label:'Beta',
  description:'Second profile',modelId:'model-c',profileModels:['model-c','model-d'],configured:true,contextLimit:256000},
 {kind:'profile',selection:'profile:missing/model-e',profileId:'missing',profileTitle:'Missing',label:'Missing',
  description:'Needs configuration',modelId:'model-e',profileModels:['model-e'],configured:false,contextLimit:64000},
];
window.fixture={calls:[],settings:[],requests:[],options,pendingWrites:[],refresh:dispatchLlmKeysUpdated,
 addBuiltin:()=>{options.push({kind:'auto',selection:'auto',label:'Auto',description:'Test-only builtin',
  modelId:'auto-a',configured:true,contextLimit:64000,builtinGroupId:'fixture',
  endpoints:[{id:'a',baseURL:'https://a.invalid/v1',model:'auto-a',selected:true},{id:'b',baseURL:'https://b.invalid/v1',model:'auto-a',selected:false}],
  autoModels:[{id:'auto-a',modelId:'auto-a',label:'Auto A',contextLimitLabel:'64k',selected:true},{id:'auto-b',modelId:'auto-b',label:'Auto B',contextLimitLabel:'64k',selected:false}]});dispatchLlmKeysUpdated()}};
window.fetch=async(url,init)=>{
 window.fixture.requests.push({url,method:init?.method??'GET'});
 if(url==='/api/llm')return new Response(JSON.stringify({options,directOverride:false,activeSelection:options[0].selection,defaultSelection:options[0].selection}));
 if(url==='/api/settings/llm-keys/probe')return new Response(JSON.stringify({ok:true,groups:{fixture:{}}}));
 if(url==='/api/settings/llm-keys'&&init?.method==='PUT')return new Promise(resolve=>window.fixture.pendingWrites.push(status=>resolve(new Response('{}',{status}))));
 throw Error('Unexpected request: '+url);
};
const store=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)}});
function App(){const[selection,setSelection]=useState(options[0].selection);const[active,setActive]=useState(true);
 const[disabled,setDisabled]=useState(false);const[mounted,setMounted]=useState(true);
 useLayoutEffect(()=>{Object.assign(window.fixture,{setActive,setDisabled,setMounted,selection})});
 return <main style={{padding:24,display:'flex',gap:12,alignItems:'center'}}>
  <button id="before">Before</button>
  {mounted&&<ModelSelector active={active} disabled={disabled} selection={selection} persistGlobalSelection={false}
   onChange={value=>{window.fixture.calls.push(value);setSelection(value)}}
   onNeedSettings={provider=>{window.fixture.settings.push(provider??null);document.getElementById('outside').focus()}}/>}
  <button id="outside">Outside</button>
 </main>
}
createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);
`;

let compilation: ReturnType<typeof compile> | undefined;
async function compile() {
  const result = await build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, outfile: "fixture.js", format: "iife", platform: "browser", jsx: "automatic",
    tsconfig: path.join(process.cwd(), "tsconfig.json"), define: { "process.env.NODE_ENV": '"development"' } });
  return { js: result.outputFiles.find((file) => file.path.endsWith(".js"))!.text,
    css: result.outputFiles.find((file) => file.path.endsWith(".css"))!.text };
}

async function ownedFixture() {
  const compiled = await (compilation ??= compile());
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 720 } });
    page.setDefaultTimeout(5_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/*", (route) => { errors.push(`network:${route.request().url()}`); return route.abort(); });
    await page.setContent('<html data-theme="dark"><body><div id="root"></div></body></html>');
    await page.addStyleTag({ content: compiled.css });
    await page.addScriptTag({ content: compiled.js });
    await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>(".model-picker-trigger")?.disabled);
    return { browser, page, errors };
  } catch (error) { await browser.close(); throw error; }
}

const trigger = (page: Page) => page.locator(".model-picker-trigger");
const search = (page: Page) => page.getByRole("searchbox", { name: "搜索模型" });
const rows = (page: Page) => page.getByRole("listbox", { name: "模型配置", exact: true }).getByRole("option");
const detail = (page: Page) => page.locator(".model-picker-detail");
async function open(page: Page) {
  await trigger(page).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.activeElement?.classList.contains("model-picker-search"));
}
async function focused(page: Page, selector: string) {
  try {
    await page.waitForFunction((value) => document.activeElement?.matches(value), selector);
  } catch (error) {
    throw new Error(`Expected focus ${selector}; actual: ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 600))}`, { cause: error });
  }
}

test("keyboard navigation reaches a noncurrent profile and preserves selection until activation", { timeout: 45_000 }, async () => {
  const { browser, page, errors } = await ownedFixture();
  try {
    await open(page);
    await page.keyboard.press("ArrowDown");
    await focused(page, '.model-picker-item[data-selection="profile:alpha/model-a"]');
    await page.keyboard.press("ArrowDown");
    await focused(page, '.model-picker-item[data-selection="profile:beta/model-c"]');
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.calls), []);
    await page.keyboard.press("ArrowRight");
    await focused(page, '.model-picker-detail button[aria-selected="true"]');
    await search(page).hover();
    await focused(page, '.model-picker-detail button[aria-selected="true"]');
    await rows(page).first().hover();
    await focused(page, '.model-picker-detail button[aria-selected="true"]');
    assert.equal(await detail(page).getAttribute("aria-label"), "Beta 详情", "pointer movement must not discard a keyboard-focused detail");
    assert.equal(await detail(page).getByRole("option", { selected: true }).textContent(), "model-c");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => (window as any).fixture.selection === "profile:beta/model-d");
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
    await focused(page, '.model-picker-detail button[aria-selected="true"]');
    assert.equal(await page.getByRole("dialog", { name: "模型选择" }).count(), 1, "profile model selection keeps the existing flyout open");
    await page.keyboard.press("Escape");
    await focused(page, '.model-picker-item[data-selection="profile:beta/model-c"]');
    assert.equal(await detail(page).count(), 0, "first Escape leaves the detail layer");
    await page.keyboard.press("Escape");
    await focused(page, ".model-picker-trigger");
    assert.equal(await page.getByRole("dialog", { name: "模型选择" }).count(), 0);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.calls), ["profile:beta/model-d"]);

    await open(page);
    await search(page).fill("Beta");
    await page.keyboard.press("ArrowUp");
    assert.equal(await rows(page).count(), 1);
    await focused(page, '.model-picker-item[data-selection="profile:beta/model-c"]');
    await page.keyboard.press("Enter");
    await focused(page, ".model-picker-trigger");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.calls), ["profile:beta/model-d", "profile:beta/model-d"], "row activation keeps the profile's selected model");

    await open(page);
    await search(page).fill("no-match");
    await page.keyboard.press("ArrowDown");
    await focused(page, ".model-picker-search");
    assert.equal(await rows(page).count(), 0);
    await page.evaluate(() => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true, bubbles: true })));
    assert.equal(await page.getByRole("dialog", { name: "模型选择" }).count(), 1, "IME Escape must not close the picker");
    await page.keyboard.press("Escape");
    await focused(page, ".model-picker-trigger");
    assert.ok((await page.evaluate(() => (window as any).fixture.requests)).every((request: any) => request.url === "/api/llm" && request.method === "GET"));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("pending builtin switches and refreshed options keep a reachable focus owner", { timeout: 45_000 }, async () => {
  const { browser, page, errors } = await ownedFixture();
  try {
    await page.evaluate(() => (window as any).fixture.addBuiltin());
    await open(page);
    await search(page).fill("Test-only builtin");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await focused(page, '.model-picker-detail-endpoint-item[aria-selected="true"]');
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => (window as any).fixture.pendingWrites.length === 1);
    await focused(page, ".model-picker-detail");
    await page.keyboard.press("Escape");
    await focused(page, '.model-picker-item[data-selection="auto"]');
    await page.keyboard.press("Escape");
    await focused(page, ".model-picker-trigger");
    await page.locator("#outside").focus();
    await page.evaluate(() => (window as any).fixture.pendingWrites[0](500));
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
    await focused(page, "#outside");
    assert.equal(await page.getByRole("dialog", { name: "模型选择" }).count(), 0);

    await open(page);
    await search(page).fill("Test-only builtin");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await detail(page).getByRole("listbox", { name: "自动模型" }).getByRole("option").last().focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => (window as any).fixture.pendingWrites.length === 2);
    await focused(page, ".model-picker-detail");
    await page.evaluate(() => { (window as any).fixture.setActive(false); document.getElementById("outside")!.focus(); });
    await page.getByRole("dialog", { name: "模型选择" }).waitFor({ state: "detached" });
    await page.evaluate(() => (window as any).fixture.pendingWrites[1](200));
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
    await focused(page, "#outside");
    await page.evaluate(() => (window as any).fixture.setActive(true));
    await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>(".model-picker-trigger")!.disabled);
    await open(page);
    await search(page).fill("Beta");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await focused(page, '.model-picker-detail button[aria-selected="true"]');
    await page.evaluate(() => { const f=(window as any).fixture; f.options.splice(1,1); f.refresh(); });
    await focused(page, ".model-picker-search");
    await page.keyboard.press("Escape");
    await focused(page, ".model-picker-trigger");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("pointer, focus departure and hidden owners release the selector without stealing foreground focus", { timeout: 45_000 }, async () => {
  const { browser, page, errors } = await ownedFixture();
  try {
    await open(page);
    await rows(page).nth(1).hover();
    await detail(page).getByRole("option").last().click();
    await page.waitForFunction(() => (window as any).fixture.selection === "profile:beta/model-d");
    await page.keyboard.press("ArrowLeft");
    await focused(page, '.model-picker-item[data-selection="profile:beta/model-c"]');
    await page.keyboard.press("ArrowRight");
    await focused(page, '.model-picker-detail button[aria-selected="true"]');
    await page.mouse.move(900, 650);
    await page.waitForTimeout(250); // The real hover-close timer must respect keyboard focus in the detail.
    assert.equal(await detail(page).count(), 1);
    await page.locator("#outside").focus();
    await page.getByRole("dialog", { name: "模型选择" }).waitFor({ state: "detached" });
    await focused(page, "#outside");

    await open(page);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("End");
    await focused(page, '.model-picker-item[data-selection="profile:missing/model-e"]');
    await page.keyboard.press("Enter");
    await focused(page, "#outside");
    assert.equal(await page.getByRole("dialog", { name: "模型选择" }).count(), 0);
    assert.equal(await page.evaluate(() => (window as any).fixture.settings.length), 1);

    await open(page);
    await page.evaluate(() => { (window as any).fixture.setActive(false); document.getElementById("outside")!.focus(); });
    await page.waitForFunction(() => !document.querySelector(".model-picker-float") && !document.querySelector(".model-picker-detail"));
    await focused(page, "#outside");
    await page.keyboard.press("Escape");
    await focused(page, "#outside");
    await page.evaluate(() => (window as any).fixture.setActive(true));
    await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>(".model-picker-trigger")!.disabled);
    assert.equal(await page.getByRole("dialog", { name: "模型选择" }).count(), 0, "returning to the conversation must not reopen the old portal");
    await open(page);
    await page.evaluate(() => (window as any).fixture.setDisabled(true));
    await page.getByRole("dialog", { name: "模型选择" }).waitFor({ state: "detached" });
    await page.locator("#outside").focus();
    await page.evaluate(() => (window as any).fixture.setMounted(false));
    await focused(page, "#outside");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("keyboard focus remains visible in dark, light and narrow model flyouts", { timeout: 45_000 }, async () => {
  const { browser, page, errors } = await ownedFixture();
  try {
    const directory = process.env.MODEL_PICKER_SCREENSHOTS_DIR;
    if (directory) {
      const relative = path.relative(path.resolve(process.cwd(), "..", ".tmp"), directory);
      assert.ok(path.isAbsolute(directory) && !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
      await mkdir(directory, { recursive: true });
    }
    for (const width of [1024, 420]) {
      await page.setViewportSize({ width, height: 720 });
      for (const theme of ["dark", "light"]) {
        await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
        await open(page);
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowRight");
        await focused(page, '.model-picker-detail button[aria-selected="true"]');
        const visible = await page.evaluate(() => {
          const focused = document.activeElement as HTMLElement;
          const bounds = focused.getBoundingClientRect();
          const style = getComputedStyle(focused);
          const title = document.querySelector<HTMLElement>(".model-picker-detail-title")!;
          const titleBox = title.getBoundingClientRect();
          return { contained: bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight,
            unobscured: [bounds.left + 4, bounds.left + bounds.width / 2, bounds.right - 4].every((x) => focused.contains(document.elementFromPoint(x, bounds.top + bounds.height / 2)))
              && title.contains(document.elementFromPoint(titleBox.left + titleBox.width / 2, titleBox.top + titleBox.height / 2)),
            outline: style.outlineStyle, color: style.outlineColor, text: style.color };
        });
        assert.equal(visible.contained, true);
        assert.equal(visible.unobscured, true, "the title and focused model must be above the primary menu");
        assert.equal(visible.outline, "solid");
        assert.equal(visible.color, visible.text, "focus uses the same theme contrast as the text");
        if (directory) await page.screenshot({ path: path.join(directory, `model-picker-${width}-${theme}.png`) });
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
      }
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
