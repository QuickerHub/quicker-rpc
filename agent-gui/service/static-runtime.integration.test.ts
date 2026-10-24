import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { buildStaticRuntime } from "../scripts/build-static-runtime.mjs";
import { verifyStaticRuntime } from "../scripts/verify-static-runtime.mjs";

type ModelRequest = { model: string; tools?: { function?: { name?: string; parameters?: unknown } }[];
  messages: { role: string; content: string; tool_call_id?: string }[] };
type LiveReceipt = { ok: boolean; source: string; action: string; complete?: boolean; content?: string;
  revision?: number; revisionBefore?: number; revisionAfter?: number; dirty?: boolean; persisted: boolean;
  applied?: boolean; target: unknown };
function schemaScopeId(schema: unknown): string | undefined {
  if (!schema || typeof schema !== "object") return;
  const value = schema as { properties?: { scopeId?: { const?: unknown } } };
  if (typeof value.properties?.scopeId?.const === "string") return value.properties.scopeId.const;
  for (const child of Object.values(schema)) {
    const found = schemaScopeId(child); if (found) return found;
  }
}
function modelStream(res: ServerResponse, delta: object, reason: string) {
  res.setHeader("content-type", "text/event-stream");
  const chunk = (value: object, finish: string | null = null) => ({ id: "fixture", object: "chat.completion.chunk", created: 1,
    model: "offline-model", choices: [{ index: 0, delta: value, finish_reason: finish }] });
  res.write(`data: ${JSON.stringify(chunk(delta))}\n\n`);
  res.end(`data: ${JSON.stringify(chunk({}, reason))}\n\ndata: [DONE]\n\n`);
}
function toolStream(res: ServerResponse, id: string, input: object) {
  modelStream(res, { role: "assistant", tool_calls: [{ index: 0, id, type: "function",
    function: { name: "workspace_program", arguments: JSON.stringify(input) } }] }, "tool_calls");
}
async function until(predicate: () => boolean, description: string) {
  const end = Date.now() + 15_000;
  while (!predicate()) {
    assert.ok(Date.now() < end, `Timed out: ${description}`);
    await new Promise((done) => setTimeout(done, 25));
  }
}
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

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
  const requests: string[] = [], hostOperations: string[] = [];
  const modelRequests: ModelRequest[] = [], modelErrors: string[] = [];
  let liveScopeId: string | undefined, liveRead: LiveReceipt | undefined, liveEdit: LiveReceipt | undefined;
  let releaseEdit!: () => void;
  const editAllowed = new Promise<void>((done) => { releaseEdit = done; });
  const humanNote = "Human draft changed after the real pin, without blur";
  const agentNote = "Agent updated only the original pinned step";
  const fixture = createServer(async (req, res) => {
    requests.push(req.url!);
    res.setHeader("content-type", "application/json");
    if (req.url === "/health") return res.end(JSON.stringify({ ok: true, version: "offline", capabilities: {} }));
    let body = "";
    for await (const chunk of req) body += chunk;
    if (req.url === "/v1/invoke") {
      const { op } = JSON.parse(body);
      hostOperations.push(op);
      const data = op === "designer.context" ? { ok: true, designers: [{ entityId: "offline-action", title: "Fixture Designer", selectedSteps: [] }] } : { items: [], actions: [], subprograms: [], summaries: [] };
      return res.end(JSON.stringify({ ok: true, data }));
    }
    if (req.url === "/v1/chat/completions") {
      try {
        const request = JSON.parse(body) as ModelRequest;
        modelRequests.push(request);
        assert.equal(request.model, "offline-model");
        const toolSchema = request.tools?.find((item) => item.function?.name === "workspace_program")?.function?.parameters;
        const scopeId = schemaScopeId(toolSchema);
        if (!scopeId) {
          modelStream(res, { role: "assistant", content: "Static service answer" }, "stop");
          return;
        }
        assert.deepEqual(request.tools!.map((item) => item.function?.name ?? "").filter((name) =>
          ["Write", "StrReplace", "Shell", "workspace_program_patch"].includes(name) || name.startsWith("qkrpc_") || name.startsWith("mcp__")), [],
        "live composition removes native/disk authoring and arbitrary Shell/MCP tools from the actual provider request");
        liveScopeId ??= scopeId; assert.equal(scopeId, liveScopeId, "automatic continuations retain the original manual scope");
        const receipt = (id: string) => {
          const message = request.messages.find((item) => item.role === "tool" && item.tool_call_id === id);
          if (!message) return;
          const result = JSON.parse(message.content) as { ok: boolean; data: LiveReceipt };
          assert.equal(result.ok, true, message.content);
          return result.data;
        };
        const edited = receipt("live-designer-edit");
        if (edited) {
          liveEdit = edited;
          assert.equal(edited.source, "live_document"); assert.equal(edited.applied, true);
          assert.equal(edited.persisted, false); assert.equal(edited.dirty, true);
          assert.deepEqual(edited.target, liveRead!.target);
          modelStream(res, { role: "assistant", content: "Live Designer acceptance complete" }, "stop");
          return;
        }
        const read = receipt("live-designer-read");
        if (read) {
          liveRead = read;
          assert.equal(read.source, "live_document"); assert.equal(read.action, "read_live");
          assert.equal(read.complete, true); assert.equal(read.persisted, false); assert.equal(read.dirty, true);
          assert.match(read.content!, /Human draft changed after the real pin, without blur/);
          assert.match(read.content!, /9007199254740993/);
          await editAllowed;
          toolStream(res, "live-designer-edit", { scopeId, action: "edit_live", readOperationId: "live-designer-read",
            expectedRevision: read.revision, stepId: "live-step", note: agentNote });
          return;
        }
        toolStream(res, "live-designer-read", { scopeId, action: "read_live" });
      } catch (error) {
        modelErrors.push(error instanceof Error ? error.stack ?? error.message : String(error));
        res.statusCode = 500; res.end(JSON.stringify({ error: modelErrors.at(-1) }));
      }
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
  const liveActionId = "22222222-2222-4222-8222-222222222222";
  const liveDirectory = join(workspace, ".quicker/actions", liveActionId);
  const liveBody = '{"steps":[{"stepId":"live-step","stepRunnerKey":"sys:fixture","note":"Live original"},{"stepId":"not-pinned","stepRunnerKey":"sys:fixture","note":"Unpinned unchanged"}],"variables":[],"subPrograms":[],"futureInt":9007199254740993}';
  const liveInfo = JSON.stringify({ kind: "action", id: liveActionId, title: "Live Designer acceptance", editVersion: 1 });
  mkdirSync(liveDirectory, { recursive: true });
  writeFileSync(join(liveDirectory, "data.json"), liveBody); writeFileSync(join(liveDirectory, "info.json"), liveInfo);
  const companionDirectory = join(workspace, ".quicker/actions/33333333-3333-4333-8333-333333333333");
  mkdirSync(companionDirectory, { recursive: true });
  writeFileSync(join(companionDirectory, "data.json"), liveBody.replace("Live original", "Companion unchanged"));
  writeFileSync(join(companionDirectory, "info.json"), JSON.stringify({ kind: "action", id: "33333333-3333-4333-8333-333333333333", title: "Live companion", editVersion: 1 }));
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
    page.setDefaultTimeout(10_000);
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
    // Use the actual SPA/Explorer/Chat/SDK path, without directly accessing its registry.
    await page.getByRole("button", { name: "资源：动作与子程序工程目录", exact: true }).click();
    await page.getByRole("button", { name: /动作\/子程序/ }).click();
    const actionRoot = page.locator(".explorer-tree-row--root").filter({ hasText: /^动作项目\s*\d+ 项$/ });
    await actionRoot.click();
    const liveProject = page.locator(".explorer-tree-row").filter({ hasText: "Live Designer acceptance" });
    await liveProject.click();
    const editor = page.locator("[data-workspace-document]:visible");
    const note = editor.locator(".step-form-note-input");
    await note.waitFor();
    await editor.getByText("未绑定宿主 · 可保存到工作区，无法同步到 Quicker", { exact: true }).waitFor();
    await note.fill("Human unblurred draft before pin");
    await editor.getByRole("button", { name: "添加步骤到对话", exact: true }).first()
      .evaluate((button: HTMLButtonElement) => button.click());
    await note.fill(humanNote);
    const composer = page.getByRole("group", { name: "消息输入", exact: true }).getByRole("textbox");
    await composer.locator("[data-program-step-tag-id]").waitFor();
    await page.getByTitle("选择工作模式", { exact: true }).click();
    await page.getByRole("listbox", { name: "工作模式" }).getByRole("option", { name: /^Agent/ }).click();
    await composer.focus(); await composer.press("Control+End");
    await page.keyboard.insertText(" Change only the pinned step note using the live document.");
    await page.screenshot({ path: join(root, "live-designer-human-draft.png") });
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await until(() => Boolean(liveRead) || modelErrors.length > 0, "client read_live receipt reaches the fake model");
    assert.deepEqual(modelErrors, []); assert.ok(liveRead);
    // Hold the model's edit response while the user presents a different document.
    await page.getByRole("button", { name: "资源管理器", exact: true }).click();
    await page.locator(".explorer-tree-row").filter({ hasText: "Live companion" }).click();
    await page.waitForFunction(() => document.querySelector<HTMLInputElement>("[data-workspace-document]:not([hidden]) .step-form-note-input")?.value === "Companion unchanged");
    releaseEdit();
    await page.getByText("Live Designer acceptance complete", { exact: true }).waitFor({ timeout: 20_000 });
    assert.deepEqual(modelErrors, []); assert.ok(liveEdit);
    assert.equal(modelRequests.filter((request) => schemaScopeId(request.tools?.find((item) => item.function?.name === "workspace_program")?.function?.parameters)).length, 3,
      "one manual SPA turn continues through read, edit and final in the existing SDK loop");
    assert.equal(liveEdit.revisionBefore, liveRead.revision);
    assert.equal(liveEdit.revisionAfter, liveRead.revision! + 1);
    assert.equal(await note.inputValue(), "Companion unchanged", "late Agent edit does not replace or focus the presented document");
    await page.locator(".workspace-side-panel-tabs").getByRole("tab", { name: /Live Designer acceptance/ }).click();
    await page.waitForFunction((expected) => document.querySelector<HTMLInputElement>("[data-workspace-document]:not([hidden]) .step-form-note-input")?.value === expected, agentNote);
    assert.equal(await editor.getByRole("button", { name: "保存到工作区", exact: true }).isEnabled(), true);
    assert.match(await editor.innerText(), /Unpinned unchanged/);
    await page.screenshot({ path: join(root, "live-designer-agent-unsaved.png") });
    await editor.locator('[title="撤销 (Ctrl+Z)"]').click();
    assert.equal(await note.inputValue(), humanNote, "one Agent undo retains human edits made after pin");
    const liveDiskHashes = { body: sha256(readFileSync(join(liveDirectory, "data.json"), "utf8")), metadata: sha256(readFileSync(join(liveDirectory, "info.json"), "utf8")) };
    assert.deepEqual(liveDiskHashes, { body: sha256(liveBody), metadata: sha256(liveInfo) }, "live read/edit do not persist source or metadata");
    assert.equal(JSON.parse(readFileSync(join(companionDirectory, "data.json"), "utf8")).steps[0].note, "Companion unchanged");
    await page.screenshot({ path: join(root, "live-designer-one-undo.png") });
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
    assert.deepEqual(hostOperations.filter((op) => /(?:^|\.)(?:run|execute|save|apply|overwrite|write|extract|export)(?:\.|$)/i.test(op)), []);
    verification = { ok: true, requests, hostOperations, errors, frontendCheck: check, ownedRuntimeOrigins: runtimeOrigins,
      liveDesigner: { scopeId: liveScopeId, read: liveRead, edit: liveEdit, diskHashes: liveDiskHashes } };
    writeFileSync(join(root, "ui-acceptance.json"), JSON.stringify(verification, null, 2));
  } catch (error) {
    writeFileSync(join(root, "primary-failure.txt"), error instanceof Error ? error.stack ?? error.message : String(error));
    const page = browser?.contexts()[0]?.pages()[0];
    if (page) {
      await page.screenshot({ path: join(root, "failure.png"), fullPage: true }).catch(() => {});
      writeFileSync(join(root, "failure-dom.txt"), await page.locator("body").innerText().catch(() => "Page unavailable"));
    }
    throw error;
  } finally {
    releaseEdit();
    await browser?.close();
    if (child.connected) child.disconnect();
    let forced = false;
    const cleanupStarted = Date.now();
    const timer = setTimeout(() => { forced = true; child.kill(); }, 5000);
    await exited;
    console.log(`Owned service cleanup elapsed ${Date.now() - cleanupStarted}ms; forced=${forced}`);
    clearTimeout(timer);
    fixture.closeAllConnections();
    await new Promise<void>((done) => fixture.close(() => done()));
    writeFileSync(join(root, "service-stderr.log"), stderr);
    writeFileSync(join(root, "live-model-evidence.json"), JSON.stringify({ requests: modelRequests, errors: modelErrors, read: liveRead, edit: liveEdit }, null, 2));
    assert.equal(child.exitCode, 0, stderr);
    assert.equal(forced, false, "IPC parent disconnect drains the owned service and children");
    for (const runtime of runtimeOrigins) await assert.rejects(fetch(runtime + "/health"));
  }
  writeFileSync(join(root, "verification.json"), JSON.stringify(verification, null, 2));
  console.log(`Static renderer/API/frontend check and owned process cleanup passed; evidence: ${root}`);
});
