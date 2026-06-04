#!/usr/bin/env node
/**
 * Poll frontend smoke until ok or max attempts (for agent / CI heal loops).
 * Usage: node scripts/dev-heal-loop.mjs [--interval 3000] [--max 30]
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const smokeScript = join(root, "scripts", "frontend-smoke.mjs");

function readArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const intervalMs = Number(readArg("--interval", "3000"));
const maxAttempts = Number(readArg("--max", "30"));

function runSmokeOnce() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [smokeScript], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("close", (code) => {
      try {
        resolve({ code: code ?? 1, body: JSON.parse(stdout) });
      } catch {
        resolve({ code: code ?? 1, body: { ok: false, issues: [{ message: stdout || "smoke failed" }] } });
      }
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await runSmokeOnce();
    if (result.body.ok) {
      console.log(JSON.stringify({ ok: true, attempt, ...result.body }, null, 2));
      process.exit(0);
    }
    console.error(
      `[dev-heal-loop] attempt ${attempt}/${maxAttempts} failed:`,
      result.body.issues?.map((i) => i.message).join(" | ") ?? "unknown",
    );
    if (attempt < maxAttempts) {
      await sleep(intervalMs);
    } else {
      console.log(JSON.stringify({ ok: false, attempt, ...result.body }, null, 2));
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
