#!/usr/bin/env node
/** Refresh quickerbench-tasks.json oracle via oracle script (fixture-based). */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const taskId = process.argv[2] ?? "user-action-likes-total";

if (taskId !== "user-action-likes-total") {
  console.error(`Only user-action-likes-total is supported; got: ${taskId}`);
  process.exit(1);
}

const oracleScript = join(
  repoRoot,
  "scripts/quickerbench/oracle-user-action-likes-total.mjs",
);
const result = spawnSync(process.execPath, [oracleScript, "--sync"], {
  cwd: repoRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

process.stdout.write(result.stdout);
