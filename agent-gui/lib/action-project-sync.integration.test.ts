import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { POST } from "../app/api/workspace/action-sync/route";
import { fetchActionProjectSyncStatus, pushActionProjectToQuickerApi, pullActionProjectFromQuicker } from "./action-project-sync-client";
import { resolveActionProjectSyncDecision } from "./action-project-sync-types";
import { ACTION_PROJECT_PUSHED_EVENT, markActionProjectSyncedAfterPush } from "./action-project-sync-events";
import { readActionProjectSyncCache, invalidateActionProjectSyncCache } from "./action-project-sync-cache";
import { readActionProjectSyncTrust, writeActionProjectSyncTrust } from "./action-project-sync-trust";
import { runWithAgentRequestContextAsync, getRequestAbortSignal } from "./qkrpc-request-context";
import { syncActionProjectBodyAndMetadata } from "./action-project-sync-metadata";
import type { QkrpcHostBinding } from "./qkrpc-host-binding";

const a = "9007199254740992";
const b = "9007199254740993";
const max = "9223372036854775807";
const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const base = "http://sync-fixture.invalid:19477";
const binding: QkrpcHostBinding = {
  hostInstanceId: "fixture", hostSessionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  protocolVersion: 1, schemaVersion: 1, hostKind: "v2", quickerVersion: "fixture",
  capabilities: { "action.legacyBody.read": true, "action.legacyBody.write": true, "action.presentation.write": true },
};

async function fixture(run: (root: string, directory: string, info: string) => Promise<void>) {
  const parent = fileURLToPath(new URL("../../.tmp/int64-sync/", import.meta.url));
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "fixture-"));
  const directory = join(root, ".quicker", "actions", id);
  await mkdir(directory, { recursive: true });
  const info = `{"id":"${id}","title":"Local","description":"","icon":"","editVersion":${b},"opaque":9007199254740993}`;
  await writeFile(join(directory, "data.json"), '{"steps":[],"variables":[]}');
  await writeFile(join(directory, "info.json"), info);
  await mkdir(join(directory, ".qkrpc"), { recursive: true });
  await writeFile(join(directory, ".qkrpc", "project-binding.json"), JSON.stringify({ schemaVersion: 1, kind: "action", actionId: id, hostBinding: binding }));
  try { await runWithAgentRequestContextAsync({ cwd: root }, () => run(root, directory, info)); }
  finally { invalidateActionProjectSyncCache(root, id); assert.ok(root.startsWith(join(parent, "fixture-"))); await rm(root, { recursive: true, force: true }); }
}

async function withFetch(fetch: typeof globalThis.fetch, run: () => Promise<void>) {
  const previous = globalThis.fetch;
  const keys = ["QKRPC_HTTP_URL", "QKRPC_TRANSPORT", "QKRPC_HOST_BINDING", "QKRPC_HOST_SESSION", "QKRPC_BIN"];
  const env = keys.map((key) => process.env[key]);
  globalThis.fetch = fetch;
  process.env.QKRPC_HTTP_URL = base;
  for (const key of keys.slice(1)) delete process.env[key];
  try { await run(); }
  finally {
    globalThis.fetch = previous;
    keys.forEach((key, index) => { if (env[index] === undefined) delete process.env[key]; else process.env[key] = env[index]; });
  }
}

test("exact trust roundtrips both old numeric and new Int64 markers; unsafe runtime numbers cannot replace it", async () => {
  await fixture(async (_root, directory) => {
    await writeActionProjectSyncTrust(directory, 42);
    assert.equal((await readActionProjectSyncTrust(directory))?.editVersion, 42);
    await writeActionProjectSyncTrust(directory, max);
    assert.equal((await readActionProjectSyncTrust(directory))?.editVersion, max);
    const path = join(directory, ".qkrpc", "sync-trust.json");
    const before = await readFile(path, "utf8");
    assert.equal(JSON.parse(before).editVersion, max);
    await writeActionProjectSyncTrust(directory, Number(b));
    assert.equal(await readFile(path, "utf8"), before);
    await writeFile(path, `{"editVersion":${b},"updatedUtc":"fixture"}`);
    assert.equal((await readActionProjectSyncTrust(directory))?.editVersion, b);
  });
});

