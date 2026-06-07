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
const limit = Number.parseInt(
  process.argv.find((a) => a.startsWith("--limit="))?.slice("--limit=".length) ?? "500",
  10,
);

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

const search = qkrpcJson(["step-runner", "search", "--query", "*", "--limit", String(limit)]);
if (!search.ok) {
  throw new Error("step-runner search failed");
}
const keys = (search.payload?.items ?? [])
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
