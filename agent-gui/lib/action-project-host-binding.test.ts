import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile, link, symlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { bootstrapActionProjectForCreate, saveActionFromWorkspace, syncActionToWorkspace } from "./action-project-workflow";
import { getActionProjectSyncStatus, pullActionProjectToWorkspace } from "./action-project-sync";
import { bindQkrpcTarget, currentQkrpcTarget, type QkrpcHostBinding } from "./qkrpc-host-binding";
import { runWithAgentRequestContextAsync } from "./qkrpc-request-context";
import { saveProgramDocument } from "./program-document-save.server";
import { executeQkrpcActionManageTool } from "./qkrpc-action-tool.server";
import { wasActionCreatedThisTurn } from "./program-turn-context";
import { WRITE_TOOL_DEF, STR_REPLACE_TOOL_DEF } from "./workspace-general-file-tool.server";
import { isStructuredToolResult } from "./tool-result";
import { ACTION_PROJECT_BINDING_PATH, findActionProjectBinding, guardActionProjectBindingWrite, pinActionProjectBinding,
  readActionProjectBinding, readNullableActionProjectBinding, withActionProjectBootstrap } from "./action-project-host-binding.server";

const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const project = `.quicker/actions/${id}`;
const base = "http://project-binding-fixture.invalid:19477";
const a: QkrpcHostBinding = { hostInstanceId: "fixture-a", hostSessionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", protocolVersion: 1, schemaVersion: 1,
  hostKind: "v1", quickerVersion: "fixture", capabilities: { "action.legacyBody.read": true, "action.legacyBody.write": true } };
const b: QkrpcHostBinding = { ...a, hostInstanceId: "fixture-b", hostSessionId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };
const record = (binding = a) => ({ schemaVersion: 1, kind: "action", actionId: id, hostBinding: binding });
const body = '{"steps":[],"variables":[]}';
const info = JSON.stringify({ id, title: "Fixture", description: "", icon: "", editVersion: "7" });

async function fixture(run: (root: string) => Promise<void>) {
  const parent = fileURLToPath(new URL("../../.tmp/project-binding/", import.meta.url));
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "fixture-"));
  const previousFetch = globalThis.fetch;
  const keys = ["QKRPC_HTTP_URL", "QKRPC_TRANSPORT", "QKRPC_HOST_BINDING", "QKRPC_HOST_SESSION", "AGENT_GUI_DEFAULT_CWD"];
  const previousEnv = keys.map((key) => process.env[key]);
  process.env.QKRPC_HTTP_URL = base;
  for (const key of keys.slice(1)) delete process.env[key];
  process.env.AGENT_GUI_DEFAULT_CWD = root;
  globalThis.fetch = async () => { throw new Error("Unexpected network in binding fixture"); };
  try { await run(root); }
  finally {
    globalThis.fetch = previousFetch;
    keys.forEach((key, index) => { if (previousEnv[index] === undefined) delete process.env[key]; else process.env[key] = previousEnv[index]; });
    assert.ok(root.startsWith(join(parent, "fixture-")));
    await rm(root, { recursive: true, force: true });
  }
}
async function seed(root: string, directory = project, binding: QkrpcHostBinding | null = a) {
  await mkdir(join(root, directory), { recursive: true });
  await writeFile(join(root, directory, "info.json"), info);
  await writeFile(join(root, directory, "data.json"), body);
  if (binding) {
    await mkdir(join(root, directory, ".qkrpc"));
    await writeFile(join(root, directory, ACTION_PROJECT_BINDING_PATH), JSON.stringify(record(binding)));
  }
}
function serve(handler: (op: string, args: Record<string, unknown>) => Promise<Response> | Response) {
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).startsWith(base), "No replacement gateway may be contacted");
    if (String(url).endsWith("/health")) return Response.json({ service: "qkrpc", ok: true });
    const request = JSON.parse(String(init?.body)) as { op: string; args: Record<string, unknown>; hostBinding?: QkrpcHostBinding };
    assert.notEqual(request.op, "host.list", "A persisted target must not discover another host");
    assert.deepEqual(request.hostBinding, a);
    return handler(request.op, request.args);
  };
}

