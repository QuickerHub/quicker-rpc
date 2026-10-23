import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import type { ToolExecutionOptions } from "ai";
import { createQkrpcActionSourceTools, actionSourceSaveSchema, formatActionSourceToolResult } from "./qkrpc-action-source-tool";
import { QKRPC_ACTION_OPEN_TOOL, QKRPC_ACTION_SAVE_TOOL, readActionSourceResult } from "./qkrpc-action-source";
import { qkrpcActionCommandDisplayName, formatQkrpcActionCommandResultMeta } from "./qkrpc-action-tool";
import { runWithQkrpcCwdAsync } from "./qkrpc-request-context";
import { resolveWorkspacePath } from "./workspace-fs";
import { formatLocalToolResult, isStructuredToolResult } from "./tool-result";
import { applyToolModeGuards } from "./agent-tool-mode-guard";
import { QKRPC_TOOL_REGISTRY } from "./tool-registry";
import { defaultAskToolIds, defaultLauncherToolIds } from "./chat-mode";
import { argvToInvoke } from "./qkrpc-argv";
import { validateAgentToolCatalog } from "./agent-tool-catalog";

const id = "846b4132-ad73-42e8-b2f9-c42fe718ae20";
const cwd = resolve(".tmp/source-tool-fixture");
const dir = ".tmp/quicker/edit-action";
const options = { toolCallId: "source-test", messages: [] } as ToolExecutionOptions;

function response(data: unknown, ok = true, stderr?: string) {
  return { ...formatLocalToolResult(data, ok, stderr), source: "qkrpc" };
}

test("open binds its bundle to request cwd and preserves sidecars/resources from the transport", async () => {
  const requests: { args: string[]; signal?: AbortSignal }[] = [];
  const payload = {
    ok: true, actionId: id, editVersion: 7, title: "Fixture", sourcePath: "fixture/program.source.yaml",
    writtenFiles: ["program.source.yaml", "quicker.source.json", ".qkrpc/baseline.json", "files/source-1.txt"],
    warnings: ["unmodeled native field retained"],
  };
  const tools = createQkrpcActionSourceTools({
    resolveDirectory: resolveWorkspacePath,
    run: async (args, opts) => { requests.push({ args, signal: opts.abortSignal }); return response(payload); },
  });
  const parent = new AbortController();
  const input = { id, dir, minLines: 0, noAutoFiles: true };
  const result = await runWithQkrpcCwdAsync(cwd, () => tools.qkrpc_action_open.execute!(input, { ...options, abortSignal: parent.signal }));
  assert.ok(isStructuredToolResult(result));
  assert.equal(result.ok, true);
  assert.equal(result.data, payload);
  assert.deepEqual(requests, [{
    args: ["action", "open", "--dir", resolve(cwd, dir), "--id", id, "--min-lines", "0", "--no-auto-files"],
    signal: parent.signal,
  }]);
  assert.deepEqual(input, { id, dir, minLines: 0, noAutoFiles: true });
  assert.match(result.summary!, /quicker.source.json/);
  assert.match(result.summary!, /baseline.json/);
  assert.deepEqual(result.nextActions?.[0]?.input, { path: `${dir}/program.source.yaml` });
});

test("dry-run and repeated saves keep the same directory and explicit transport intent", async () => {
  const requests: ReturnType<typeof argvToInvoke>[] = [];
  let version = 7;
  const remembered: string[] = [];
  const tools = createQkrpcActionSourceTools({
    resolveDirectory: resolveWorkspacePath,
    rememberDirectory: (directory) => { remembered.push(directory); },
    run: async (args) => {
      const invoke = argvToInvoke(args);
      assert.ok(invoke);
      requests.push(invoke);
      const dryRun = invoke.args.dryRun;
      if (!dryRun) version += 1;
      const payload = { ok: true, dryRun, actionId: id, editVersion: version, ...(dryRun ? {} : { persisted: true }) };
      return response({ ok: true, data: payload }); // CLI envelope, unlike the HTTP success above.
    },
  });
  await runWithQkrpcCwdAsync(cwd, async () => {
    const checked = await tools.qkrpc_action_save.execute!({ dir, dryRun: true }, options);
    assert.ok(isStructuredToolResult(checked));
    assert.equal(checked.ok, true);
    assert.equal(version, 7);
    assert.match(checked.summary!, /未写入 Quicker/);
    assert.deepEqual(checked.nextActions?.[0]?.input, { dir, dryRun: false });
    for (const expectedVersion of [8, 9]) {
      const saved = await tools.qkrpc_action_save.execute!({ dir, dryRun: false }, options);
      assert.ok(isStructuredToolResult(saved));
      assert.equal(saved.ok, true);
      assert.equal(readActionSourceResult(saved.data).payload.editVersion, expectedVersion);
      assert.match(saved.summary!, /本地基线已更新/);
    }
  });
  assert.deepEqual(requests.map((request) => request?.args), [
    { dir: resolve(cwd, dir), dryRun: true },
    { dir: resolve(cwd, dir), dryRun: false },
    { dir: resolve(cwd, dir), dryRun: false },
  ]);
  assert.ok(requests.every((request) => request?.op === "action.save"));
  assert.deepEqual(remembered, [resolve(cwd, dir)]);
});

