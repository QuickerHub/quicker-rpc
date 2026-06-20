#!/usr/bin/env node
/**
 * QuickerBench oracle: user-action-likes-total
 *
 * CI / mock assert uses frozen fixture + cached outputVars in quickerbench-tasks.json.
 * This script recomputes oracle from fixtures (default) or live URL (maintainers).
 *
 * Examples:
 *   node scripts/quickerbench/oracle-user-action-likes-total.mjs
 *   node scripts/quickerbench/oracle-user-action-likes-total.mjs --live
 *   node scripts/quickerbench/oracle-user-action-likes-total.mjs --sync
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeFromFixtureDir,
  computeFromLiveUrl,
} from "./lib/user-actions-likes.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const TASK_ID = "user-action-likes-total";
const DEFAULT_FIXTURE = join(
  repoRoot,
  "agent-gui/benchmarks/quickerbench-fixtures/getquicker-user-actions/113342-cea",
);
const DEFAULT_LIVE_URL = "https://getquicker.net/User/Actions/113342-Cea";
const TASKS_PATH = join(repoRoot, "agent-gui/benchmarks/quickerbench-tasks.json");

function parseArgs(argv) {
  const live = argv.includes("--live");
  const sync = argv.includes("--sync");
  const fixtureIdx = argv.indexOf("--fixture");
  const urlIdx = argv.indexOf("--url");
  return {
    live,
    sync,
    fixtureDir:
      fixtureIdx >= 0 ? argv[fixtureIdx + 1] : DEFAULT_FIXTURE,
    url: urlIdx >= 0 ? argv[urlIdx + 1] : DEFAULT_LIVE_URL,
  };
}

function syncTasksJson(oracle) {
  const catalog = JSON.parse(readFileSync(TASKS_PATH, "utf8"));
  const index = catalog.tasks.findIndex((t) => t.id === TASK_ID);
  if (index < 0) throw new Error(`Task not found: ${TASK_ID}`);

  const task = catalog.tasks[index];
  catalog.tasks[index] = {
    ...task,
    oracle: {
      ...task.oracle,
      outputVars: {
        totalLikes: oracle.totalLikes,
        actionCount: oracle.actionCount,
      },
      snapshot: {
        capturedAt: new Date().toISOString().slice(0, 10),
        note: `Synced by oracle script; parsed ${oracle.actionCount} actions.`,
      },
    },
  };

  writeFileSync(TASKS_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  return catalog.tasks[index].oracle;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = args.live
    ? await computeFromLiveUrl(args.url)
    : await computeFromFixtureDir(args.fixtureDir);

  if (args.sync) {
    const synced = syncTasksJson(report.oracle);
    console.log(JSON.stringify({ synced, report }, null, 2));
    return;
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