test("create bootstrap captures verified turn provenance only after complete local files; body-only Save remains local", async () => {
  await fixture(async (root) => runWithAgentRequestContextAsync({ cwd: root }, async () => {
    const missing = await bootstrapActionProjectForCreate({ actionId: id, title: "Fixture", editVersion: 7 });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.deepEqual(missing.persistedParts, { hostAction: true, binding: false });
    bindQkrpcTarget({ gateway: base, binding: a });
    const created = await bootstrapActionProjectForCreate({ actionId: id, title: "Fixture", editVersion: 7 });
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.deepEqual((await readActionProjectBinding(project, id)).hostBinding, a);
    const content = await readFile(join(root, project, "data.json"), "utf8");
    const saved = await saveProgramDocument({ path: `${project}/data.json`, expectedContent: content, content: body, expectedProjectBinding: await readActionProjectBinding(project, id) });
    assert.equal(saved.ok, true);
  }));
});

test("old unbound projects can Save locally, but status, pull and push fail before any host RPC", async () => {
  await fixture(async (root) => {
    await seed(root, project, null);
    await runWithAgentRequestContextAsync({ cwd: root }, async () => {
      assert.equal(await readNullableActionProjectBinding(project, id), null);
      assert.equal((await saveProgramDocument({ path: `${project}/data.json`, expectedContent: body, content: '{"steps":[],"variables":[],"future":1}', expectedProjectBinding: null })).ok, true);
      for (const result of [await getActionProjectSyncStatus(id), await pullActionProjectToWorkspace(id), await saveActionFromWorkspace({ id })]) {
        assert.equal(result.ok, false);
        assert.match(JSON.stringify(result), /HOST_BINDING_REQUIRED/);
      }
    });
    assert.equal(JSON.parse(await readFile(join(root, project, "data.json"), "utf8")).future, 1);
  });
});

test("GUID directory and every metadata identity must agree with the sidecar before any RPC", async () => {
  await fixture(async (root) => {
    const otherId = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
    const directory = `.quicker/actions/${otherId}`;
    await seed(root, directory);
    await writeFile(join(root, directory, "info.json"), '{"title":"No id"}');
    await runWithAgentRequestContextAsync({ cwd: root }, async () => {
      await assert.rejects(readNullableActionProjectBinding(directory, id), /HOST_BINDING_MISMATCH/);
      const status = await getActionProjectSyncStatus(id);
      assert.equal(status.ok, false);
      if (!status.ok) assert.equal(status.code, "HOST_BINDING_MISMATCH");
    });
    await rm(join(root, directory), { recursive: true });
    await seed(root, ".quicker/actions/named");
    await writeFile(join(root, ".quicker/actions/named/info.json"), JSON.stringify({ id, ID: otherId }));
    await runWithAgentRequestContextAsync({ cwd: root }, async () => {
      await assert.rejects(readActionProjectBinding(".quicker/actions/named", id), /HOST_BINDING_MISMATCH/);
    });
  });
});

test("alternate .NET GUID directory forms reject foreign bootstrap before the writer or any project files exist", async () => {
  await fixture(async (root) => runWithAgentRequestContextAsync({ cwd: root }, async () => {
    const other = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
    for (const name of [other.replaceAll("-", ""), `{${other}}`, `(${other})`, "{0xbbbbbbbb,0xcccc,0xdddd,{0xee,0xee,0xff,0xff,0xff,0xff,0xff,0xff}}"] ) {
      const directory = `.quicker/actions/${name}`;
      let writes = 0;
      await assert.rejects(withActionProjectBootstrap(directory, id, a, async () => { writes += 1; }), /HOST_BINDING_MISMATCH/);
      assert.equal(writes, 0, name);
      await assert.rejects(readdir(join(root, directory)), { code: "ENOENT" });
    }
  }));
});

test("omitted request cwd uses the configured effective workspace for exact bound status, pull and push", async () => {
  await fixture(async (root) => {
    const directory = ".quicker/actions/default-named";
    await seed(root, directory);
    const calls: string[] = [];
    serve((op, args) => {
      calls.push(op);
      if (["action.extract", "action.validate", "action.apply"].includes(op)) assert.equal(args.dir, join(root, directory));
      return Response.json({ ok: true, data: op === "action.get"
        ? { success: true, editVersion: 7, compressed: { title: "Fixture", description: "", icon: "" } }
        : { success: true, editVersion: 8, projectDirectory: directory } });
    });
    assert.equal((await runWithAgentRequestContextAsync({}, () => getActionProjectSyncStatus(id))).ok, true);
    assert.equal((await runWithAgentRequestContextAsync({}, () => pullActionProjectToWorkspace(id))).ok, true);
    assert.equal((await runWithAgentRequestContextAsync({}, () => saveActionFromWorkspace({ id }))).ok, true);
    assert.deepEqual(calls, ["action.get", "action.extract", "action.validate", "action.get", "action.apply"]);
  });
});