test("source tools reject escaping/root/legacy paths and implicit writes before transport", async () => {
  let calls = 0;
  const tools = createQkrpcActionSourceTools({
    resolveDirectory: resolveWorkspacePath,
    run: async () => { calls += 1; return response({ ok: true }); },
  });
  await runWithQkrpcCwdAsync(cwd, async () => {
    for (const invalid of ["../outside", ".", " ", ".quicker/actions/a", resolve(cwd, "../outside")]) {
      const output = await tools.qkrpc_action_open.execute!({ id, dir: invalid }, options);
      assert.ok(isStructuredToolResult(output));
      assert.equal(output.ok, false);
    }
    const implicit = await tools.qkrpc_action_save.execute!({ dir } as never, options);
    assert.ok(isStructuredToolResult(implicit));
    assert.equal(implicit.ok, false);
    const force = await tools.qkrpc_action_save.execute!({ dir, dryRun: false, force: true } as never, options);
    assert.ok(isStructuredToolResult(force));
    assert.equal(force.ok, false);
  });
  assert.equal(actionSourceSaveSchema.safeParse({ dir }).success, false);
  assert.equal(calls, 0);
});

test("conflict, Designer protection and partial persistence remain failures without automatic retries", async () => {
  const failures = [
    { ok: false, error: "EDIT_VERSION_CONFLICT", message: "Changed", data: { versionConflict: true } },
    { ok: false, error: "DESIGNER_OPEN", message: "Close Designer before saving." },
    { ok: false, error: "SOURCE_CHECKPOINT_FAILED", message: "Checkpoint denied", data: { persisted: true, actionId: id, editVersion: 9 } },
    { ok: false, error: "TRANSPORT_TIMEOUT", message: "Timed out after write may have started." },
  ];
  let calls = 0;
  const tools = createQkrpcActionSourceTools({
    resolveDirectory: resolveWorkspacePath,
    run: async () => { const failure = failures[calls++]!; return response(failure, false, failure.message); },
  });
  await runWithQkrpcCwdAsync(cwd, async () => {
    for (const [index, failure] of failures.entries()) {
      const output = await tools.qkrpc_action_save.execute!({ dir, dryRun: false }, options);
      assert.ok(isStructuredToolResult(output));
      assert.equal(output.ok, false);
      assert.equal(output.data, failure);
      assert.equal(output.retryable, false);
      if (index === 0) assert.match(output.summary!, /版本冲突/);
      if (index === 1) assert.match(output.summary!, /Close Designer/);
      if (index === 2) {
        assert.match(output.summary!, /已写入 Quicker/);
        assert.equal(output.userDecisionRequired, true);
        assert.equal(readActionSourceResult(output.data).payload.persisted, true);
      }
      assert.equal(calls, index + 1);
    }
  });
});

test("a success without persistence confirmation is not presented as a saved action", async () => {
  const tools = createQkrpcActionSourceTools({
    resolveDirectory: resolveWorkspacePath, run: async () => response({ ok: true }),
  });
  const result = await runWithQkrpcCwdAsync(cwd, () => tools.qkrpc_action_save.execute!({ dir, dryRun: false }, options));
  assert.ok(isStructuredToolResult(result));
  assert.equal(result.ok, false);
  assert.match(result.summary!, /保存未确认/);
});

test("incomplete open and mismatched dry-run responses cannot claim successful offline validation", async () => {
  const responses = [{ ok: true }, { ok: true, dryRun: false, persisted: true }];
  const tools = createQkrpcActionSourceTools({
    resolveDirectory: resolveWorkspacePath, run: async () => response(responses.shift()),
  });
  await runWithQkrpcCwdAsync(cwd, async () => {
    const opened = await tools.qkrpc_action_open.execute!({ dir, id }, options);
    assert.ok(isStructuredToolResult(opened));
    assert.equal(opened.ok, false);
    const checked = await tools.qkrpc_action_save.execute!({ dir, dryRun: true }, options);
    assert.ok(isStructuredToolResult(checked));
    assert.equal(checked.ok, false);
    assert.match(checked.summary!, /已写入 Quicker/);
    assert.equal(checked.userDecisionRequired, true);
    assert.equal(checked.summary?.includes("未写入 Quicker"), false);
  });
});

test("pre-cancelled source tools never call transport and keep the abort reason", async () => {
  const controller = new AbortController();
  const reason = new Error("stop source edit");
  controller.abort(reason);
  let calls = 0;
  const tools = createQkrpcActionSourceTools({
    resolveDirectory: resolveWorkspacePath, run: async () => { calls += 1; return response({}); },
  });
  await assert.rejects(tools.qkrpc_action_save.execute!({ dir, dryRun: false }, { ...options, abortSignal: controller.signal }) as Promise<unknown>, (error) => error === reason);
  assert.equal(calls, 0);
});

