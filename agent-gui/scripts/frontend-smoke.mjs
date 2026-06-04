#!/usr/bin/env node
/**
 * Probe local agent-gui dev server and print structured smoke result.
 * Usage: node scripts/frontend-smoke.mjs [--url http://127.0.0.1:3000]
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const localDir = join(root, ".local");

function readDevServerUrl() {
  const path = join(localDir, "dev-server.json");
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return typeof data.url === "string" ? data.url : null;
  } catch {
    return null;
  }
}

function resolveBaseUrl() {
  const argIdx = process.argv.indexOf("--url");
  if (argIdx >= 0 && process.argv[argIdx + 1]) {
    return process.argv[argIdx + 1].replace(/\/$/, "");
  }
  const fromFile = readDevServerUrl();
  if (fromFile) return fromFile.replace(/\/$/, "");
  const port = process.env.PORT?.trim() || "3000";
  const host = process.env.HOSTNAME?.trim() || "127.0.0.1";
  return `http://${host}:${port}`;
}

async function main() {
  const baseUrl = resolveBaseUrl();
  const endpoint = `${baseUrl}/api/dev/frontend-check`;
  const res = await fetch(endpoint, { cache: "no-store" });
  const body = await res.json();
  console.log(JSON.stringify(body, null, 2));
  process.exit(body.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
