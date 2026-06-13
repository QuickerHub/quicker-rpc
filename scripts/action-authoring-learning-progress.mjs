#!/usr/bin/env node
/**
 * Track / resume action-level learning (patterns, library, skills).
 *
 * Usage:
 *   node scripts/action-authoring-learning-progress.mjs
 *   node scripts/action-authoring-learning-progress.mjs --next
 *   node scripts/action-authoring-learning-progress.mjs --mark-done <queue-id>
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROGRESS_PATH = path.join(
  ROOT,
  "docs/authoring-references/action-patterns/.learning-progress.json",
);

function parseArgs(argv) {
  const doneIdx = argv.indexOf("--mark-done");
  return {
    next: argv.includes("--next"),
    markDone: doneIdx >= 0 ? argv[doneIdx + 1] : undefined,
  };
}

async function loadProgress() {
  const raw = await fs.readFile(PROGRESS_PATH, "utf8");
  return JSON.parse(raw);
}

async function saveProgress(data) {
  data.updatedAt = new Date().toISOString();
  await fs.writeFile(PROGRESS_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function pendingQueue(data) {
  const queue = data.queue ?? [];
  return queue.filter((item) => item.status === "pending");
}

function summarize(data) {
  const patterns = Object.values(data.patterns ?? {});
  const done = patterns.filter((p) => p.status === "done").length;
  const pending = pendingQueue(data);
  console.log(
    JSON.stringify(
      {
        patternsDone: done,
        patternsTotal: patterns.length,
        queuePending: pending.length,
        queue: pending.map((q) => ({ id: q.id, type: q.type, title: q.title })),
        plan: data.plan,
        retro: data.authoringTasksEval?.retro,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const { next, markDone } = parseArgs(process.argv.slice(2));
  const data = await loadProgress();

  if (markDone) {
    const item = (data.queue ?? []).find((q) => q.id === markDone);
    if (!item) {
      console.error(`unknown queue id: ${markDone}`);
      process.exit(1);
    }
    item.status = "done";
    item.completedAt = new Date().toISOString();
    await saveProgress(data);
    console.log(`marked done: ${markDone}`);
    return;
  }

  const pending = pendingQueue(data);

  if (next) {
    if (pending.length === 0) {
      console.log("ALL_DONE");
      return;
    }
    const batch = pending.slice(0, data.batchSize ?? 2);
    console.log(
      JSON.stringify(
        {
          batch: batch.map((q) => ({
            id: q.id,
            type: q.type,
            title: q.title,
            params: q.params ?? {},
          })),
          remaining: pending.length - batch.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  summarize(data);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
