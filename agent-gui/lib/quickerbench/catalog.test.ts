import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  loadFixtureManifest,
  loadQuickerBenchTask,
  QUICKERBENCH_CORE_TASK_IDS,
  resolveQuickerBenchTaskIds,
  syncTaskOracleFromManifest,
} from "./catalog";

test("quickerbench core preset resolves core IO tasks", () => {
  const ids = resolveQuickerBenchTaskIds({ preset: "quickerbench-core" });
  assert.deepEqual(ids, [...QUICKERBENCH_CORE_TASK_IDS]);
});

test("user-action-likes fixture manifest matches task oracle", () => {
  const task = loadQuickerBenchTask("user-action-likes-total");
  const manifest = loadFixtureManifest("getquicker-user-actions/113342-cea");
  assert.equal(manifest.parsedCount, 117);
  assert.equal(manifest.totalLikes, 9270);
  const synced = syncTaskOracleFromManifest(task);
  assert.equal(synced.oracle.outputVars?.totalLikes, 9270);
  assert.equal(synced.oracle.outputVars?.actionCount, 117);
});

test("oracle script matches fixture manifest for user-action-likes-total", () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const script = join(
    repoRoot,
    "scripts/quickerbench/oracle-user-action-likes-total.mjs",
  );
  const result = spawnSync(process.execPath, [script], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout) as {
    oracle: { totalLikes: number; actionCount: number };
  };
  const task = loadQuickerBenchTask("user-action-likes-total");
  assert.equal(report.oracle.totalLikes, task.oracle.outputVars?.totalLikes);
  assert.equal(report.oracle.actionCount, task.oracle.outputVars?.actionCount);
});

test("quickerbench tasks declare ioContract outputs", () => {
  for (const id of QUICKERBENCH_CORE_TASK_IDS) {
    const task = loadQuickerBenchTask(id);
    assert.ok(task.ioContract.inputs.length > 0, id);
    assert.ok(task.ioContract.outputs.length > 0, id);
    assert.ok(task.verify.mockProfile.length > 0, id);
  }
});
