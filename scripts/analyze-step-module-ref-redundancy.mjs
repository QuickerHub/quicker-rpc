#!/usr/bin/env node
/**
 * Modules whose KC docs add cross-field / protocol detail beyond step-runner get.
 * All other modules: schema via qkrpc_step_runner_get only (no per-module reference file).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEYWORDS_PATH = path.join(
  ROOT,
  "QuickerRpc.AgentModel/Catalog/step-runner-agent-keywords.json",
);
const OUT_PATH = path.join(ROOT, "docs/action-authoring-src/step-module-skip.json");

/** Hand-maintained references under references/step-modules/authored/ (never KC-crawled). */
/** @type {Set<string>} */
export const AUTHORED = new Set([
  "sys:adobesoftscontrol",
  "sys:ai",
  "sys:autocadcontrol",
  "sys:basic-ocr",
  "sys:chromecontrol",
  "sys:cloud_oss",
  "sys:csscript",
  "sys:custompanel",
  "sys:customwindow",
  "sys:dboperation",
  "sys:download",
  "sys:enc",
  "sys:excelObjects",
  "sys:excelRange",
  "sys:excelreadwrite",
  "sys:fileOperation",
  "sys:flauiautomation",
  "sys:form",
  "sys:htmlExtract",
  "sys:http",
  "sys:httpserver",
  "sys:imgProcess",
  "sys:inputScript",
  "sys:jsonExtract",
  "sys:jsscript",
  "sys:mathocr",
  "sys:officehelper",
  "sys:playRecords",
  "sys:pythonscript",
  "sys:record",
  "sys:regexExtract",
  "sys:rhinocontrol",
  "sys:runScript",
  "sys:searchBmp",
  "sys:smtp",
  "sys:stringProcess",
  "sys:subprogram",
  "sys:tableoperation",
  "sys:tempcloudstore",
  "sys:translation",
  "sys:uiautomation",
  "sys:webview2",
  "sys:websocket",
  "sys:zip",
]);

/** KC crawl targets (empty when all keep modules are authored). */
/** @type {Set<string>} */
export const FORCE_KEEP = new Set([]);

async function main() {
  const keywords = JSON.parse(await fs.readFile(KEYWORDS_PATH, "utf8"));
  const keys = Object.keys(keywords);
  const authored = keys.filter((k) => AUTHORED.has(k)).sort();
  const skip = keys
    .filter((k) => !FORCE_KEEP.has(k) && !AUTHORED.has(k))
    .sort();
  const keep = keys.filter((k) => FORCE_KEEP.has(k)).sort();

  await fs.writeFile(
    OUT_PATH,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        rationale:
          "Per-module reference omitted when qkrpc_step_runner_get input/output purpose fields are sufficient. KEEP = KC crawl (docs:modules:gen). AUTHORED = hand-written under references/step-modules/authored/.",
        authored,
        skip,
        keep,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    `modules=${keys.length} authored=${authored.length} keep=${keep.length} skip=${skip.length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
