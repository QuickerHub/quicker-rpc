import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium, type Page } from "playwright";
import type { QuickerNativeMcpSettingsState } from "../../lib/quicker-native-mcp-settings";

// The actual popup, panel and native section run together. Only unrelated settings modules are fixtures.
const fixture = `
import React,{StrictMode,useLayoutEffect,useState}from'react';import{createRoot}from'react-dom/client';
import{AppSettingsPopup}from'@/components/chat/AppSettingsPopup';import'@/app/globals.css';
window.fixture={requests:[]};
window.fetch=(url,init)=>{
 if(!String(url).startsWith('/api/settings/quicker-native-mcp?'))throw Error('Unexpected request '+url);
 return new Promise((resolve,reject)=>{window.fixture.requests.push({url,method:init?.method??'GET',body:init?.body?JSON.parse(init.body):null,
 signal:init?.signal,resolve:(data,status=200)=>resolve(new Response(JSON.stringify(data),{status})),reject});});
};
function App(){const[cwd,setCwd]=useState('C:/fixture/alpha');const[open,setOpen]=useState(true);
 useLayoutEffect(()=>{Object.assign(window.fixture,{setCwd,setOpen})});
 return <main><button id="outside" onClick={()=>setOpen(true)}>打开设置</button><AppSettingsPopup cwd={cwd} open={open} onClose={()=>setOpen(false)}
 ping={{status:'ok',data:{ok:true}}} onRefreshPing={()=>{}}/></main>;
}
createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);
`;
let compilation: ReturnType<typeof compile> | undefined;
async function compile() {
  const result = await build({ stdin: { contents: fixture, loader: "tsx", resolveDir: process.cwd() }, bundle: true,
    write: false, outfile: "fixture.js", format: "iife", platform: "browser", jsx: "automatic",
    tsconfig: path.join(process.cwd(), "tsconfig.json"), define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "unrelated-settings", setup(build) {
      build.onResolve({ filter: /\/(AccountUsageSection|AppVersionSection|LlmKeysSettingsSection|LauncherSettingsSection|ThemeToggle|use-app-versions)$/ }, args => ({ path: args.path, namespace: "settings-fixture" }));
      build.onLoad({ filter: /.*/, namespace: "settings-fixture" }, args => {
        const name = args.path.split("/").at(-1)!;
        return { contents: name === "use-app-versions" ? 'export const useAppVersionSnapshot=()=>({snapshot:{runtime:"dev"}});'
          : `export const ${name}=()=>null;`, loader: "js" };
      });
    } }],
  });
  return { js: result.outputFiles.find(file => file.path.endsWith(".js"))!.text, css: result.outputFiles.find(file => file.path.endsWith(".css"))!.text };
}
async function ownedFixture() {
  const compiled = await (compilation ??= compile());
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 900 } });
    page.setDefaultTimeout(5000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/*", route => { errors.push(`network:${route.request().url()}`); return route.abort(); });
    await page.setContent('<html data-theme="dark"><body><div id="root"></div></body></html>');
    await page.addStyleTag({ content: compiled.css }); await page.addScriptTag({ content: compiled.js });
    await page.waitForFunction(() => (window as any).fixture.requests.length > 0);
    return { browser, page, errors };
  } catch (error) { await browser.close(); throw error; }
}
function state(cwd = "C:/fixture/alpha", overrides: Partial<QuickerNativeMcpSettingsState> = {}): QuickerNativeMcpSettingsState {
  return { cwd, revision: `revision:${cwd}`, userEnabled: false, userManaged: false,
    effective: { enabled: false, scope: "none", managed: false, blocked: false },
    discovery: { status: "found", identity: `source:${cwd}` }, observedAt: "2026-10-26T12:00:00Z", ...overrides };
}
const section = (page: Page) => page.getByRole("region", { name: "原生 MCP 连接" });
const toggle = (page: Page) => page.getByRole("switch", { name: "使用原生 MCP" });
async function latest(page: Page) { return page.evaluate(() => (window as any).fixture.requests.length - 1); }
async function settle(page: Page, index: number, data: unknown, status = 200) {
  await page.evaluate(({ index, data, status }) => (window as any).fixture.requests[index].resolve(data, status), { index, data, status });
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
}
async function initial(page: Page, value = state()) { await settle(page, await latest(page), { ok: true, state: value }); }
async function currentBody(page: Page) { return page.evaluate(() => (window as any).fixture.requests.at(-1).body); }

test("existing connection settings load without enabling; explicit detection and keyboard switch stay independent", { timeout: 45000 }, async () => {
  const { browser, page, errors } = await ownedFixture();
  try {
    assert.equal(await toggle(page).getAttribute("aria-checked"), "false");
    assert.equal(await toggle(page).getAttribute("aria-disabled"), "true");
    await initial(page);
    assert.match(await section(page).innerText(), /已发现本机原生 MCP/);
    assert.ok((await page.evaluate(() => (window as any).fixture.requests)).every((request: any) => request.method === "GET"));
    await section(page).getByRole("button", { name: "检测本机服务", exact: true }).click();
    assert.deepEqual(await currentBody(page), { action: "probe", cwd: "C:/fixture/alpha", revision: "revision:C:/fixture/alpha" });
    await settle(page, await latest(page), { ok: true, state: state(), probe: { status: "ok", sourceIdentity: "source:C:/fixture/alpha",
      serverInfo: { name: "Quicker fixture", version: "reported-version" }, toolCount: 47, checkedAt: "2026-10-26T12:01:00Z" } });
    assert.match(await section(page).innerText(), /本次检测成功.*2026-10-26T12:01:00Z/);
    assert.match(await section(page).innerText(), /reported-version/);
    assert.equal(await toggle(page).getAttribute("aria-checked"), "false", "Detection never enables a source");
    await toggle(page).focus(); await page.keyboard.press("Space");
    assert.deepEqual(await currentBody(page), { action: "set-enabled", cwd: "C:/fixture/alpha", revision: "revision:C:/fixture/alpha", enabled: true });
    assert.equal(await toggle(page).getAttribute("aria-checked"), "false", "Do not optimistically report an unconfirmed setting");
    await settle(page, await latest(page), { ok: true, state: state(undefined, { userEnabled: true, userManaged: true, revision: "saved",
      effective: { enabled: true, scope: "user", managed: true, blocked: false } }) });
    assert.equal(await toggle(page).getAttribute("aria-checked"), "true");
    assert.equal(await toggle(page).evaluate(el => el === document.activeElement), true);
    assert.doesNotMatch(await section(page).innerText(), /本次检测成功/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("workspace and unmanaged overrides block changes while failures retain the actual returned state", { timeout: 45000 }, async () => {
  const { browser, page, errors } = await ownedFixture();
  try {
    await initial(page, state(undefined, { userEnabled: true, userManaged: true,
      effective: { enabled: false, scope: "workspace", managed: false, blocked: true, message: "工作区同名配置优先，请在工作区配置中调整。" } }));
    assert.equal(await toggle(page).getAttribute("aria-disabled"), "true");
    assert.match(await section(page).innerText(), /当前工作区未启用.*工作区配置/);
    const count = await latest(page); await toggle(page).focus(); await page.keyboard.press("Space");
    assert.equal(await latest(page), count);
    await section(page).getByRole("button", { name: "刷新配置" }).click();
    await initial(page, state(undefined, { effective: { enabled: false, scope: "user", managed: false, blocked: true, message: "quicker-local 由其他来源管理。" } }));
    assert.match(await section(page).innerText(), /其他来源管理/);
    await section(page).getByRole("button", { name: "刷新配置" }).click(); await initial(page);
    await toggle(page).click();
    const actual = state(undefined, { revision: "conflict", effective: { enabled: false, scope: "workspace", managed: false, blocked: true, message: "工作区配置已改变。" } });
    await settle(page, await latest(page), { ok: false, state: actual, error: { code: "CONFLICT", message: "配置发生变化，请重新核对。" } }, 409);
    assert.match(await section(page).getByRole("alert").innerText(), /配置发生变化/);
    assert.equal(await toggle(page).getAttribute("aria-disabled"), "true");
    assert.equal(await toggle(page).getAttribute("aria-checked"), "false");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("late saves, probes, hidden tabs and repeated reads cannot replace another workspace or a newer failure", { timeout: 45000 }, async () => {
  const { browser, page, errors } = await ownedFixture();
  try {
    await initial(page); await toggle(page).click(); const saving = await latest(page);
    await page.evaluate(() => (window as any).fixture.setCwd("C:/fixture/beta"));
    await page.waitForFunction(index => (window as any).fixture.requests.length - 1 > index, saving);
    await initial(page, state("C:/fixture/beta"));
    await settle(page, saving, { ok: true, state: state(undefined, { userEnabled: true }) });
    assert.equal(await toggle(page).getAttribute("aria-checked"), "false");
    assert.equal(await page.evaluate(index => (window as any).fixture.requests[index].signal.aborted, saving), true);
    await section(page).getByRole("button", { name: "检测本机服务" }).click(); const probing = await latest(page);
    await page.getByRole("tab", { name: "模型", exact: true }).click();
    await settle(page, probing, { ok: true, state: state("C:/fixture/beta"), probe: { status: "ok", sourceIdentity: "source:C:/fixture/beta", checkedAt: "obsolete" } });
    await page.getByRole("tab", { name: "通用", exact: true }).click();
    await page.waitForFunction(index => (window as any).fixture.requests.length - 1 > index, probing);
    await initial(page, state("C:/fixture/beta"));
    assert.doesNotMatch(await section(page).innerText(), /obsolete|本次检测成功/);
    await section(page).getByRole("button", { name: "刷新配置" }).click(); const older = await latest(page);
    await section(page).getByRole("button", { name: "刷新配置" }).click(); const newer = await latest(page);
    await settle(page, newer, { ok: false, error: { code: "READ_FAILED", message: "本次读取失败" } }, 503);
    await settle(page, older, { ok: true, state: state("C:/fixture/beta", { userEnabled: true }) });
    assert.match(await section(page).getByRole("alert").innerText(), /本次读取失败/);
    assert.equal(await toggle(page).getAttribute("aria-checked"), "false");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("even a current response cannot redirect settings or later POSTs to a foreign workspace", { timeout: 45000 }, async () => {
  const { browser, page, errors } = await ownedFixture();
  try {
    await initial(page, state("C:/fixture/foreign", { userEnabled: true }));
    assert.match(await section(page).getByRole("alert").innerText(), /不属于当前工作区/);
    assert.equal(await toggle(page).getAttribute("aria-disabled"), "true");
    assert.equal(await toggle(page).getAttribute("aria-checked"), "false");
    const count = await latest(page); await toggle(page).focus(); await page.keyboard.press("Space");
    assert.equal(await latest(page), count);
    await section(page).getByRole("button", { name: "刷新配置" }).click(); await initial(page);
    await toggle(page).click();
    assert.equal((await currentBody(page)).cwd, "C:/fixture/alpha");
    await settle(page, await latest(page), { ok: false, state: state("C:/fixture/foreign"), error: { code: "CONFLICT", message: "Wrong owner" } }, 409);
    assert.match(await section(page).getByRole("alert").innerText(), /不属于当前工作区/);
    assert.equal(await toggle(page).getAttribute("aria-disabled"), "true");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("cancel, close and changed source invalidate detection without hiding authorization failures", { timeout: 45000 }, async () => {
  const { browser, page, errors } = await ownedFixture();
  try {
    await initial(page); await section(page).getByRole("button", { name: "检测本机服务" }).click(); const cancelled = await latest(page);
    await section(page).getByRole("button", { name: "取消检测" }).click();
    await settle(page, cancelled, { ok: true, state: state(), probe: { status: "ok", sourceIdentity: "source:C:/fixture/alpha", checkedAt: "cancelled" } });
    assert.match(await section(page).getByRole("alert").innerText(), /检测已取消/);
    await section(page).getByRole("button", { name: "检测本机服务" }).click();
    await settle(page, await latest(page), { ok: true, state: state(), probe: { status: "unauthorized", checkedAt: "2026-10-26T12:02:00Z", message: "请在 Quicker 检查本机授权。" } });
    assert.match(await section(page).getByRole("alert").innerText(), /鉴权失败/);
    await section(page).getByRole("button", { name: "检测本机服务" }).click();
    await settle(page, await latest(page), { ok: true, state: state(undefined, { discovery: { status: "found", identity: "new-owner" } }),
      probe: { status: "ok", sourceIdentity: "source:C:/fixture/alpha", checkedAt: "old-owner" } });
    assert.match(await section(page).getByRole("alert").innerText(), /来源不一致/);
    await section(page).getByRole("button", { name: "检测本机服务" }).click(); const closing = await latest(page);
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await settle(page, closing, { ok: true, state: state(), probe: { status: "ok", sourceIdentity: "source:C:/fixture/alpha", checkedAt: "closed" } });
    await page.getByRole("button", { name: "打开设置" }).click(); await initial(page);
    assert.doesNotMatch(await section(page).innerText(), /closed|本次检测成功/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("native connection controls remain readable and keyboard reachable in dark/light narrow settings", { timeout: 45000 }, async () => {
  const { browser, page, errors } = await ownedFixture();
  try {
    await initial(page, state(undefined, { discovery: { status: "missing", identity: null, message: "未找到本机配置。请在这台电脑的 Quicker 中开启原生 MCP 后刷新配置。" } }));
    const directory = process.env.NATIVE_MCP_SETTINGS_SCREENSHOTS_DIR;
    if (directory) await mkdir(directory, { recursive: true });
    for (const width of [1024, 420]) for (const theme of ["dark", "light"]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      await toggle(page).focus();
      assert.equal(await toggle(page).evaluate(el => el === document.activeElement), true);
      const visible = await section(page).evaluate(el => {
        const r = el.getBoundingClientRect();
        return { fits: r.left >= 0 && r.right <= innerWidth && el.scrollWidth <= el.clientWidth,
          front: el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) };
      });
      assert.deepEqual(visible, { fits: true, front: true });
      if (directory) await page.screenshot({ path: path.join(directory, `native-mcp-settings-${width}-${theme}.png`) });
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
