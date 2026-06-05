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

/** @type {Set<string>} */
export const FORCE_KEEP = new Set([
  "sys:http",
  "sys:download",
  "sys:websocket",
  "sys:httpserver",
  "sys:smtp",
  "sys:ai",
  "sys:tempcloudstore",
  "sys:cloud_oss",
  "sys:webview2",
  "sys:fileOperation",
  "sys:zip",
  "sys:stringProcess",
  "sys:form",
  "sys:uiautomation",
  "sys:flauiautomation",
  "sys:searchBmp",
  "sys:chromecontrol",
  "sys:csscript",
  "sys:pythonscript",
  "sys:jsscript",
  "sys:runScript",
  "sys:subprogram",
  "sys:excelreadwrite",
  "sys:excelRange",
  "sys:excelObjects",
  "sys:officehelper",
  "sys:adobesoftscontrol",
  "sys:autocadcontrol",
  "sys:rhinocontrol",
  "sys:htmlExtract",
  "sys:jsonExtract",
  "sys:regexExtract",
  "sys:enc",
  "sys:basic-ocr",
  "sys:mathocr",
  "sys:imgProcess",
  "sys:translation",
  "sys:dboperation",
  "sys:tableoperation",
  "sys:customwindow",
  "sys:custompanel",
  "sys:record",
  "sys:playRecords",
  "sys:inputScript",
]);

async function main() {
  const keywords = JSON.parse(await fs.readFile(KEYWORDS_PATH, "utf8"));
  const keys = Object.keys(keywords);
  const skip = keys.filter((k) => !FORCE_KEEP.has(k)).sort();
  const keep = keys.filter((k) => FORCE_KEEP.has(k)).sort();

  await fs.writeFile(
    OUT_PATH,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        rationale:
          "Per-module reference omitted when qkrpc_step_runner_get input/output purpose fields are sufficient. KEEP = KC adds protocol / multi-mode usage beyond get.",
        skip,
        keep,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`modules=${keys.length} keep=${keep.length} skip=${skip.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
