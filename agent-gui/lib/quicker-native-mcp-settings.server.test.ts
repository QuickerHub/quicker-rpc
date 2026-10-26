import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, lstat, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createQuickerNativeMcpSettingsHandlers } from "./quicker-native-mcp-settings.server";
import { loadAgentMcpConfigLayers } from "./agent-mcp/config";
import type { QuickerNativeMcpSettingsState } from "./quicker-native-mcp-settings";
import { isReleasePreviewActive } from "./release-preview-context";
import { RELEASE_PREVIEW_COOKIE } from "./release-preview-constants";

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const tempBase = resolve(process.cwd(), "../.tmp"); await mkdir(tempBase, { recursive: true });
  const root = await mkdtemp(join(tempBase, "native-mcp-settings-"));
  t.after(async () => { assert.ok(root.startsWith(`${tempBase}${sep}`)); await rm(root, { recursive: true, force: true }); });
  const cwd = join(root, "workspace"), userFile = join(root, "user", "agent-defs", "mcp.json"), workspaceFile = join(cwd, ".quicker", "mcp.json");
  await mkdir(cwd, { recursive: true });
  let identity = "native-source-1", probeCalls = 0, deny = false;
  let beforeLoad: (() => void | Promise<void>) | undefined;
  let onProbe: (() => void | Promise<void>) | undefined;
  const guardCalls: string[] = [];
  const guardPath = async (path: string, signal?: AbortSignal, expected: "file" | "directory" = "file") => {
    signal?.throwIfAborted(); guardCalls.push(path);
    if (deny) throw new Error("private fixture failure must not escape");
    const rel = relative(root, resolve(path)); assert.ok(!rel.startsWith("..") && !rel.startsWith(sep), "fixture never reads outside its owned root");
    const parts = rel.split(sep).filter(Boolean); let current = root;
    for (const [index, part] of ["", ...parts].entries()) {
      if (part) current = join(current, part);
      const info = await lstat(current);
      if (info.isSymbolicLink() || (index === parts.length ? (expected === "file" ? !info.isFile() : !info.isDirectory()) : !info.isDirectory())) throw new Error("unsafe fixture path");
    }
  };
  const dependencies = {
    configPaths: (owner: string) => [userFile, join(owner, ".quicker", "mcp.json")], guardPath,
    readFile: async (path: string, signal?: AbortSignal) => { await guardPath(path, signal); return { raw: await readFile(path), fileIdentity: "owned" }; },
    loadLayers: async (owner: string, paths?: string[]) => { await beforeLoad?.(); return loadAgentMcpConfigLayers(owner, paths); },
    inspect: async () => ({ status: "found" as const, identity }),
    probe: async () => { probeCalls++; await onProbe?.(); return { status: "ok" as const, sourceIdentity: identity,
      serverInfo: { name: "fixture", version: "actual-reported" }, toolCount: 3, checkedAt: "2026-10-26T14:00:00Z" }; },
  };
  const api = createQuickerNativeMcpSettingsHandlers(dependencies);
  const get = async (owner = cwd) => api.GET(new Request(`http://fixture.invalid/api/settings/quicker-native-mcp?cwd=${encodeURIComponent(owner)}`));
  const post = async (state: QuickerNativeMcpSettingsState, action = "set-enabled", enabled?: boolean, signal?: AbortSignal) => api.POST(new Request("http://fixture.invalid/api/settings/quicker-native-mcp", {
    method: "POST", body: JSON.stringify({ action, cwd: state.cwd, revision: state.revision, ...(enabled !== undefined ? { enabled } : {}) }), signal,
  }));
  const seed = async (path: string, raw: string) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, raw); };
  return { root, cwd, userFile, workspaceFile, dependencies, api, get, post, seed, guardCalls,
    setIdentity: (value: string) => { identity = value; }, probeCalls: () => probeCalls,
    deny: () => { deny = true; }, beforeLoad: (fn: () => void | Promise<void>) => { beforeLoad = fn; }, onProbe: (fn: () => void | Promise<void>) => { onProbe = fn; } };
}
const native = (enabled = true) => JSON.stringify({ mcpServers: { "quicker-local": { source: "quicker-native", enabled } } });

