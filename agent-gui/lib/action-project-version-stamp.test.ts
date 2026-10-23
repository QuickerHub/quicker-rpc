import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { saveActionFromWorkspace, syncProjectEditVersionOnDisk } from "./action-project-workflow";
import { saveProgramDocument, withProgramDocumentWriteOwner } from "./program-document-save.server";
import { runWithQkrpcCwdAsync } from "./qkrpc-request-context";
import type { QkrpcRunResult } from "./qkrpc-types";
import type { QkrpcHostBinding } from "./qkrpc-host-binding";

const binding: QkrpcHostBinding = {
  hostInstanceId: "version-stamp-fixture", hostSessionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "fixture",
  capabilities: { "action.legacyBody.read": true, "action.legacyBody.write": true, "action.presentation.write": true },
};

async function writeBinding(directory: string, actionId: string) {
  await mkdir(join(directory, ".qkrpc"), { recursive: true });
  await writeFile(join(directory, ".qkrpc", "project-binding.json"), JSON.stringify({ schemaVersion: 1, kind: "action", actionId, hostBinding: binding }));
}

async function fixture(run: (root: string) => Promise<void>) {
  const parent = fileURLToPath(new URL("../../../../.tmp/qkrpc-ui-lifecycle/", import.meta.url));
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "info-stamp-"));
  try { await runWithQkrpcCwdAsync(root, () => run(root)); }
  finally { assert.ok(root.startsWith(join(parent, "info-stamp-"))); await rm(root, { recursive: true, force: true }); }
}

test("production version stamp retains opaque Int64 content for action, global and embedded subprogram projects", async () => {
  await fixture(async (root) => {
    for (const project of [".quicker/actions/fixture", ".quicker/subprograms/global", ".quicker/actions/fixture/subprograms/child"]) {
      const directory = join(root, project);
      await mkdir(directory, { recursive: true });
      const content = '{"ID":"fixture","Name":"legacy","EditVersion":11,"Future":{"n":9007199254740993}}\r\n';
      await writeFile(join(directory, "info.json"), content);
      await writeFile(join(directory, "data.json"), '{"steps":[],"variables":[]}');
      assert.equal(await syncProjectEditVersionOnDisk(project, "9223372036854775807"), true);
      assert.equal(await readFile(join(directory, "info.json"), "utf8"), content.replace('"EditVersion":11', '"EditVersion":9223372036854775807'));
    }
  });
});

test("production stamp queues with local document save and reads the current metadata after acquiring its owner", async () => {
  await fixture(async (root) => {
    const project = ".quicker/actions/fixture";
    const directory = join(root, project);
    await mkdir(directory, { recursive: true });
    const before = '{"id":"fixture","editVersion":"10","title":"Before","opaque":{"n":9007199254740993}}';
    const local = before.replace("Before", "Concurrent local save");
    await writeFile(join(directory, "info.json"), before);
    await writeFile(join(directory, "data.json"), '{"steps":[],"variables":[]}');
    let release!: () => void;
    const held = new Promise<void>((resolveHeld) => { release = resolveHeld; });
    let entered!: () => void;
    const enteredOwner = new Promise<void>((resolveEntered) => { entered = resolveEntered; });
    const localSave = withProgramDocumentWriteOwner(`${project}/info.json`, async () => { entered(); await held; await writeFile(join(directory, "info.json"), local); });
    await enteredOwner;
    let finished = false;
    const stamping = syncProjectEditVersionOnDisk(project, 12).then((value) => { finished = true; return value; });
    try {
      await new Promise((resolveTurn) => setTimeout(resolveTurn, 10));
      assert.equal(finished, false);
      assert.equal(await readFile(join(directory, "info.json"), "utf8"), before);
    } finally { release(); }
    await localSave;
    assert.equal(await stamping, true);
    assert.equal(await readFile(join(directory, "info.json"), "utf8"), local.replace('"editVersion":"10"', '"editVersion":"12"'));
  });
});

