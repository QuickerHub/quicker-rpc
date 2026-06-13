#!/usr/bin/env node
/**
 * Initialize .learning-progress.json for the module-learning loop.
 *
 * One entry per step-runner module. Modules that already have an
 * authored/<id>.md start as "done"; everything else is "pending".
 * The learning subagent later resolves each pending module to either
 * "done" (authored ref written) or "skipped" (step-runner get suffices).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRefId, KEYWORDS_PATH } from "./step-module-authored-discovery.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROGRESS_PATH = path.join(
  ROOT,
  "docs/authoring-references/step-modules/.learning-progress.json",
);
const KC_DIR = path.join(ROOT, "docs/authoring-references/step-modules/kc");
const AUTHORED_DIR = path.join(
  ROOT,
  "docs/authoring-references/step-modules/authored",
);

/**
 * Modules whose UI is interactive (dialogs, screen capture, recording);
 * live-run verification is skipped for these — distill from kc + get only.
 * @param {string} key
 */
function liveRunAllowed(key) {
  const interactive = new Set([
    "sys:MsgBox",
    "sys:form",
    "sys:userInput",
    "sys:select",
    "sys:showmenu",
    "sys:showWaitWin",
    "sys:manageList",
    "sys:selectFile",
    "sys:selectFolder",
    "sys:screenCapture",
    "sys:screenCapturePro",
    "sys:record",
    "sys:recordSound",
    "sys:whiteboard",
    "sys:waitKeyboard",
    "sys:waitClipboardChange",
    "sys:textSelectTools",
    "sys:custompanel",
    "sys:customwindow",
    "sys:webview2",
  ]);
  return !interactive.has(key);
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
  const batchSize = 2;
  let batch = 1;
  let n = 0;

  for (const key of keys) {
    const id = buildRefId(key);
    const hasAuthored = await fileExists(path.join(AUTHORED_DIR, `${id}.md`));
    // Already-authored modules don't consume batch slots.
    if (!hasAuthored && ++n > batchSize) {
      n = 1;
      batch++;
    }
    modules[id] = {
      key,
      batch: hasAuthored ? 0 : batch,
      hasKc: await fileExists(path.join(KC_DIR, `${id}.md`)),
      liveRun: liveRunAllowed(key),
      status: hasAuthored ? "done" : "pending",
    };
  }

  const data = {
    version: 1,
    goal:
      "Learn every step-runner module (kc + step-runner get + optional live run) and distill into authored/<id>.md per SPEC.md, or record skip reason when get suffices",
    plan: "docs/superpowers/plans/2026-06-13-step-module-learning.md",
    updatedAt: new Date().toISOString(),
    batchSize,
    modules,
  };

  await fs.writeFile(PROGRESS_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");

  const total = keys.length;
  const done = Object.values(modules).filter((m) => m.status === "done").length;
  console.log(
    `initialized ${total} modules (${done} already authored), batchSize=${batchSize}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