test("GET is read-only, echoes the exact absolute cwd and returns a stable opaque revision", async t => {
  const f = await fixture(t);
  const owner = `${f.cwd}${sep}.`;
  const first = await (await f.get(owner)).json(), second = await (await f.get(owner)).json();
  assert.equal(first.ok, true); assert.equal(first.state.cwd, owner);
  assert.match(first.state.revision, /^[a-f0-9]{64}$/);
  assert.equal(first.state.revision, second.state.revision);
  assert.notEqual(first.state.revision, (await (await f.get()).json()).state.revision);
  assert.equal(first.state.userEnabled, false); assert.equal(first.state.effective.blocked, false);
  assert.equal(f.probeCalls(), 0);
  await assert.rejects(readFile(f.userFile), { code: "ENOENT" });
  f.setIdentity("rotated"); assert.notEqual(first.state.revision, (await (await f.get(owner)).json()).state.revision);
  const invalid = await f.get("relative/project"); assert.equal(invalid.status, 400);
});

test("explicit user enable preserves BOM, credentials, unknown fields and numeric lexemes", async t => {
  const f = await fixture(t);
  const raw = '\uFEFF{"unknown":{"large":9007199254740993,"decimal":1.2300,"negative":-0},"mcpServers":{"other":{"enabled":false,"transport":"http","url":"https://fixture.invalid/mcp","headers":{"Authorization":"private-owned-secret"},"future":{"value":1e+05}},"Quicker-Local":{"source":"quicker-native","enabled":false,"requireApproval":true,"tools":[]}}}';
  await f.seed(f.userFile, raw);
  const before = (await (await f.get()).json()).state;
  const result = await f.post(before, "set-enabled", true), body = await result.json();
  assert.equal(result.status, 200); assert.equal(body.state.userEnabled, true); assert.equal(body.state.userManaged, true);
  assert.equal(body.state.effective.scope, "user"); assert.notEqual(body.state.revision, before.revision);
  const written = await readFile(f.userFile, "utf8");
  assert.ok(written.startsWith("\uFEFF"));
  for (const token of ["9007199254740993", "1.2300", "-0", "1e+05", "private-owned-secret"]) assert.ok(written.includes(token));
  const parsed = JSON.parse(written.slice(1));
  assert.equal(parsed.mcpServers["Quicker-Local"].requireApproval, true);
  assert.deepEqual(parsed.mcpServers["Quicker-Local"].tools, []);
  assert.equal(Object.hasOwn(parsed.mcpServers, "quicker-local"), false);
  assert.doesNotMatch(JSON.stringify(body), /private-owned-secret|Authorization|fixture.invalid/);
  assert.deepEqual(await readdir(dirname(f.userFile)), ["mcp.json"]);
  assert.equal(f.probeCalls(), 0);
  assert.equal((await f.post(before, "set-enabled", false)).status, 409);
});

test("workspace, custom, malformed and duplicate canonical configurations block user writes", async t => {
  const f = await fixture(t);
  for (const raw of [
    '{"mcpServers":{"quicker-local":{"enabled":false,"transport":"http","url":"https://fixture.invalid"}}}',
    '{"mcpServers":{"quicker-local":{"source":"quicker-native"},"Quicker-Local":{"source":"quicker-native"}}}',
    '{"mcpServers":{"quicker-local":{"source":"quicker-native","headers":{"secret":"private"}}}}',
    '{invalid private secret',
  ]) {
    await f.seed(f.userFile, raw);
    const read = await (await f.get()).json(); assert.equal(read.state.effective.blocked, true);
    assert.equal((await f.post(read.state, "set-enabled", true)).status, 409);
    assert.equal(await readFile(f.userFile, "utf8"), raw);
  }
  await f.seed(f.userFile, native(false)); await f.seed(f.workspaceFile, native(false));
  const before = (await (await f.get()).json()).state;
  assert.equal(before.effective.scope, "workspace"); assert.equal(before.effective.blocked, true);
  assert.equal((await f.post(before, "set-enabled", true)).status, 409);
  assert.equal(await readFile(f.userFile, "utf8"), native(false));
  assert.equal(await readFile(f.workspaceFile, "utf8"), native(false));
});

