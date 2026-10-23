import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { buildStaticRuntime } from "../scripts/build-static-runtime.mjs";
import { verifyStaticRuntime } from "../scripts/verify-static-runtime.mjs";

test("relocated static renderer + production Node API preserve chat, settings, history, workspace and Designer ports", { timeout: 240_000 }, async () => {
  const parent = resolve("../.tmp");
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, "static-runtime-integration-"));
  console.log(`Static runtime evidence: ${root}`);
  const built = join(root, "built-app");
  await buildStaticRuntime({ outputDirectory: built, development: true });
  const app = join(root, "relocated-app");
  renameSync(built, app);
  assert.equal((await verifyStaticRuntime(app)).ok, true);
  const requests: string[] = [];
  const fixture = createServer(async (req, res) => {
    requests.push(req.url!);
    res.setHeader("content-type", "application/json");
    if (req.url === "/health") return res.end(JSON.stringify({ ok: true, version: "offline", capabilities: {} }));
    let body = "";
    for await (const chunk of req) body += chunk;
    if (req.url === "/v1/invoke") {
      const { op } = JSON.parse(body);
      const data = op === "designer.context" ? { ok: true, designers: [{ entityId: "offline-action", title: "Fixture Designer", selectedSteps: [] }] } : { items: [], actions: [], subprograms: [], summaries: [] };
      return res.end(JSON.stringify({ ok: true, data }));
    }
    if (req.url === "/v1/chat/completions") {
      const request = JSON.parse(body);
      assert.equal(request.model, "offline-model");
      res.setHeader("content-type", "text/event-stream");
      const chunk = (delta: object, reason: string | null = null) => ({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "offline-model", choices: [{ index: 0, delta, finish_reason: reason }] });
      res.write(`data: ${JSON.stringify(chunk({ role: "assistant", content: "Static service answer" }))}\n\n`);
      res.end(`data: ${JSON.stringify(chunk({}, "stop"))}\n\ndata: [DONE]\n\n`);
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Unknown fixture endpoint" }));
  });
  await new Promise<void>((done) => fixture.listen(0, "127.0.0.1", done));
  const address = fixture.address();
  assert.ok(address && typeof address !== "string");
  const fakeOrigin = `http://127.0.0.1:${address.port}`;
  const profile = join(root, "profile");
  const workspace = join(root, "workspace");
  mkdirSync(workspace, { recursive: true });
  writeFileSync(join(workspace, "hello.txt"), "workspace fixture");
  const actionPath = ".quicker/actions/11111111-1111-4111-8111-111111111111";
  const actionDirectory = join(workspace, actionPath);
  mkdirSync(actionDirectory, { recursive: true });
  const originalBody = '{"steps":[{"stepId":"fixture","stepRunnerKey":"sys:fixture","note":"before","futureDecimal":0.123456789012345678901}],"variables":[],"subPrograms":[],"futureInt":9007199254740993}';
  const originalInfo = '{"kind":"action","id":"11111111-1111-4111-8111-111111111111","title":"Original title","description":"","icon":"","editVersion":9223372036854775807,"futureInt":9007199254740993}';
  writeFileSync(join(actionDirectory, "data.json"), originalBody);
  writeFileSync(join(actionDirectory, "info.json"), originalInfo);
  const guard = join(root, "network-guard.mjs");
  writeFileSync(guard, `const fetchOriginal=globalThis.fetch; globalThis.fetch=(input,options)=>{ const url=new URL(typeof input==='string'||input instanceof URL?input:input.url); if(url.hostname!=='127.0.0.1'||![${address.port},Number(process.env.PORT),Number(process.env.QUICKER_BROWSER_PORT),Number(process.env.QUICKER_TERMINAL_PORT)].includes(Number(url.port))) throw new Error('Unexpected outbound request: '+url.origin); return fetchOriginal(input,options); };`);
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["SystemRoot", "SystemDrive", "ComSpec", "PATH", "PATHEXT", "TEMP", "TMP"]) env[key] = process.env[key];
  Object.assign(env, {
    APPDATA: join(root, "roaming"), LOCALAPPDATA: join(root, "local"), USERPROFILE: join(root, "home"), HOME: join(root, "home"), XDG_DATA_HOME: join(root, "xdg"),
    QUICKER_AGENT_DATA_DIR: profile, AGENT_GUI_DEFAULT_CWD: workspace,
    LLM_CONFIG_PATH: join(root, "absent-config.json"), BUNDLED_LLM_CONFIG: "{}", BUNDLED_LLM_REMOTE_CONFIG_DISABLED: "1",
    QKRPC_HTTP_URL: fakeOrigin, QKRPC_TRANSPORT: "http", AGENT_GUI_BUNDLED: "1", NODE_ENV: "development",
    AGENT_GUI_SKIP_BROWSER_RUNTIME: "0", AGENT_GUI_SKIP_TERMINAL_RUNTIME: "0",
  });
  const child = spawn(process.execPath, ["--import", pathToFileURL(guard).href, join(app, "service.mjs"), "--port", "0"], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  const exited = once(child, "exit");
  let stderr = "";
  child.stderr!.on("data", (data) => { stderr += data; });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const runtimeOrigins: string[] = [];
  let verification: unknown;
  try {
    const origin = await new Promise<string>((done, fail) => {
      let output = "";
      const timer = setTimeout(() => fail(Error("Static service startup timed out: " + stderr)), 10_000);
      child.once("exit", () => { clearTimeout(timer); fail(Error("Service exited: " + stderr)); });
      child.once("error", fail);
      child.stdout!.on("data", (data) => {
        output += data;
        for (const line of output.split(/\r?\n/)) {
          try { const item = JSON.parse(line); if (item.event === "agent-service-ready") { clearTimeout(timer); done(item.origin); } } catch { /* Partial line. */ }
        }
      });
    });
    const json = async (path: string, options?: RequestInit) => {
      const response = await fetch(origin + path, options);
      const result = await response.json();
      assert.equal(response.ok, true, `${path}: ${JSON.stringify(result)}`);
      return result;
    };
    const put = (value: object) => ({ method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
    assert.equal((await json("/health")).runtime, "lazy");
    assert.equal(existsSync(profile), false);
    const store = { version: 3, activeThreadId: "fixture-thread", activeWorkspaceId: "fixture-workspace", workspaces: [{ id: "fixture-workspace", label: "Fixture", rootPath: workspace }], threads: [{ id: "fixture-thread", title: "Fixture history", updatedAt: 1, workingDirectory: workspace, messages: [{ id: "message", role: "user", parts: [{ type: "text", text: "Preserved message" }] }] }], openTabIds: ["fixture-thread"], workingDirectory: workspace };
    await json("/api/chat-store", put(store));
    assert.equal((await json("/api/chat-store?scope=all")).store.threads[0].title, "Fixture history");
    assert.equal((await json("/api/chat-store/threads/fixture-thread/messages")).messages[0].parts[0].text, "Preserved message");
    assert.equal((await json("/api/settings/default-cwd")).cwd, workspace);
    const settings = await json("/api/settings/llm-keys", put({ createProfile: { title: "Offline endpoint", apiKey: "fixture-only", baseURL: fakeOrigin + "/v1", models: ["offline-model"] } }));
    const selection = `profile:${settings.profiles[0].id}/offline-model`;
    await json("/api/settings/llm-keys", put({ activeSelection: selection }));
    assert.equal((await json("/api/settings/llm-keys")).activeSelection, selection);
    assert.ok((await json("/api/llm")).options.length > 0);
    const definitions = await json(`/api/agent-defs?cwd=${encodeURIComponent(workspace)}`);
    assert.ok(definitions.skills.some((item: { name: string }) => item.name === "quicker-authoring"));
    assert.equal((await json("/api/docs/program-source")).success, true);
    assert.equal((await json(`/api/workspace?op=read&path=hello.txt&cwd=${encodeURIComponent(workspace)}`)).content, "workspace fixture");
    const documentRequest = { op: "save-program-document", cwd: workspace, path: `${actionPath}/data.json`, expectedProjectBinding: null,
      expectedContent: originalBody, content: originalBody.replace('"note":"before"', '"note":"after"'),
      metadata: { expectedContent: originalInfo, content: originalInfo.replace('"Original title"', '"Saved title"') } };
    const requestsBeforeSave = requests.length;
    const targetUrl = `/api/workspace?${new URLSearchParams({ cwd: workspace, path: `${actionPath}/data.json`, op: "program-document-target" })}`;
    assert.deepEqual(await json(targetUrl), { ok: true, projectDirectory: actionPath, projectBinding: null });
    const postDocument = (request: object) => fetch(origin + "/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
    const { expectedProjectBinding: _omittedBinding, ...oldClientRequest } = documentRequest;
    const oldClientSave = await postDocument(oldClientRequest);
    assert.equal(oldClientSave.status, 409);
    assert.equal((await oldClientSave.json()).code, "identity_conflict");
    assert.equal(readFileSync(join(actionDirectory, "data.json"), "utf8"), originalBody);
    assert.equal(readFileSync(join(actionDirectory, "info.json"), "utf8"), originalInfo);
    assert.equal((await json("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(documentRequest) })).ok, true);
    const savedBody = readFileSync(join(actionDirectory, "data.json"), "utf8");
    const savedInfo = readFileSync(join(actionDirectory, "info.json"), "utf8");
    assert.equal(JSON.parse(savedBody).steps[0].note, "after");
    assert.match(savedBody, /0\.123456789012345678901/);
    assert.match(savedBody, /9007199254740993/);
    assert.equal(JSON.parse(savedInfo).title, "Saved title");
    assert.match(savedInfo, /9223372036854775807/);
    assert.match(savedInfo, /9007199254740993/);
    assert.equal(requests.length, requestsBeforeSave, "local Designer Save never calls the host");
    const staleSave = await fetch(origin + "/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(documentRequest) });
    assert.equal(staleSave.status, 409);
    assert.equal((await staleSave.json()).code, "body_conflict");
    assert.equal(readFileSync(join(actionDirectory, "data.json"), "utf8"), savedBody);
    assert.equal(readFileSync(join(actionDirectory, "info.json"), "utf8"), savedInfo);
    const projectBinding = { schemaVersion: 1, kind: "action", actionId: "11111111-1111-4111-8111-111111111111", hostBinding: {
      hostInstanceId: "static-fixture", hostSessionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "fixture", capabilities: { "action.legacyBody.write": true },
    } };
    mkdirSync(join(actionDirectory, ".qkrpc"));
    const bindingPath = join(actionDirectory, ".qkrpc", "project-binding.json");
    writeFileSync(bindingPath, JSON.stringify(projectBinding));
    assert.deepEqual(await json(targetUrl), { ok: true, projectDirectory: actionPath, projectBinding });
    const boundRequest = { ...documentRequest, expectedContent: savedBody, content: savedBody.replace(/("note"\s*:\s*)"after"/, '$1"bound"'),
      metadata: { expectedContent: savedInfo, content: savedInfo }, expectedProjectBinding: projectBinding };
    assert.equal((await postDocument(boundRequest)).status, 200);
    const boundBody = readFileSync(join(actionDirectory, "data.json"), "utf8");
    assert.equal(JSON.parse(boundBody).steps[0].note, "bound");
    assert.match(boundBody, /0\.123456789012345678901/);
    assert.match(boundBody, /9007199254740993/);
    writeFileSync(bindingPath, JSON.stringify({ ...projectBinding, hostBinding: { ...projectBinding.hostBinding, capabilities: { "action.legacyBody.write": false } } }));
    const changedBindingSave = await postDocument({ ...boundRequest, expectedContent: boundBody, content: boundBody.replace(/("note"\s*:\s*)"bound"/, '$1"unexpected"') });
    assert.equal(changedBindingSave.status, 409);
    assert.equal((await changedBindingSave.json()).code, "identity_conflict");
    assert.equal(readFileSync(join(actionDirectory, "data.json"), "utf8"), boundBody);
    assert.equal(readFileSync(join(actionDirectory, "info.json"), "utf8"), savedInfo);
    assert.equal(requests.length, requestsBeforeSave, "local target reads and bound/unbound saves never call the host");
    assert.equal((await json("/api/designer/context")).designers[0].title, "Fixture Designer");
    assert.equal((await fetch(origin + "/api/designer/context", { method: "PUT" })).status, 405);
    for (const path of ["/api/browser/runtime", "/api/terminal/runtime"]) {
      const runtime = await json(path, { method: "POST" });
      assert.equal(runtime.ok, true);
      assert.notEqual(new URL(runtime.base).port, "6017");
      assert.notEqual(new URL(runtime.base).port, "6022");
      runtimeOrigins.push(runtime.base);
      assert.ok((await (await fetch(runtime.base + "/health")).json()).runtimeOwner);
    }
    const stream = await fetch(origin + "/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: [{ id: "input", role: "user", parts: [{ type: "text", text: "Answer using the fake endpoint" }] }], chatMode: "ask", enabledTools: [], llmSelection: selection, workingDirectory: workspace }) });
    assert.equal(stream.status, 200, await stream.clone().text());
    assert.match(await stream.text(), /Static service answer/);
    assert.ok(requests.includes("/v1/chat/completions"));
    assert.equal((await fetch(origin + "/.env")).status, 404);
    assert.equal((await fetch(origin + "/lib/service-main.mjs")).status, 404);
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const errors: string[] = [];
    await context.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    for (const path of ["/", "/launcher", "/tool-test", "/bench", "/?designerEntityId=offline-action"]) {
      await page.goto(origin + path);
      await page.locator("#root").locator("> *").first().waitFor();
      await page.waitForTimeout(1200);
      assert.ok((await page.locator("#root").innerText()).length > 10, `Renderer mounted: ${path}`);
      await page.screenshot({ path: join(root, `page-${path.replace(/[^a-z]/gi, "_") || "main"}.png`) });
    }
    await page.goto(origin);
    await page.locator(".agent-workbench").waitFor();
    await page.getByRole("button", { name: /^设置：/ }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(root, "settings.png") });
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => document.documentElement.dataset.appReady), "1");
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    await page.setViewportSize({ width: 500, height: 760 });
    await page.screenshot({ path: join(root, "dark-narrow.png") });
    assert.deepEqual(errors, []);
    const check = await json("/api/dev/frontend-check?paths=/,/launcher,/api/llm,/api/ping,/api/designer/context");
    assert.equal(check.ok, true);
    await json("/api/dev/frontend-check?clearCaptured=true");
    verification = { ok: true, requests, errors, frontendCheck: check, ownedRuntimeOrigins: runtimeOrigins };
  } finally {
    await browser?.close();
    if (child.connected) child.disconnect();
    let forced = false;
    const timer = setTimeout(() => { forced = true; child.kill(); }, 5000);
    await exited;
    clearTimeout(timer);
    fixture.closeAllConnections();
    await new Promise<void>((done) => fixture.close(() => done()));
    writeFileSync(join(root, "service-stderr.log"), stderr);
    assert.equal(child.exitCode, 0, stderr);
    assert.equal(forced, false, "IPC parent disconnect drains the owned service and children");
    for (const runtime of runtimeOrigins) await assert.rejects(fetch(runtime + "/health"));
  }
  writeFileSync(join(root, "verification.json"), JSON.stringify(verification, null, 2));
  console.log(`Static renderer/API/frontend check and owned process cleanup passed; evidence: ${root}`);
});
