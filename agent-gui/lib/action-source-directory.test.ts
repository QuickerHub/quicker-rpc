import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { resolveActionSourceDirectory } from "./action-source-directory.server";
import { validateActionSourceDirectory } from "./action-source-directory";
import { runWithQkrpcCwdAsync } from "./qkrpc-request-context";
import { createQkrpcActionSourceTools } from "./qkrpc-action-source-tool";
import { formatLocalToolResult, isStructuredToolResult } from "./tool-result";

test("source paths verify every existing ancestor before transport, including missing suffixes", async () => {
  const sandbox = await mkdtemp(join(tmpdir(), "agent-source-directory-"));
  const root = join(sandbox, "workspace");
  const outside = join(sandbox, "outside");
  await mkdir(join(root, ".tmp"), { recursive: true });
  await mkdir(join(root, ".quicker", "actions"), { recursive: true });
  await mkdir(join(root, "safe"), { recursive: true });
  await mkdir(outside);
  await writeFile(join(root, ".tmp", "not-directory"), "fixture");
  const linkType = process.platform === "win32" ? "junction" : "dir";
  await symlink(outside, join(root, ".tmp", "external"), linkType);
  await symlink(join(root, ".quicker", "actions"), join(root, ".tmp", "legacy"), linkType);
  await symlink(join(root, "safe"), join(root, ".tmp", "safe-alias"), linkType);
  const rootAlias = join(sandbox, "workspace-alias");
  await symlink(root, rootAlias, linkType);
  let calls = 0;
  const tools = createQkrpcActionSourceTools({
    resolveDirectory: resolveActionSourceDirectory,
    run: async () => { calls += 1; return formatLocalToolResult({ ok: true, dryRun: true }); },
  });
  try {
    await runWithQkrpcCwdAsync(root, async () => {
      for (const dir of [".tmp/external", ".tmp/external/missing/new", ".tmp/legacy/missing", ".tmp/not-directory/new"]) {
        const result = await tools.qkrpc_action_save.execute!({ dir, dryRun: true }, { toolCallId: "path-test", messages: [] });
        assert.ok(isStructuredToolResult(result));
        assert.equal(result.ok, false);
      }
      assert.equal(calls, 0);
      const allowed = await resolveActionSourceDirectory(".tmp/safe-alias/new");
      assert.ok(allowed.ok);
      assert.equal(allowed.absolute, join(await realpath(root), "safe", "new"));
      await assert.rejects(lstat(allowed.absolute), { code: "ENOENT" });
    });
    await runWithQkrpcCwdAsync(rootAlias, async () => {
      const allowed = await resolveActionSourceDirectory(".tmp/new-source");
      assert.ok(allowed.ok);
      assert.equal(allowed.absolute, join(await realpath(root), ".tmp", "new-source"));
      assert.equal(allowed.relative, ".tmp/new-source");
    });
  } finally {
    assert.equal(dirname(sandbox), resolve(tmpdir()));
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("pre-cancelled directory validation never inspects filesystem or runs host calls", async () => {
  const root = resolve("source-test-workspace");
  let inspections = 0;
  const fs = {
    lstat: async () => { inspections += 1; throw new Error("unexpected metadata read"); },
    realpath: async () => { inspections += 1; throw new Error("unexpected metadata read"); },
  };
  const controller = new AbortController();
  const reason = new Error("source stopped");
  controller.abort(reason);
  await assert.rejects(validateActionSourceDirectory(root, {
    ok: true, relative: ".tmp/source", absolute: join(root, ".tmp/source"),
  }, fs, controller.signal), (error) => error === reason);
  assert.equal(inspections, 0);
});