test("enabled custom canonical entries stay blocked without claiming native MCP is enabled", async t => {
  const f = await fixture(t);
  const custom = '{"mcpServers":{"quicker-local":{"enabled":true,"transport":"http","url":"https://fixture.invalid"}}}';
  await f.seed(f.userFile, custom);
  const user = (await (await f.get()).json()).state;
  assert.equal(user.userEnabled, false); assert.equal(user.userManaged, false);
  assert.deepEqual(user.effective, { enabled: false, scope: "user", managed: false, blocked: true,
    message: "quicker-local 已由其他来源占用；此处不会覆盖。" });
  assert.equal((await f.post(user, "set-enabled", false)).status, 409);
  await f.seed(f.userFile, native(true)); await f.seed(f.workspaceFile, custom);
  const workspace = (await (await f.get()).json()).state;
  assert.equal(workspace.userEnabled, true); assert.equal(workspace.userManaged, true);
  assert.equal(workspace.effective.enabled, false); assert.equal(workspace.effective.managed, false);
  assert.equal(workspace.effective.scope, "workspace"); assert.equal(workspace.effective.blocked, true);
  assert.equal((await f.post(workspace, "set-enabled", false)).status, 409);
  assert.equal(await readFile(f.userFile, "utf8"), native(true));
  assert.equal(await readFile(f.workspaceFile, "utf8"), custom);
});

test("preview context isolates request configuration paths through GET and POST", async t => {
  const f = await fixture(t), previewFile = join(f.root, "preview", "agent-defs", "mcp.json");
  const api = createQuickerNativeMcpSettingsHandlers({ ...f.dependencies,
    configPaths: owner => [isReleasePreviewActive() ? previewFile : f.userFile, join(owner, ".quicker", "mcp.json")],
  });
  const headers = { Cookie: `${RELEASE_PREVIEW_COOKIE}=1` };
  const url = `http://fixture.invalid/api/settings/quicker-native-mcp?cwd=${encodeURIComponent(f.cwd)}`;
  const [regular, preview] = await Promise.all([
    api.GET(new Request(url)).then(result => result.json()),
    api.GET(new Request(url, { headers })).then(result => result.json()),
  ]);
  assert.notEqual(regular.state.revision, preview.state.revision);
  const result = await api.POST(new Request(url, { method: "POST", headers,
    body: JSON.stringify({ action: "set-enabled", cwd: f.cwd, revision: preview.state.revision, enabled: true }) }));
  assert.equal(result.status, 200); assert.equal((await result.json()).state.userEnabled, true);
  assert.equal(JSON.parse(await readFile(previewFile, "utf8")).mcpServers["quicker-local"].enabled, true);
  await assert.rejects(readFile(f.userFile), { code: "ENOENT" });
  assert.equal((await (await api.GET(new Request(url))).json()).state.userEnabled, false);
});

