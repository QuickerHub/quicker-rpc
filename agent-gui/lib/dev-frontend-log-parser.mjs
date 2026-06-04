import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** @param {string} agentGuiRoot */
export function ensureLocalDir(agentGuiRoot) {
  const dir = join(agentGuiRoot, ".local");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** @param {string} chunk */
export function parseNextDevLogChunk(chunk) {
  const text = chunk.replace(/\u001b\[[0-9;]*m/g, "");
  /** @type {Array<{ kind: string, message: string, at: string }>} */
  const issues = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const at = new Date().toISOString();

  for (const line of lines) {
    if (
      line.startsWith("⨯")
      || line.includes("Module build failed")
      || line.includes("Failed to compile")
      || line.includes("Syntax Error")
      || line.includes("UnhandledSchemeError")
      || line.includes("Maximum update depth exceeded")
      || line.includes("Build Error")
    ) {
      issues.push({
        kind: "compile",
        message: line.replace(/^⨯\s*/, ""),
        at,
      });
    }
  }

  return issues;
}

/**
 * @param {string} agentGuiRoot
 * @param {string} chunk
 */
export function appendNextDevLogChunk(agentGuiRoot, chunk) {
  const localDir = ensureLocalDir(agentGuiRoot);
  const path = join(localDir, "frontend-build-error.json");
  const incoming = parseNextDevLogChunk(chunk);
  if (incoming.length === 0) return;

  /** @type {{ excerpt?: string, issues?: unknown[] }} */
  let prev = {};
  if (existsSync(path)) {
    try {
      prev = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      prev = {};
    }
  }

  const excerpt = `${prev.excerpt ?? ""}${chunk}`.slice(-12000);
  const merged = [...(Array.isArray(prev.issues) ? prev.issues : []), ...incoming].slice(-40);

  writeFileSync(
    path,
    `${JSON.stringify({
      capturedAt: new Date().toISOString(),
      excerpt,
      issues: merged,
    }, null, 2)}\n`,
    "utf8",
  );
}

/** @param {string} agentGuiRoot @param {{ url: string, port: number, host: string }} info */
export function writeDevServerInfo(agentGuiRoot, info) {
  ensureLocalDir(agentGuiRoot);
  writeFileSync(
    join(agentGuiRoot, ".local", "dev-server.json"),
    `${JSON.stringify({
      ...info,
      startedAt: new Date().toISOString(),
    }, null, 2)}\n`,
    "utf8",
  );
}

/** Clear build error snapshot after a clean compile line. */
export function clearBuildErrorOnCompiled(agentGuiRoot, chunk) {
  if (!chunk.includes("✓ Compiled")) return;
  const path = join(ensureLocalDir(agentGuiRoot), "frontend-build-error.json");
  writeFileSync(
    path,
    `${JSON.stringify({
      capturedAt: new Date().toISOString(),
      excerpt: "",
      issues: [],
    }, null, 2)}\n`,
    "utf8",
  );
}

/** @param {string} agentGuiRoot @param {import('node:child_process').ChildProcess} child */
export function wireNextDevOutput(agentGuiRoot, child) {
  child.stdout?.on("data", (chunk) => {
    const text = chunk.toString();
    process.stdout.write(chunk);
    appendNextDevLogChunk(agentGuiRoot, text);
    clearBuildErrorOnCompiled(agentGuiRoot, text);
  });
  child.stderr?.on("data", (chunk) => {
    const text = chunk.toString();
    process.stderr.write(chunk);
    appendNextDevLogChunk(agentGuiRoot, text);
    clearBuildErrorOnCompiled(agentGuiRoot, text);
  });
}
