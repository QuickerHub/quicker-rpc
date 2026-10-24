import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export const RUNTIME_MODE_FILE = "runtime-mode.json";
const format = "quicker-agent-runtime-mode";

export function normalizeRuntimeMode(value = "static") {
  if (value !== "static" && value !== "legacy-next") {
    throw new Error(`Unknown Agent runtime mode ${JSON.stringify(value)}; use static or legacy-next`);
  }
  return value;
}

export function readRuntimeMode(appDirectory) {
  const file = resolve(appDirectory, RUNTIME_MODE_FILE);
  let marker;
  try { marker = JSON.parse(readFileSync(file, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return "static";
    throw new Error(`Invalid Agent runtime mode marker ${file}: ${error.message}`, { cause: error });
  }
  if (marker?.format !== format || marker.version !== 1 || typeof marker.mode !== "string") throw new Error(`Unsupported Agent runtime mode marker ${file}`);
  try { return normalizeRuntimeMode(marker.mode); }
  catch (error) { throw new Error(`Invalid Agent runtime mode marker ${file}: ${error.message}`, { cause: error }); }
}

/** The current shell's build policy is independent of old resource candidates. */
export function readShellRuntimeMode(shellDirectory) {
  const file = resolve(shellDirectory, "package.json");
  try {
    const pkg = JSON.parse(readFileSync(file, "utf8"));
    if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) throw new Error("Invalid shell package");
    return normalizeRuntimeMode(pkg.quickerAgentRuntimeMode);
  } catch (error) { throw new Error(`Invalid Agent shell runtime mode in ${file}: ${error.message}`, { cause: error }); }
}

/** Stamp both build modes so overlay leftovers cannot select an older runtime. */
export function writeRuntimeMode(appDirectory, mode) {
  const marker = { format, version: 1, mode: normalizeRuntimeMode(mode) };
  const file = join(appDirectory, RUNTIME_MODE_FILE), temporary = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(marker, null, 2)}\n`, { flag: "wx" });
    renameSync(temporary, file);
  } finally { rmSync(temporary, { force: true }); }
}