test("live source connectivity failures retain recovery feedback while dry-run stays independent", async () => {
  const payload = { ok: false, error: "PLUGIN_NOT_RUNNING", message: "Fixture is disconnected" };
  const tools = createQkrpcActionSourceTools({
    resolveDirectory: resolveWorkspacePath, run: async () => response(payload, false, payload.message),
  });
  await runWithQkrpcCwdAsync(cwd, async () => {
    const live = await tools.qkrpc_action_save.execute!({ dir, dryRun: false }, options);
    assert.ok(isStructuredToolResult(live));
    assert.equal(live.data, payload);
    assert.equal(live.nextActions?.[0]?.tool, "qkrpc_wait");
    const offline = await tools.qkrpc_action_save.execute!({ dir, dryRun: true }, options);
    assert.ok(isStructuredToolResult(offline));
    assert.equal(offline.ok, false);
    assert.equal(offline.nextActions?.some((action) => action.tool === "qkrpc_wait") ?? false, false);
  });
});

test("source definitions align with registry write risk and Ask cannot invoke their adapters", async () => {
  let calls = 0;
  const definitions = createQkrpcActionSourceTools({
    resolveDirectory: resolveWorkspacePath, run: async () => { calls += 1; return response({}); },
  });
  const ids = [QKRPC_ACTION_OPEN_TOOL, QKRPC_ACTION_SAVE_TOOL];
  const registry = QKRPC_TOOL_REGISTRY.filter((entry) => ids.includes(entry.id));
  assert.equal(registry.length, 2);
  assert.ok(registry.every((entry) => entry.group === "write"));
  assert.deepEqual(validateAgentToolCatalog(registry, definitions), []);
  assert.ok(ids.every((entry) => !defaultAskToolIds().includes(entry) && !defaultLauncherToolIds().includes(entry)));
  const ask = applyToolModeGuards(definitions, "ask");
  for (const result of [
    await ask.qkrpc_action_open.execute!({ id, dir }, options),
    await ask.qkrpc_action_save.execute!({ dir, dryRun: true }, options),
    await ask.qkrpc_action_save.execute!({ dir, dryRun: false }, options),
  ]) {
    assert.ok(isStructuredToolResult(result));
    assert.equal(result.ok, false);
  }
  assert.equal(calls, 0);
});

test("existing command rows project YAML stages and partial persistence", () => {
  assert.equal(qkrpcActionCommandDisplayName(QKRPC_ACTION_OPEN_TOOL, { id, dir }), "打开源码");
  assert.equal(qkrpcActionCommandDisplayName(QKRPC_ACTION_SAVE_TOOL, { dir, dryRun: true }), "校验源码");
  assert.equal(qkrpcActionCommandDisplayName(QKRPC_ACTION_SAVE_TOOL, { dir, dryRun: false }), "保存源码");
  const meta = (payload: unknown, dryRun = false) => formatQkrpcActionCommandResultMeta(QKRPC_ACTION_SAVE_TOOL, { dir, dryRun }, payload as Record<string, unknown>);
  assert.match(meta({ ok: true, dryRun: true }, true)!, /未写入动作/);
  assert.match(meta({ ok: true, data: { ok: true, dryRun: false, persisted: true } })!, /本地基线已更新/);
  assert.match(meta({ ok: false, error: "EDIT_VERSION_CONFLICT", data: { versionConflict: true } })!, /未保存/);
  assert.match(meta({ ok: false, error: "SOURCE_CHECKPOINT_FAILED", data: { persisted: true } })!, /已写入动作.*勿重试/);
  assert.match(meta({ ok: false, persisted: true })!, /已写入动作.*勿重试/);
  assert.match(meta({ persisted: true })!, /已写入动作.*勿重试/);
  assert.match(meta({ ok: true, persisted: true, dryRun: true })!, /需核对/);
  assert.match(meta({ ok: true })!, /未确认/);
});

test("a failed outer transport result never claims a successful native checkpoint", () => {
  const native = { ok: true, dryRun: false, persisted: true, editVersion: 9 };
  const result = formatActionSourceToolResult("save", { dir, dryRun: false }, response(native, false, "CLI exited after payload"));
  assert.ok(isStructuredToolResult(result));
  assert.equal(result.data, native);
  assert.equal(result.ok, false);
  assert.match(result.summary!, /已写入 Quicker.*勿重试/);
  const meta = formatQkrpcActionCommandResultMeta(QKRPC_ACTION_SAVE_TOOL, { dir, dryRun: false }, native, result.ok);
  assert.match(meta!, /已写入动作.*需核对.*勿重试/);
  assert.equal(meta?.includes("本地基线已更新"), false);
});
