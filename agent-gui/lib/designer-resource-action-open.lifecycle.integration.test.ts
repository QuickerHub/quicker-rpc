import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";
import { AgentNodeHttpStopTimeoutError, startAgentNodeHttpService } from "./agent-service/node-http";
import { openDesignerResourceAction } from "./designer-resource-action-open.server";
import type { DesignerResourceActionOpenResult } from "./designer-resource-action-open";
import type { ActionProjectBinding } from "./action-project-binding";
import { workspaceDocumentKey } from "./workspace-document-instances";
import { previewTabId } from "./workbench/preview-tab-id";

function within<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Owned loopback operation did not settle")), 5000); })])
    .finally(() => clearTimeout(timer));
}

test("client disconnect keeps an export in the real service request registry until its local receipt settles", { timeout: 15_000 }, async () => {
  const parent = resolve("../.tmp"); await mkdir(parent, { recursive: true });
  const cwd = await mkdtemp(join(parent, "resource-open-lifecycle-"));
  const sourceId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", actionId = "11111111-2222-3333-4444-555555555555";
  const requestId = "12345678-1234-1234-1234-123456789012", source = ".quicker/actions/source", path = `${source}/data.json`;
  const tabId = previewTabId("file", path);
  const binding: ActionProjectBinding = { schemaVersion: 1, kind: "action", actionId: sourceId, hostBinding: { hostInstanceId: "fixture",
    hostSessionId: "a".repeat(32), endpoint: `QuickerRpc_User_${"A".repeat(24)}_${"a".repeat(32)}`, protocolVersion: 1, schemaVersion: 1,
    hostKind: "v1", quickerVersion: "fixture", capabilities: { "action.legacyBody.read": true } } };
  const project = async (directory: string, record: ActionProjectBinding) => {
    await mkdir(join(cwd, directory, ".qkrpc"), { recursive: true });
    await writeFile(join(cwd, directory, "info.json"), JSON.stringify({ id: record.actionId }));
    await writeFile(join(cwd, directory, "data.json"), '{"steps":[]}');
    await writeFile(join(cwd, directory, ".qkrpc/project-binding.json"), JSON.stringify(record));
  };
  await project(source, binding);
  let started!: () => void, release!: () => void, disconnected!: () => void;
  const entered = new Promise<void>((done) => { started = done; }), finish = new Promise<void>((done) => { release = done; });
  const aborted = new Promise<void>((done) => { disconnected = done; });
  let receipt: DesignerResourceActionOpenResult | undefined, calls = 0;
  const service = await startAgentNodeHttpService(async (req) => {
    const input = await req.json(); req.signal.addEventListener("abort", disconnected, { once: true });
    receipt = await openDesignerResourceAction(input, { signal: req.signal, run: async (args) => {
      calls++; started(); await finish;
      const directory = `.quicker/actions/open-${requestId}`, absolute = args[args.indexOf("--dir") + 1];
      await project(directory, { ...binding, actionId });
      return { ok: true, exitCode: 0, stdout: "", stderr: "", truncated: false,
        parsed: { payload: { success: true, actionId, projectDirectoryAbsolute: absolute } } };
    } });
    return Response.json(receipt);
  }, { port: 0, stopGraceMs: 30 });
  let client: http.ClientRequest | undefined;
  try {
    client = http.request(service.origin, { method: "POST", headers: { "content-type": "application/json" }, agent: false });
    client.on("error", () => {}); client.end(JSON.stringify({ actionId, requestId,
      catalogContext: { cwd, projectDirectory: source, expectedProjectBinding: binding },
      sourceOwner: { cwd, path, tabId, key: workspaceDocumentKey(cwd, tabId), instanceId: 1 } }));
    await within(entered); client.destroy(); await within(aborted);
    await assert.rejects(service.stop(), (error: unknown) => {
      assert.ok(error instanceof AgentNodeHttpStopTimeoutError); assert.equal(error.pendingRequests, 1); return true;
    });
    assert.equal(receipt, undefined); release(); await within(service.whenSettled());
    assert.equal(receipt?.ok, true); assert.equal(receipt?.localPersistence, "confirmed"); assert.equal(calls, 1);
    assert.equal(await readFile(join(cwd, `.quicker/actions/open-${requestId}/data.json`), "utf8"), '{"steps":[]}');
  } finally {
    release(); client?.destroy(); await within(service.whenSettled());
    assert.ok(resolve(cwd).startsWith(parent + sep)); await rm(cwd, { recursive: true, force: true });
  }
});
