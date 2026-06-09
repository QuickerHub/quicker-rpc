#!/usr/bin/env node
/**
 * Initialize .examples-progress.json for ALL step-runner modules (143).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRefId, KEYWORDS_PATH } from "./step-module-authored-discovery.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROGRESS_PATH = path.join(
  ROOT,
  "docs/action-authoring-src/references/step-modules/.examples-progress.json",
);
const KC_DIR = path.join(
  ROOT,
  "docs/action-authoring-src/references/step-modules/kc",
);
const AUTHORED_DIR = path.join(
  ROOT,
  "docs/action-authoring-src/references/step-modules/authored",
);
const EXAMPLES_DIR = path.join(
  ROOT,
  "docs/action-authoring-src/references/step-modules/examples",
);

/** @param {string} key */
function minExamplesFor(key) {
  const complex = new Set([
    "sys:chromecontrol",
    "sys:http",
    "sys:fileOperation",
    "sys:excelreadwrite",
    "sys:inputScript",
    "sys:uiautomation",
    "sys:flauiautomation",
    "sys:ai",
  ]);
  if (complex.has(key)) return 4;
  return 2;
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const keywords = JSON.parse(await fs.readFile(KEYWORDS_PATH, "utf8"));
  /** @type {Record<string, unknown>} */
  const modules = {};

  const keys = Object.keys(keywords).sort((a, b) => a.localeCompare(b));
  let batch = 1;
  let n = 0;
  const batchSize = 2;

  for (const key of keys) {
    const id = buildRefId(key);
    if (++n > batchSize) {
      n = 1;
      batch++;
    }
    const hasKc = await fileExists(path.join(KC_DIR, `${id}.md`));
    const hasAuthored = await fileExists(path.join(AUTHORED_DIR, `${id}.md`));
    const hasExamples = await fileExists(path.join(EXAMPLES_DIR, `${id}.md`));
    modules[id] = {
      key,
      batch,
      minExamples: minExamplesFor(key),
      hasKc,
      hasAuthored,
      status: hasExamples ? "done" : "pending",
    };
  }

  const data = {
    version: 2,
    goal: "Write step JSON examples for all modules under references/step-modules/examples/",
    updatedAt: new Date().toISOString(),
    batchSize,
    modules,
  };

  await fs.mkdir(EXAMPLES_DIR, { recursive: true });
  await fs.writeFile(PROGRESS_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");

  const total = keys.length;
  const done = Object.values(modules).filter((m) => m.status === "done").length;
  console.log(`initialized ${total} modules (${done} already have examples/), batchSize=${batchSize}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
