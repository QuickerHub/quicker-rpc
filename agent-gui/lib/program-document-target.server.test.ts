import assert from "node:assert/strict";
import { mock, test } from "node:test";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile, unlink, symlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readProgramDocumentTarget, saveProgramDocument, withProgramDocumentWriteOwner } from "./program-document-save.server";
import { withActionProjectLease } from "./action-project-host-binding.server";
import { parseActionProjectBinding } from "./action-project-binding";
import { runWithAgentRequestContextAsync } from "./qkrpc-request-context";
import { GET } from "../app/api/workspace/route";
import { POST } from "../app/api/workspace/action-sync/route";
import { pullActionProjectFromQuicker, pushActionProjectToQuickerApi } from "./action-project-sync-client";
import { readActionProjectSyncCache } from "./action-project-sync-cache";

const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const directory = `.quicker/actions/${id}`;
const path = `${directory}/data.json`;
const bindingPath = `${directory}/.qkrpc/project-binding.json`;
const record = parseActionProjectBinding({ schemaVersion: 1, kind: "action", actionId: id, hostBinding: {
  hostInstanceId: "fixture-a", hostSessionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "fixture", capabilities: { "action.legacyBody.read": true, "action.legacyBody.write": true, "action.presentation.write": true },
} }, id);
const body = '{"steps":[],"variables":[],"opaque":9223372036854775807}';
const info = `{"id":"${id}","title":"Before","editVersion":42,"opaque":9007199254740993}`;
const request = () => ({ path, content: body.replace('"steps":[]', '"steps":[{"stepRunnerKey":"sys:delay"}]'), expectedContent: body,
  metadata: { content: info.replace("Before", "After"), expectedContent: info }, expectedProjectBinding: record });

async function fixture(run: (root: string) => Promise<void>, bound = true) {
  const parent = fileURLToPath(new URL("../../.tmp/document-target/", import.meta.url));
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "fixture-"));
  await mkdir(join(root, directory, ".qkrpc"), { recursive: true });
  await writeFile(join(root, path), body);
  await writeFile(join(root, directory, "info.json"), info);
  if (bound) await writeFile(join(root, bindingPath), JSON.stringify(record));
  try { await runWithAgentRequestContextAsync({ cwd: root }, () => run(root)); }
  finally { assert.ok(root.startsWith(join(parent, "fixture-"))); await rm(root, { recursive: true, force: true }); }
}

test("local target API returns only the requested main document binding and unbound Save remains local", async () => {
  for (const bound of [false, true]) await fixture(async (root) => {
    const result = await readProgramDocumentTarget(path);
    assert.deepEqual(result, { ok: true, projectDirectory: directory, projectBinding: bound ? record : null });
    const response = await GET(new Request(`http://fixture.invalid/api/workspace?${new URLSearchParams({ cwd: root, path, op: "program-document-target" })}`));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), result);
    assert.deepEqual(await saveProgramDocument({ ...request(), expectedProjectBinding: bound ? record : null }), { ok: true });
    assert.equal(await readFile(join(root, directory, "info.json"), "utf8"), request().metadata.content);
    assert.match(await readFile(join(root, path), "utf8"), /9223372036854775807/);
    if (bound) assert.deepEqual(JSON.parse(await readFile(join(root, bindingPath), "utf8")), record);
    else await assert.rejects(readFile(join(root, bindingPath)), { code: "ENOENT" });
  }, bound);
});

