#!/usr/bin/env node
/**
 * Track / resume step-module examples migration (loop driver).
 *
 * Usage:
 *   node scripts/step-module-examples-progress.mjs           # summary
 *   node scripts/step-module-examples-progress.mjs --next  # next pending ids (batch)
 *   node scripts/step-module-examples-progress.mjs --mark-done <id> [<id>...]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROGRESS_PATH = path.join(
  ROOT,
  "docs/action-authoring-src/references/step-modules/.examples-progress.json",
);
const EXAMPLES_DIR = path.join(
  ROOT,
  "docs/action-authoring-src/references/step-modules/examples",
);

function parseArgs(argv) {
  const markIdx = argv.indexOf("--mark-done");
  return {
    next: argv.includes("--next"),
    markDone:
      markIdx >= 0 ? argv.slice(markIdx + 1).filter((a) => !a.startsWith("-")) : [],
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

async function main() {
  const { next, markDone } = parseArgs(process.argv.slice(2));
  const data = await loadProgress();

  if (markDone.length > 0) {
    for (const id of markDone) {
      if (!data.modules[id]) {
        console.error(`unknown module id: ${id}`);
        process.exit(1);
      }
      data.modules[id].status = "done";
      try {
        await fs.access(path.join(EXAMPLES_DIR, `${id}.md`));
      } catch {
        console.error(`missing examples file: examples/${id}.md`);
        process.exit(1);
      }
    }
    await saveProgress(data);
    console.log(`marked done: ${markDone.join(", ")}`);
  }

  const entries = Object.entries(data.modules);
  const done = entries.filter(([, m]) => m.status === "done").length;
  const pending = entries
    .filter(([, m]) => m.status !== "done")
    .sort((a, b) => a[1].batch - b[1].batch || a[0].localeCompare(b[0]));

  console.log(`progress: ${done}/${entries.length} done`);

  if (next) {
    const batch = pending.slice(0, data.batchSize ?? 4).map(([id]) => id);
    if (batch.length === 0) {
      console.log("ALL_DONE");
      process.exit(0);
    }
    console.log(`next: ${batch.join(" ")}`);
  }

  if (entries.every(([, m]) => m.status === "done")) {
    process.exit(0);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