test("per-user mutex rejects concurrent stale changes and cleans only its owned temp after failed publication", async t => {
  const f = await fixture(t);
  const before = (await (await f.get()).json()).state;
  const results = await Promise.all([f.post(before, "set-enabled", true), f.post(before, "set-enabled", false)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const current = (await (await f.get()).json()).state, raw = await readFile(f.userFile, "utf8");
  await writeFile(join(dirname(f.userFile), "other.tmp"), "keep");
  const api = createQuickerNativeMcpSettingsHandlers({ ...f.dependencies, renameFile: async () => { throw new Error("private rename detail"); } });
  const result = await api.POST(new Request("http://fixture.invalid/", { method: "POST", body: JSON.stringify({ action: "set-enabled", cwd: f.cwd, revision: current.revision, enabled: false }) }));
  assert.equal(result.status, 503); assert.doesNotMatch(JSON.stringify(await result.json()), /private rename/);
  assert.equal(await readFile(f.userFile, "utf8"), raw);
  assert.deepEqual((await readdir(dirname(f.userFile))).sort(), ["mcp.json", "other.tmp"]);
});

test("publication rechecks layers, native source and cancellation; acknowledgement loss never retries", async t => {
  const f = await fixture(t); await f.seed(f.userFile, native(false));
  const first = (await (await f.get()).json()).state;
  let loads = 0;
  f.beforeLoad(async () => { if (++loads === 2) await f.seed(f.workspaceFile, native(false)); });
  assert.equal((await f.post(first, "set-enabled", true)).status, 409);
  assert.equal(await readFile(f.userFile, "utf8"), native(false));
  f.beforeLoad(() => {}); await rm(f.workspaceFile);
  const preRotation = (await (await f.get()).json()).state; loads = 0;
  f.beforeLoad(() => { if (++loads === 2) f.setIdentity("rotated-before-publication"); });
  assert.equal((await f.post(preRotation, "set-enabled", true)).status, 409);
  assert.equal(await readFile(f.userFile, "utf8"), native(false));
  f.beforeLoad(() => {});
  const current = (await (await f.get()).json()).state;
  const cancelled = new AbortController(); cancelled.abort();
  assert.equal((await f.post(current, "set-enabled", true, cancelled.signal)).status, 503);
  assert.equal(await readFile(f.userFile, "utf8"), native(false));
  const afterCommit = new AbortController(); let renames = 0;
  const api = createQuickerNativeMcpSettingsHandlers({ ...f.dependencies, renameFile: async (from, to) => { renames++; await rename(from, to); afterCommit.abort(); } });
  const result = await api.POST(new Request("http://fixture.invalid/", { method: "POST", signal: afterCommit.signal,
    body: JSON.stringify({ action: "set-enabled", cwd: f.cwd, revision: current.revision, enabled: true }) }));
  assert.equal(result.status, 503); assert.equal((await result.json()).error.code, "SAVE_RESULT_UNKNOWN");
  assert.equal(renames, 1); assert.equal(JSON.parse(await readFile(f.userFile, "utf8")).mcpServers["quicker-local"].enabled, true);
  assert.equal((await (await f.get()).json()).state.userEnabled, true);
});

test("explicit probe does not enable and rejects source/config changes before acknowledging", async t => {
  const f = await fixture(t); const before = (await (await f.get()).json()).state;
  const result = await f.post(before, "probe"), body = await result.json();
  assert.equal(result.status, 200); assert.equal(body.probe.status, "ok"); assert.equal(body.state.userEnabled, false);
  await assert.rejects(readFile(f.userFile), { code: "ENOENT" });
  f.onProbe(() => f.setIdentity("new-source"));
  const changed = await f.post(before, "probe"); assert.equal(changed.status, 409);
  assert.equal((await changed.json()).probe, undefined); assert.equal(f.probeCalls(), 2);
  const stale = await f.post(before, "probe"); assert.equal(stale.status, 409); assert.equal(f.probeCalls(), 2);
});

test("path guards run before config content, block links and unsafe attributes without exposing details", async t => {
  const f = await fixture(t);
  f.deny(); const guarded = await f.get(); assert.equal(guarded.status, 503);
  assert.doesNotMatch(JSON.stringify(await guarded.json()), /private fixture/);
  const g = await fixture(t), outside = join(g.root, "redirect"); await mkdir(outside);
  await mkdir(dirname(dirname(g.userFile)), { recursive: true });
  await symlink(outside, dirname(g.userFile), process.platform === "win32" ? "junction" : "dir");
  assert.equal((await g.get()).status, 503);
  assert.deepEqual(await readdir(outside), []);
});

test("ambiguous duplicate JSON properties cannot be rewritten through the lossless writer", async t => {
  const f = await fixture(t);
  const raw = '{"unknown":1,"unknown":2,"mcpServers":{}}'; await f.seed(f.userFile, raw);
  const before = (await (await f.get()).json()).state;
  assert.equal((await f.post(before, "set-enabled", true)).status, 503);
  assert.equal(await readFile(f.userFile, "utf8"), raw);
});