test("full binding changes, deletion, invalid records and omitted expectations fail before either write", async () => {
  for (const mutation of ["instance", "capability", "version", "deleted", "invalid", "omitted", "null", "info", "guid-directory"]) {
    await fixture(async (root) => {
      const changed = structuredClone(record);
      if (mutation === "instance") changed.hostBinding = { ...changed.hostBinding, hostInstanceId: "another" };
      if (mutation === "capability") changed.hostBinding = { ...changed.hostBinding, capabilities: { ...changed.hostBinding.capabilities, "action.legacyBody.write": false } };
      if (mutation === "version") changed.hostBinding = { ...changed.hostBinding, quickerVersion: "updated" };
      if (mutation === "guid-directory") changed.actionId = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";
      if (["instance", "capability", "version", "guid-directory"].includes(mutation)) await writeFile(join(root, bindingPath), JSON.stringify(changed));
      if (mutation === "deleted") await unlink(join(root, bindingPath));
      if (mutation === "invalid") await writeFile(join(root, bindingPath), "{invalid");
      if (mutation === "info") await writeFile(join(root, directory, "info.json"), info.replace(id, "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee"));
      const candidate: Record<string, unknown> = request();
      if (mutation === "omitted") delete candidate.expectedProjectBinding;
      if (mutation === "null") candidate.expectedProjectBinding = null;
      const beforeInfo = await readFile(join(root, directory, "info.json"), "utf8");
      let writes = 0;
      const result = await saveProgramDocument(candidate, { writeWorkspaceFile: async () => { writes++; throw new Error("Identity mismatch must not write"); } });
      assert.equal(result.ok, false, mutation);
      if (!result.ok) { assert.equal(result.code, "identity_conflict", mutation); assert.equal(result.persistedParts, undefined); }
      assert.equal(writes, 0, mutation);
      assert.equal(await readFile(join(root, path), "utf8"), body, mutation);
      assert.equal(await readFile(join(root, directory, "info.json"), "utf8"), beforeInfo, mutation);
    });
  }
  await fixture(async (root) => {
    await writeFile(join(root, bindingPath), JSON.stringify(record));
    const result = await saveProgramDocument({ ...request(), expectedProjectBinding: null });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "identity_conflict");
    assert.equal(await readFile(join(root, path), "utf8"), body);
  }, false);
});

test("the document queue reads binding after acquisition and the cross-process project lease excludes local saving", async () => fixture(async (root) => {
  let release!: () => void;
  let entered!: () => void;
  const paused = new Promise<void>((resolve) => { entered = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const owner = withProgramDocumentWriteOwner(path, async () => { entered(); await gate; });
  await paused;
  const saving = saveProgramDocument(request());
  await writeFile(join(root, bindingPath), JSON.stringify({ ...record, hostBinding: { ...record.hostBinding, quickerVersion: "changed while queued" } }));
  release(); await owner;
  const result = await saving;
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "identity_conflict");
  await writeFile(join(root, bindingPath), JSON.stringify(record));
  await withActionProjectLease(directory, async () => {
    const blocked = await saveProgramDocument(request());
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.code, "project_busy");
    assert.equal(await readFile(join(root, path), "utf8"), body);
    assert.ok(await readFile(join(root, directory, ".qkrpc-project.lock")));
  });
  await assert.rejects(readFile(join(root, directory, ".qkrpc-project.lock")), { code: "ENOENT" });
  assert.deepEqual(await saveProgramDocument(request()), { ok: true });
}));

test("unsafe identity leaves fail closed before any local write", async () => fixture(async (root) => {
  const outside = join(root, "outside"); await mkdir(outside);
  await writeFile(join(outside, "project-binding.json"), JSON.stringify(record));
  await rm(join(root, directory, ".qkrpc"), { recursive: true });
  await symlink(outside, join(root, directory, ".qkrpc"), "junction");
  assert.equal((await readProgramDocumentTarget(path)).ok, false);
  const result = await saveProgramDocument(request());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "identity_conflict");
  assert.equal(await readFile(join(root, path), "utf8"), body);
}));