test("a persisted host create remains remembered after local foreign-binding failure, so a second create sends no RPC", async () => {
  await fixture(async (root) => {
    await seed(root, project, b);
    let creates = 0;
    serve((op) => {
      assert.equal(op, "action.create"); creates += 1;
      return Response.json({ ok: true, data: { success: true, actionId: id, title: "Fixture", editVersion: 7 } });
    });
    await runWithAgentRequestContextAsync({ cwd: root }, async () => {
      bindQkrpcTarget({ gateway: base, binding: a });
      const first = await executeQkrpcActionManageTool({ action: "create", title: "Fixture" });
      assert.equal(first.ok, false);
      assert.match(JSON.stringify(first), /"hostAction":true/);
      assert.equal(wasActionCreatedThisTurn(), true);
      const again = await executeQkrpcActionManageTool({ action: "create", title: "Fixture" });
      assert.equal(again.ok, false);
      assert.equal(creates, 1);
      assert.deepEqual((await readActionProjectBinding(project, id)).hostBinding, b);
    });
  });
});

test("real Write and StrReplace protect portable legacy binding sidecars and all canonical aliases", async () => {
  await fixture(async (root) => runWithAgentRequestContextAsync({ cwd: root }, async () => {
    const directory = "portable/.qkrpc";
    await mkdir(join(root, directory), { recursive: true });
    const path = `${directory}/project-binding.json`;
    const before = JSON.stringify(record());
    await writeFile(join(root, path), before);
    const options = { toolCallId: "portable-binding-guard", messages: [] };
    const deny = async (candidate: string) => {
      for (const output of [
        await WRITE_TOOL_DEF.execute!({ path: candidate, content: "changed" }, options),
        await STR_REPLACE_TOOL_DEF.execute!({ path: candidate, oldString: "schemaVersion", newString: "changed" }, options),
      ]) { assert.ok(isStructuredToolResult(output)); assert.equal(output.ok, false, candidate); }
    };
    await deny(path);
    await deny("portable/.qkrpc/./project-binding.json");
    await symlink(join(root, directory), join(root, "portable-alias"), process.platform === "win32" ? "junction" : "dir");
    await deny("portable-alias/project-binding.json");
    await deny(`${path}::$DATA`);
    await link(join(root, path), join(root, "hardlink-alias.json"));
    await deny("hardlink-alias.json");
    assert.equal(await readFile(join(root, path), "utf8"), before);
  }));
});

test("fresh status, pull and push reuse durable A without discovering surviving B and retain one exact directory", async () => {
  await fixture(async (root) => {
    const directory = ".quicker/actions/named-project";
    await seed(root, directory);
    const calls: string[] = [];
    serve((op, args) => {
      calls.push(op);
      if (op === "action.extract" || op === "action.apply" || op === "action.validate")
        assert.equal(args.dir, join(root, directory));
      if (op === "action.get") return Response.json({ ok: true, data: { success: true, editVersion: 7, compressed: { title: "Fixture", description: "", icon: "" } } });
      return Response.json({ ok: true, data: { success: true, editVersion: 8, projectDirectory: directory } });
    });
    assert.equal((await runWithAgentRequestContextAsync({ cwd: root }, () => getActionProjectSyncStatus(id))).ok, true);
    assert.equal((await runWithAgentRequestContextAsync({ cwd: root }, () => pullActionProjectToWorkspace(id))).ok, true);
    assert.equal((await runWithAgentRequestContextAsync({ cwd: root }, () => saveActionFromWorkspace({ id }))).ok, true);
    assert.deepEqual(calls, ["action.get", "action.extract", "action.validate", "action.get", "action.apply"]);
    assert.equal((await readFile(join(root, directory, ACTION_PROJECT_BINDING_PATH), "utf8")), JSON.stringify(record()));
  });
});

