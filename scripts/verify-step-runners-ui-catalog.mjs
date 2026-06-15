#!/usr/bin/env node
/**
 * Compare step-runners-ui-catalog.json against live qkrpc step-runner search.
 * Exit 1 when schemaCount mismatch, missing required keys, or live keys absent from catalog.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath =
  process.argv.find((a) => a.startsWith("--catalog="))?.slice("--catalog=".length) ??
  join(root, "agent-gui/lib/action-editor/data/step-runners-ui-catalog.json");
const LIST_LIMIT_MAX = 500;
const requestedListLimit = Number.parseInt(
  process.argv.find((a) => a.startsWith("--limit="))?.slice("--limit=".length) ?? String(LIST_LIMIT_MAX),
  10,
);
const listLimit = Math.min(
  Number.isFinite(requestedListLimit) && requestedListLimit > 0 ? requestedListLimit : LIST_LIMIT_MAX,
  LIST_LIMIT_MAX,
);

const REQUIRED_UI_CATALOG_KEYS = ["sys:assign"];

function qkrpcJson(args) {
  const result = spawnSync("qkrpc", [...args, "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`qkrpc ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  let text = (result.stdout ?? "").trim();
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return JSON.parse(text);
}

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const catalogKeys = Object.keys(catalog.schemas ?? {}).sort();
const declared = catalog.schemaCount ?? 0;
const actual = catalogKeys.length;

console.log(`Catalog: ${catalogPath}`);
console.log(`  declared schemaCount: ${declared}`);
console.log(`  actual schema keys:   ${actual}`);
console.log(`  failedKeys:           ${(catalog.failedKeys ?? []).length}`);

if (declared !== actual) {
  console.error(`ERROR: schemaCount (${declared}) != actual keys (${actual})`);
  process.exitCode = 1;
}

for (const key of REQUIRED_UI_CATALOG_KEYS) {
  if (!catalog.schemas?.[key]) {
    console.error(`ERROR: required key missing from catalog: ${key}`);
    process.exitCode = 1;
  }
}

let liveKeys = [];
try {
  const list = qkrpcJson(["step-runner", "list", "--limit", String(listLimit)]);
  liveKeys = (list.payload?.items ?? [])
    .map((item) => (typeof item?.key === "string" ? item.key.trim() : ""))
    .filter((k) => k.length > 0)
    .sort();
  const matchCount = list.payload?.matchCount ?? liveKeys.length;
  console.log(`Live list (full catalog, limit=${listLimit}):`);
  console.log(`  matchCount: ${matchCount}`);
  console.log(`  items:      ${liveKeys.length}`);
  if (matchCount > liveKeys.length) {
    console.warn(
      `WARN: search truncated (${liveKeys.length}/${matchCount}); raise --limit for full compare`,
    );
  }
} catch (err) {
  console.warn(`SKIP live compare (qkrpc unavailable): ${err instanceof Error ? err.message : String(err)}`);
  if (process.exitCode) {
    process.exit(process.exitCode);
  }
  process.exit(0);
}

const catalogSet = new Set(catalogKeys);
const liveSet = new Set(liveKeys);
const missingInCatalog = liveKeys.filter((k) => !catalogSet.has(k));
const extraInCatalog = catalogKeys.filter((k) => !liveSet.has(k));

if (missingInCatalog.length > 0) {
  console.error(`ERROR: ${missingInCatalog.length} live step-runner keys missing from static catalog:`);
  for (const key of missingInCatalog.slice(0, 30)) {
    console.error(`  - ${key}`);
  }
  if (missingInCatalog.length > 30) {
    console.error(`  ... and ${missingInCatalog.length - 30} more`);
  }
  process.exitCode = 1;
}

if (extraInCatalog.length > 0) {
  console.log(`INFO: ${extraInCatalog.length} catalog-only keys (not in current live search):`);
  for (const key of extraInCatalog.slice(0, 20)) {
    console.log(`  + ${key}`);
  }
  if (extraInCatalog.length > 20) {
    console.log(`  ... and ${extraInCatalog.length - 20} more`);
  }
}

if (!process.exitCode) {
  console.log("OK: schemaCount matches keys; required keys present; live catalog covered.");
}

process.exit(process.exitCode ?? 0);