test("whole production Sync owns preflight, body and metadata RPC so local two-file save cannot enter mid-transaction", async () => {
  for (const pauseAt of ["get", "apply", "set-metadata"]) {
    await fixture(async (root) => {
      const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
      const project = `.quicker/actions/${id}`;
      const directory = join(root, project);
      await mkdir(directory, { recursive: true });
      const beforeBody = '{"steps":[],"variables":[],"future":{"revision":1}}';
      const beforeInfo = `{"id":"${id}","editVersion":"10","title":"Local A","description":"","icon":"","unknown":9007199254740993}`;
      await writeFile(join(directory, "data.json"), beforeBody);
      await writeFile(join(directory, "info.json"), beforeInfo);
      await writeBinding(directory, id);
      let release!: () => void;
      const held = new Promise<void>((resolveHeld) => { release = resolveHeld; });
      let entered!: () => void;
      const paused = new Promise<void>((resolvePaused) => { entered = resolvePaused; });
      const calls: string[][] = [];
      const run = async (args: string[]): Promise<QkrpcRunResult> => {
        calls.push([...args]);
        if (args[1] === pauseAt) { entered(); await held; }
        const payload = args[1] === "get"
          ? { success: true, editVersion: 10, compressed: { title: "Remote", description: "", icon: "" } }
          : { success: true, editVersion: args[1] === "set-metadata" ? 12 : 11 };
        return { ok: true, exitCode: 0, stdout: "", stderr: "", parsed: { ok: true, payload }, truncated: false };
      };
      const syncing = saveActionFromWorkspace({ id }, { run });
      await paused;
      let localFinished = false;
      const localWrites: string[] = [];
      const saving = saveProgramDocument({ path: `${project}/data.json`, expectedContent: beforeBody, content: beforeBody.replace('"revision":1', '"revision":2'),
        metadata: { expectedContent: beforeInfo, content: beforeInfo.replace("Local A", "Local B") } },
      { writeWorkspaceFile: async (...args) => { localWrites.push(args[0]); throw new Error("A stale local transaction must not write"); } })
        .then((result) => { localFinished = true; return result; });
      try {
        await new Promise((resolveTurn) => setTimeout(resolveTurn, 10));
        assert.equal(localFinished, false, pauseAt);
        assert.equal(await readFile(join(directory, "info.json"), "utf8"), beforeInfo, pauseAt);
        assert.deepEqual(localWrites, [], pauseAt);
      } finally { release(); }
      const synced = await syncing;
      assert.equal(synced.ok, true, JSON.stringify(synced));
      assert.equal(((synced.data as { payload: { editVersion: number } }).payload).editVersion, 12);
      const local = await saving;
      assert.equal(local.ok, false, pauseAt);
      if (!local.ok) assert.equal(local.code, "metadata_conflict", pauseAt);
      assert.deepEqual(localWrites, [], pauseAt);
      assert.equal(await readFile(join(directory, "data.json"), "utf8"), beforeBody);
      assert.equal(await readFile(join(directory, "info.json"), "utf8"), beforeInfo.replace('"editVersion":"10"', '"editVersion":"12"'));
      assert.deepEqual(calls.map((args) => args[1]), ["validate", "get", "apply", "set-metadata"]);
    });
  }
});

test("production partial metadata Sync keeps old local version and never creates a success trust marker", async () => {
  for (const failure of ["rejected", "response-lost", "missing-version"]) {
    await fixture(async (root) => {
      const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
      const project = `.quicker/actions/${id}`;
      const directory = join(root, project);
      await mkdir(directory, { recursive: true });
      const beforeBody = '{"steps":[],"variables":[]}';
      const beforeInfo = `{"id":"${id}","editVersion":"10","title":"Local A","description":"","icon":"","unknown":9007199254740993}`;
      await writeFile(join(directory, "data.json"), beforeBody);
      await writeFile(join(directory, "info.json"), beforeInfo);
      await writeBinding(directory, id);
      const calls: string[] = [];
      const result = await saveActionFromWorkspace({ id }, { run: async (args) => {
        calls.push(args[1]!);
        if (args[1] === "set-metadata" && failure === "response-lost") throw new Error("metadata response lost after dispatch");
        const rejected = args[1] === "set-metadata" && failure === "rejected";
        const payload = args[1] === "get"
          ? { success: true, editVersion: 10, compressed: { title: "Remote B", description: "", icon: "" } }
          : args[1] === "set-metadata"
            ? { success: !rejected, errorMessage: rejected ? "Designer open" : undefined, errorCode: rejected ? "DESIGNER_OPEN" : undefined }
            : { success: true, editVersion: 11 };
        return { ok: !rejected, exitCode: rejected ? 1 : 0, stdout: "", stderr: "", parsed: { ok: !rejected, payload }, truncated: false };
      } });
      assert.equal(result.ok, false, failure);
      const data = result.data as { phase: string; persistedParts: { body: boolean; metadata?: boolean } };
      assert.equal(data.phase, "metadata");
      assert.deepEqual(data.persistedParts, failure === "missing-version" ? { body: true, metadata: true } : { body: true });
      assert.equal(await readFile(join(directory, "info.json"), "utf8"), beforeInfo, failure);
      await assert.rejects(readFile(join(directory, ".qkrpc/sync-trust.json")), { code: "ENOENT" });
      assert.deepEqual(calls, ["validate", "get", "apply", "set-metadata"]);
    });
  }
});