test("unavailable persisted A never discovers or writes B; explicit fresh B conflicts while an already-bound A stays A", async () => {
  await fixture(async (root) => {
    await seed(root);
    let calls = 0;
    serve(() => { calls += 1; return Response.json({ ok: false, error: "HOST_UNAVAILABLE", message: "Bound A is offline" }); });
    const status = await runWithAgentRequestContextAsync({ cwd: root }, () => getActionProjectSyncStatus(id));
    assert.equal(status.ok, false);
    if (!status.ok) assert.equal(status.code, "HOST_UNAVAILABLE");
    assert.equal(calls, 1);
    process.env.QKRPC_HOST_SESSION = b.hostSessionId;
    const conflict = await runWithAgentRequestContextAsync({ cwd: root }, () => getActionProjectSyncStatus(id));
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.code, "HOST_BINDING_MISMATCH");
    assert.equal(calls, 1);
    await runWithAgentRequestContextAsync({ cwd: root }, async () => {
      bindQkrpcTarget({ gateway: base, binding: a });
      pinActionProjectBinding(a);
      assert.equal(currentQkrpcTarget()?.binding.hostSessionId, a.hostSessionId);
    });
  });
});

test("duplicate GUID projects and explicit foreign directories fail before RPC or local writes", async () => {
  await fixture(async (root) => {
    await seed(root);
    await seed(root, ".quicker/actions/second");
    await runWithAgentRequestContextAsync({ cwd: root }, async () => {
      await assert.rejects(findActionProjectBinding(id), /PROJECT_SELECTION_REQUIRED/);
      assert.equal((await saveActionFromWorkspace({ id })).ok, false);
      assert.equal((await syncActionToWorkspace(id)).ok, false);
    });
    await rm(join(root, ".quicker/actions/second"), { recursive: true });
    const otherId = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
    const foreign = ".quicker/actions/foreign";
    await seed(root, foreign, b);
    await writeFile(join(root, foreign, "info.json"), info.replace(id, otherId));
    await writeFile(join(root, foreign, ACTION_PROJECT_BINDING_PATH), JSON.stringify({ ...record(b), actionId: otherId }));
    await runWithAgentRequestContextAsync({ cwd: root }, async () => {
      const result = await syncActionToWorkspace(otherId, { projectDirectory: project });
      assert.equal(result.ok, false);
    });
    assert.equal(await readFile(join(root, project, "data.json"), "utf8"), body);
  });
});

test("create-new lease excludes competing writers and a failed sidecar commit reports local persistence without provenance", async () => {
  await fixture(async (root) => runWithAgentRequestContextAsync({ cwd: root }, async () => {
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    const first = withActionProjectBootstrap(project, id, a, async () => { enter(); await held; await writeFile(join(root, project, "data.json"), body); });
    await entered;
    try { await assert.rejects(withActionProjectBootstrap(project, id, b, async () => { throw new Error("Must not enter competing writer"); }), /PROJECT_BUSY/); }
    finally { release(); }
    await first;
    assert.equal((await readActionProjectBinding(project, id)).hostBinding.hostSessionId, a.hostSessionId);
    const failed = ".quicker/actions/failed";
    await assert.rejects(withActionProjectBootstrap(failed, id, a, async () => {
      await writeFile(join(root, failed, "data.json"), body);
      await writeFile(join(root, failed, ".qkrpc"), "not a directory");
    }), (error: unknown) => {
      assert.deepEqual((error as { persistedParts: unknown }).persistedParts, { localProject: true, binding: false });
      return /PROJECT_BINDING_WRITE_FAILED/.test(String(error));
    });
    assert.equal(await readFile(join(root, failed, "data.json"), "utf8"), body);
    assert.ok(!(await readdir(join(root, failed))).includes(".qkrpc-project.lock"));
  }));
});

test("tool-managed sidecar cannot be overwritten through normalized, junction, hardlink or ADS aliases", async () => {
  await fixture(async (root) => {
    await seed(root);
    await runWithAgentRequestContextAsync({ cwd: root }, async () => {
      const target = join(root, project, ACTION_PROJECT_BINDING_PATH);
      const before = await readFile(target, "utf8");
      assert.equal((await guardActionProjectBindingWrite(`${project}/.qkrpc/./project-binding.json`)).ok, false);
      await link(target, join(root, "binding-alias.json"));
      assert.equal((await guardActionProjectBindingWrite("binding-alias.json")).ok, false);
      await symlink(join(root, project, ".qkrpc"), join(root, "binding-junction"), process.platform === "win32" ? "junction" : "dir");
      assert.equal((await guardActionProjectBindingWrite("binding-junction/project-binding.json")).ok, false);
      assert.equal((await guardActionProjectBindingWrite(`${project}/${ACTION_PROJECT_BINDING_PATH}::$DATA`)).ok, false);
      assert.equal(await readFile(target, "utf8"), before);
    });
  });
});