test("identity changed during local preparation returns a structured failure before validation dispatch", async () => fixture(async (root) => {
  const originalRead = fsPromises.readFile;
  const originalWrite = fsPromises.writeFile;
  let changed = false;
  let dispatches = 0;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { dispatches++; throw new Error("Changed preparation must never dispatch"); };
  const reading = mock.method(fsPromises, "readFile", async (...args: Parameters<typeof fsPromises.readFile>) => {
    // The first guarded body preparation happens after the document owner has verified its target.
    if (!changed && String(args[0]).replace(/\\/g, "/").endsWith(path)) {
      changed = true;
      await originalWrite(join(root, bindingPath), JSON.stringify({ ...record, hostBinding: { ...record.hostBinding, quickerVersion: "changed during preparation" } }));
    }
    return originalRead(...args);
  });
  syncBuiltinESMExports();
  try {
    const response = await POST(new Request("http://fixture.invalid/api/workspace/action-sync", { method: "POST", body: JSON.stringify({ cwd: root, op: "push", actionId: id, projectDirectory: directory, expectedProjectBinding: record }) }));
    const result = await response.json();
    assert.equal(changed, true);
    assert.equal(result.ok, false);
    assert.equal(result.code, "PROJECT_IDENTITY_CONFLICT");
    assert.equal(result.retryable, false);
    assert.equal(result.phase, "validate");
    assert.equal(dispatches, 0);
    assert.equal(await originalRead(join(root, directory, "info.json"), "utf8"), info);
  } finally { reading.mock.restore(); syncBuiltinESMExports(); globalThis.fetch = oldFetch; }
}));

test("body persistence followed by a target conflict reports partial state without metadata dispatch or success stamps", async () => fixture(async (root) => {
  const oldFetch = globalThis.fetch;
  const keys = ["QKRPC_HTTP_URL", "QKRPC_TRANSPORT", "QKRPC_HOST_BINDING", "QKRPC_HOST_SESSION"];
  const oldEnv = keys.map((key) => process.env[key]);
  process.env.QKRPC_HTTP_URL = "http://document-sync-fixture.invalid:19477";
  keys.slice(1).forEach((key) => delete process.env[key]);
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    if (input === "/api/workspace/action-sync") return POST(new Request("http://fixture.invalid/api/workspace/action-sync", init));
    if (String(input).endsWith("/health")) return Response.json({ ok: true, service: "qkrpc" });
    const invoke = JSON.parse(String(init?.body)); calls.push(invoke.op);
    assert.deepEqual(invoke.hostBinding, record.hostBinding);
    if (invoke.op === "action.get") return Response.json({ ok: true, data: { success: true, compressed: { title: "Remote differs", icon: "", description: "" } } });
    assert.deepEqual(invoke.args.expectedProjectBinding, record);
    if (invoke.op === "action.apply") await writeFile(join(root, bindingPath), JSON.stringify({ ...record, hostBinding: { ...record.hostBinding, quickerVersion: "changed after body" } }));
    assert.ok(["action.validate", "action.apply"].includes(invoke.op), "A conflicting metadata write must never dispatch");
    return Response.json({ ok: true, data: { success: true, editVersion: 43 } });
  };
  try {
    const target = { projectDirectory: directory, projectBinding: record };
    const result = await pushActionProjectToQuickerApi(root, id, { target, isCurrent: () => true });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "PROJECT_IDENTITY_CONFLICT");
      assert.equal(result.retryable, false);
      assert.deepEqual(result.persistedParts, { body: true });
      assert.match(result.error, /正文已写入/);
    }
    assert.deepEqual(calls, ["action.validate", "action.get", "action.apply"]);
    assert.equal(await readFile(join(root, directory, "info.json"), "utf8"), info);
    await assert.rejects(readFile(join(root, directory, ".qkrpc/sync-trust.json")), { code: "ENOENT" });
    assert.equal(readActionProjectSyncCache(root, id, target), undefined);
  } finally { globalThis.fetch = oldFetch; keys.forEach((key, i) => { if (oldEnv[i] === undefined) delete process.env[key]; else process.env[key] = oldEnv[i]; }); }
}));

