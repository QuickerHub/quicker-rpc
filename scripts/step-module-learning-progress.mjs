#!/usr/bin/env node
/**
 * Track / resume the step-module learning loop (loop driver).
 *
 * Usage:
 *   node scripts/step-module-learning-progress.mjs                      # summary
 *   node scripts/step-module-learning-progress.mjs --next               # next pending ids (batch)
 *   node scripts/step-module-learning-progress.mjs --mark-done <id>...  # authored/<id>.md must exist
 *   node scripts/step-module-learning-progress.mjs --mark-skip <id> --reason "<why get suffices>"
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROGRESS_PATH = path.join(
  ROOT,
  "docs/authoring-references/step-modules/.learning-progress.json",
);
const AUTHORED_DIR = path.join(
  ROOT,
  "docs/authoring-references/step-modules/authored",
);

function parseArgs(argv) {
  const doneIdx = argv.indexOf("--mark-done");
  const skipIdx = argv.indexOf("--mark-skip");
  const reasonIdx = argv.indexOf("--reason");
  return {
    next: argv.includes("--next"),
    markDone:
      doneIdx >= 0
        ? argv.slice(doneIdx + 1).filter((a) => !a.startsWith("-"))
        : [],
    markSkip: skipIdx >= 0 ? argv[skipIdx + 1] : undefined,
    reason: reasonIdx >= 0 ? argv[reasonIdx + 1] : undefined,
  };
}

async function loadProgress() {
  return JSON.parse(await fs.readFile(PROGRESS_PATH, "utf8"));
}

async function saveProgress(data) {
  data.updatedAt = new Date().toISOString();
  await fs.writeFile(PROGRESS_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  const { next, markDone, markSkip, reason } = parseArgs(process.argv.slice(2));
  const data = await loadProgress();

  if (markDone.length > 0) {
    for (const id of markDone) {
      if (!data.modules[id]) {
        console.error(`unknown module id: ${id}`);
        process.exit(1);
      }
      try {
        await fs.access(path.join(AUTHORED_DIR, `${id}.md`));
      } catch {
        console.error(
          `missing authored file: authored/${id}.md (use --mark-skip if get suffices)`,
        );
        process.exit(1);
      }
      data.modules[id].status = "done";
    }
    await saveProgress(data);
    console.log(`marked done: ${markDone.join(", ")}`);
  }

  if (markSkip) {
    if (!data.modules[markSkip]) {
      console.error(`unknown module id: ${markSkip}`);
      process.exit(1);
    }
    if (!reason) {
      console.error("--mark-skip requires --reason \"<why get suffices>\"");
      process.exit(1);
    }
    data.modules[markSkip].status = "skipped";
    data.modules[markSkip].skipReason = reason;
    await saveProgress(data);
    console.log(`marked skipped: ${markSkip} (${reason})`);
  }

  const entries = Object.entries(data.modules);
  const resolved = entries.filter(
    ([, m]) => m.status === "done" || m.status === "skipped",
  ).length;
  const pending = entries
    .filter(([, m]) => m.status === "pending")
    .sort((a, b) => a[1].batch - b[1].batch || a[0].localeCompare(b[0]));

  console.log(`progress: ${resolved}/${entries.length} resolved`);

  if (next) {
    const batch = pending.slice(0, data.batchSize ?? 2).map(([id]) => id);
    if (batch.length === 0) {
      console.log("ALL_DONE");
      process.exit(0);
    }
    console.log(`next: ${batch.join(" ")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