test("client events and cache retain exact versions and reject an already rounded optimistic success", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const events = new EventTarget();
  const received: unknown[] = [];
  events.addEventListener(ACTION_PROJECT_PUSHED_EVENT, (event) => received.push((event as CustomEvent).detail));
  Object.defineProperty(globalThis, "window", { configurable: true, value: events });
  try {
    markActionProjectSyncedAfterPush("fixture", id, max);
    assert.deepEqual(received.at(-1), { cwd: "fixture", actionId: id, editVersion: max });
    assert.equal(readActionProjectSyncCache("fixture", id)?.state, "in_sync");
    assert.match(readActionProjectSyncCache("fixture", id)!.message, new RegExp(max));
    markActionProjectSyncedAfterPush("fixture", id, Number(b));
    assert.equal(readActionProjectSyncCache("fixture", id), undefined);
    assert.equal((received.at(-1) as { editVersion?: unknown }).editVersion, undefined);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window");
    invalidateActionProjectSyncCache("fixture", id);
  }
});

test("production route → status decision → explicit push returns exact Int64 through client, event cache and trust", async () => {
  await fixture(async (root, directory) => {
    const calls: string[] = [];
    await withFetch(async (url, init) => {
      if (url === "/api/workspace/action-sync") return POST(new Request("http://fixture.invalid/api/workspace/action-sync", init));
      assert.ok(String(url).startsWith(base));
      if (String(url).endsWith("/health")) return Response.json({ service: "qkrpc", ok: true });
      const request = JSON.parse(String(init?.body)) as { op: string; args: Record<string, unknown>; hostBinding?: QkrpcHostBinding };
      assert.notEqual(request.op, "host.list", "Persisted project targets must not rediscover a host");
      assert.deepEqual(request.hostBinding, binding);
      calls.push(request.op);
      if (request.op === "action.get") return new Response(`{"ok":true,"data":{"success":true,"editVersion":${a},"compressed":{"title":"Remote","description":"","icon":""}}}`);
      if (request.op === "action.validate") return Response.json({ ok: true, data: { success: true } });
      if (request.op === "action.apply") return new Response(`{"ok":true,"data":{"success":true,"editVersion":${b}}}`);
      assert.equal(request.op, "action.set-metadata");
      assert.equal(request.args.expectedEditVersion, b);
      return new Response(`{"ok":true,"data":{"success":true,"editVersion":${max}}}`);
    }, async () => {
      const status = await fetchActionProjectSyncStatus(root, id);
      assert.equal(status.ok, true);
      if (!status.ok) return;
      assert.equal(status.status.localEditVersion, b);
      assert.equal(status.status.remoteEditVersion, a);
      assert.equal(status.status.state, "disk_ahead");
      assert.deepEqual(resolveActionProjectSyncDecision(status.status, { hasLocalChanges: true }), { kind: "push" });
      const result = await pushActionProjectToQuickerApi(root, id);
      assert.equal(result.ok && result.editVersion, max, JSON.stringify(result));
      assert.equal(readActionProjectSyncCache(root, id)?.state, "in_sync");
      assert.match(readActionProjectSyncCache(root, id)!.message, new RegExp(max));
      assert.equal((await readActionProjectSyncTrust(directory))?.editVersion, max);
      assert.match(await readFile(join(directory, "info.json"), "utf8"), new RegExp(`"editVersion":${max}`));
      assert.deepEqual(calls, ["action.get", "action.validate", "action.get", "action.apply", "action.set-metadata"]);
    });
  });
});