test("a CAS rejection from the actual extract transport preserves its code without replay, cache or local changes", async () => fixture(async (root) => {
  const oldFetch = globalThis.fetch;
  const keys = ["QKRPC_HTTP_URL", "QKRPC_TRANSPORT", "QKRPC_HOST_BINDING", "QKRPC_HOST_SESSION"];
  const oldEnv = keys.map((key) => process.env[key]);
  process.env.QKRPC_HTTP_URL = "http://document-sync-fixture.invalid:19477";
  keys.slice(1).forEach((key) => delete process.env[key]);
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    if (input === "/api/workspace/action-sync") return POST(new Request("http://fixture.invalid/api/workspace/action-sync", init));
    if (String(input).endsWith("/health")) return Response.json({ ok: true, service: "qkrpc" });
    calls++;
    const invoke = JSON.parse(String(init?.body));
    assert.equal(invoke.op, "action.extract");
    assert.deepEqual(invoke.args.expectedProjectBinding, record);
    return Response.json({ ok: false, error: "PROJECT_IDENTITY_CONFLICT", message: "fixture C# lease detected a changed target" });
  };
  try {
    const target = { projectDirectory: directory, projectBinding: record };
    const result = await pullActionProjectFromQuicker(root, id, { target });
    assert.equal(result.ok, false);
    if (!result.ok) { assert.equal(result.code, "PROJECT_IDENTITY_CONFLICT"); assert.equal(result.retryable, false); }
    assert.equal(calls, 1);
    assert.equal(await readFile(join(root, path), "utf8"), body);
    assert.equal(await readFile(join(root, directory, "info.json"), "utf8"), info);
    assert.equal(readActionProjectSyncCache(root, id, target), undefined);
    await assert.rejects(readFile(join(root, directory, ".qkrpc/sync-trust.json")), { code: "ENOENT" });
  } finally { globalThis.fetch = oldFetch; keys.forEach((key, i) => { if (oldEnv[i] === undefined) delete process.env[key]; else process.env[key] = oldEnv[i]; }); }
}));

test("actual Sync route rejects a changed complete target before any dispatch and echoes its verified target on success", async () => fixture(async (root) => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    if (String(_input).endsWith("/health")) return Response.json({ ok: true, service: "qkrpc" });
    calls++;
    const invoke = JSON.parse(String(init?.body));
    assert.notEqual(invoke.op, "host.list");
    assert.deepEqual(invoke.hostBinding, record.hostBinding);
    if (invoke.op === "action.get") return Response.json({ ok: true, data: { success: true, editVersion: 42, compressed: { title: "Before", icon: "", description: "" } } });
    assert.deepEqual(invoke.args.expectedProjectBinding, record);
    assert.ok(["action.validate", "action.apply"].includes(invoke.op));
    return Response.json({ ok: true, data: { success: true, editVersion: 43 } });
  };
  const oldBase = process.env.QKRPC_HTTP_URL;
  process.env.QKRPC_HTTP_URL = "http://document-sync-fixture.invalid:19477";
  const post = (op: string, expectedProjectBinding: unknown) => POST(new Request("http://fixture.invalid/api/workspace/action-sync", { method: "POST", body: JSON.stringify({ cwd: root, op, actionId: id, projectDirectory: directory, expectedProjectBinding }) }));
  try {
    const foreign = { ...record, hostBinding: { ...record.hostBinding, quickerVersion: "foreign" } };
    for (const op of ["status", "push", "pull"]) {
      const mismatch = await post(op, foreign); const data = await mismatch.json();
      assert.equal(data.ok, false, op);
      assert.equal(data.code, "PROJECT_IDENTITY_CONFLICT", op);
      assert.equal(data.retryable, false, op);
      assert.equal(calls, 0, op);
    }
    const status = await (await post("status", record)).json();
    assert.deepEqual(status.projectBinding, record); assert.equal(status.projectDirectory, directory);
    const pushed = await (await post("push", record)).json();
    assert.equal(pushed.ok, true, JSON.stringify(pushed));
    assert.deepEqual(pushed.projectBinding, record); assert.equal(pushed.projectDirectory, directory);
    assert.equal(pushed.editVersion, 43);
  } finally { globalThis.fetch = original; if (oldBase === undefined) delete process.env.QKRPC_HTTP_URL; else process.env.QKRPC_HTTP_URL = oldBase; }
}));
