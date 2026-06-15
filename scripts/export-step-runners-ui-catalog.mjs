#!/usr/bin/env node
/**
 * Export step-runner get-ui schemas for agent-gui static catalog.
 * Prereq: Quicker + QuickerRpc plugin; qkrpc on PATH.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile =
  process.argv.find((a) => a.startsWith("--out="))?.slice("--out=".length) ??
  join(root, "agent-gui/lib/action-editor/data/step-runners-ui-catalog.json");
/** Full catalog listing (not keyword search). */
const LIST_LIMIT_MAX = 500;
const requestedListLimit = Number.parseInt(
  process.argv.find((a) => a.startsWith("--limit="))?.slice("--limit=".length) ?? String(LIST_LIMIT_MAX),
  10,
);
const listLimit = Math.min(
  Number.isFinite(requestedListLimit) && requestedListLimit > 0 ? requestedListLimit : LIST_LIMIT_MAX,
  LIST_LIMIT_MAX,
);

/** Core modules that must appear in the static UI catalog (regression guard). */
const REQUIRED_UI_CATALOG_KEYS = ["sys:assign"];

function qkrpcJson(args) {
  const result = spawnSync("qkrpc", [...args, "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`qkrpc ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  const text = (result.stdout ?? "").trim();
  if (!text.startsWith("{")) {
    throw new Error(`qkrpc returned non-JSON: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
}

function readVersion() {
  try {
    const v = JSON.parse(readFileSync(join(root, "version.json"), "utf8"));
    return typeof v.QuickerRpc === "string" ? v.QuickerRpc : "";
  } catch {
    return "";
  }
}

console.log("=== Export step-runner UI catalog ===");
console.log(`Output: ${outFile}`);

const list = qkrpcJson(["step-runner", "list", "--limit", String(listLimit)]);
if (!list.ok) {
  throw new Error("step-runner list failed");
}
const keys = (list.payload?.items ?? [])
  .map((item) => (typeof item?.key === "string" ? item.key.trim() : ""))
  .filter((k) => k.length > 0);
console.log(`Found ${keys.length} step-runner keys`);

const schemas = {};
const failedKeys = [];
for (let i = 0; i < keys.length; i++) {
  const key = keys[i];
  process.stdout.write(`[${i + 1}/${keys.length}] ${key}\n`);
  try {
    const detail = qkrpcJson(["step-runner", "get-ui", "--key", key]);
    if (!detail.ok || !detail.payload?.schema) {
      failedKeys.push(key);
      continue;
    }
    schemas[key] = detail.payload.schema;
  } catch (err) {
    console.warn(`  skip ${key}: ${err instanceof Error ? err.message : String(err)}`);
    failedKeys.push(key);
  }
}

for (const requiredKey of REQUIRED_UI_CATALOG_KEYS) {
  if (!schemas[requiredKey]) {
    console.warn(`Required key missing after export, fetching: ${requiredKey}`);
    try {
      const detail = qkrpcJson(["step-runner", "get-ui", "--key", requiredKey]);
      if (detail.ok && detail.payload?.schema) {
        schemas[requiredKey] = detail.payload.schema;
        const idx = failedKeys.indexOf(requiredKey);
        if (idx >= 0) {
          failedKeys.splice(idx, 1);
        }
      } else {
        failedKeys.push(requiredKey);
      }
    } catch (err) {
      console.warn(`  required ${requiredKey} failed: ${err instanceof Error ? err.message : String(err)}`);
      if (!failedKeys.includes(requiredKey)) {
        failedKeys.push(requiredKey);
      }
    }
  }
}

const missingRequired = REQUIRED_UI_CATALOG_KEYS.filter((key) => !schemas[key]);
if (missingRequired.length > 0) {
  throw new Error(`Required UI catalog keys missing: ${missingRequired.join(", ")}`);
}

if (Object.keys(schemas).length === 0) {
  throw new Error("No schemas exported. Is Quicker running with QuickerRpc plugin loaded?");
}

const out = {
  version: 1,
  generatedAt: new Date().toISOString(),
  qkrpcVersion: readVersion(),
  schemaCount: Object.keys(schemas).length,
  failedKeys,
  schemas,
};

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(out, null, 2)}\n`, "utf8");
console.log(`Wrote ${out.schemaCount} schemas (${failedKeys.length} failed)`);