test("client pull and legacy API status keep Int64 strings, while unsafe number-only status cannot claim sync", async () => {
  await withFetch(async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as { op: string };
    return request.op === "pull"
      ? new Response(`{"ok":true,"summary":{"projectDirectory":"fixture","editVersion":${b}}}`)
      : new Response(`{"ok":true,"status":{"state":"in_sync","message":"unsafe legacy status","localEditVersion":9007199254740992,"remoteEditVersion":9007199254740992}}`);
  }, async () => {
    const pulled = await pullActionProjectFromQuicker("fixture", id);
    assert.equal(pulled.ok && pulled.editVersion, b);
    const status = await fetchActionProjectSyncStatus("fixture", id);
    assert.equal(status.ok && status.status.state, "unknown_remote");
    invalidateActionProjectSyncCache("fixture", id);
  });
});

test("production Next-compatible route carries the original cancellation through body and metadata RPC and never stamps", async () => {
  for (const cancelAt of ["action.apply", "action.set-metadata"]) {
    await fixture(async (root, directory, before) => {
      const cancel = new AbortController();
      const reason = new Error(`cancelled at ${cancelAt}`);
      const calls: string[] = [];
      await withFetch(async (_url, init) => {
        if (String(_url).endsWith("/health")) return Response.json({ service: "qkrpc", ok: true });
        const request = JSON.parse(String(init?.body)) as { op: string; hostBinding?: QkrpcHostBinding };
        assert.notEqual(request.op, "host.list", "Persisted project targets must not rediscover a host");
        assert.deepEqual(request.hostBinding, binding);
        calls.push(request.op);
        if (request.op === cancelAt) {
          const signal = init?.signal;
          assert.ok(signal, "The production transport must inherit request cancellation");
          cancel.abort(reason);
          assert.equal(signal.reason, reason);
          signal.throwIfAborted();
        }
        if (request.op === "action.get") return Response.json({ ok: true, data: { success: true, compressed: { title: "Remote", description: "", icon: "" } } });
        return new Response(`{"ok":true,"data":{"success":true,"editVersion":${b}}}`);
      }, async () => {
        const request = new Request("http://fixture.invalid/api/workspace/action-sync", { method: "POST", signal: cancel.signal,
          body: JSON.stringify({ cwd: root, op: "push", actionId: id }) });
        const response = await POST(request);
        assert.equal(response.status, 499);
        assert.deepEqual(await response.json(), { ok: false, error: "REQUEST_ABORTED", retryable: false, message: reason.message });
        assert.equal(await readFile(join(directory, "info.json"), "utf8"), before);
        await assert.rejects(readFile(join(directory, ".qkrpc", "sync-trust.json")), { code: "ENOENT" });
        assert.deepEqual(calls, cancelAt === "action.apply" ? ["action.validate", "action.get", "action.apply"]
          : ["action.validate", "action.get", "action.apply", "action.set-metadata"]);
      });
    });
  }
});

test("the business Sync port rethrows the original cancellation reason instead of a normal retryable failure", async () => {
  for (const cancelAt of ["apply", "set-metadata"]) {
    const cancel = new AbortController();
    const reason = new Error(cancelAt);
    let stamps = 0;
    await runWithAgentRequestContextAsync({ abortSignal: cancel.signal }, async () => {
      await assert.rejects(syncActionProjectBodyAndMetadata({ actionId: id, infoContent: '{"title":"Local"}', applyArgs: ["action", "apply"] }, {
        signal: getRequestAbortSignal(), stampVersion: async () => { stamps++; }, run: async (args) => {
          if (args[1] === cancelAt) { cancel.abort(reason); throw reason; }
          return { ok: true, exitCode: 0, stdout: "", stderr: "", truncated: false, parsed: { success: true, editVersion: b, compressed: { title: "Remote" } } };
        },
      }), (error: unknown) => error === reason);
    });
    assert.equal(stamps, 0);
  }
});
