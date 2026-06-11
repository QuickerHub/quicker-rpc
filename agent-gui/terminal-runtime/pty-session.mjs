import { existsSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { createRequire } from "node:module";
import { applyQkrpcToolchainEnv } from "../lib/qkrpc-toolchain-env.mjs";
import {
  resolveInteractiveShellExecutable,
  shellArgsForExecutable,
} from "./resolve-shell.mjs";

const require = createRequire(import.meta.url);

/** @type {import("node-pty") | null} */
let cachedPtyModule = null;

/** @returns {import("node-pty")} */
function loadPtyModule() {
  if (cachedPtyModule) return cachedPtyModule;
  try {
    cachedPtyModule = require("node-pty");
    return cachedPtyModule;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`node-pty is not available: ${message}`);
  }
}

/** Preload node-pty + shell path while runtime is idle. */
export function warmupPtyStack() {
  try {
    loadPtyModule();
  } catch {
    // surfaced on first create
  }
  try {
    resolveInteractiveShellExecutable();
  } catch {
    // surfaced on first create
  }
}

/**
 * @param {string | undefined} cwd
 * @param {string} agentGuiRoot
 */
export function resolveTerminalCwd(cwd, agentGuiRoot) {
  const trimmed = cwd?.trim();
  if (trimmed) {
    const absolute = isAbsolute(trimmed) ? resolve(trimmed) : resolve(agentGuiRoot, trimmed);
    if (!existsSync(absolute)) {
      throw new Error(`cwd not found: ${trimmed}`);
    }
    return absolute;
  }
  if (existsSync(agentGuiRoot)) return resolve(agentGuiRoot);
  return process.cwd();
}

/** @type {Map<string, NodeJS.ProcessEnv>} */
const envCache = new Map();

/**
 * @param {string} agentGuiRoot
 * @param {string} cwd
 * @param {string | undefined} repoRoot
 */
function buildChildEnv(agentGuiRoot, cwd, repoRoot) {
  const key = `${agentGuiRoot}\0${cwd}\0${repoRoot ?? ""}`;
  let base = envCache.get(key);
  if (!base) {
    base = applyQkrpcToolchainEnv(
      { ...process.env },
      { agentGuiRoot, cwd, repoRoot },
    );
    envCache.set(key, base);
  }
  const env = { ...base };
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  return env;
}

/**
 * @param {{
 *   cwd?: string;
 *   cols?: number;
 *   rows?: number;
 *   agentGuiRoot: string;
 *   repoRoot?: string;
 * }} options
 */
export function createPtySession(options) {
  const pty = loadPtyModule();
  const shell = resolveInteractiveShellExecutable();
  const cwd = resolveTerminalCwd(options.cwd, options.agentGuiRoot);
  const cols = Math.max(20, Math.min(400, Number(options.cols) || 80));
  const rows = Math.max(5, Math.min(200, Number(rows) || 24));
  const env = buildChildEnv(options.agentGuiRoot, cwd, options.repoRoot);

  const proc = pty.spawn(shell, shellArgsForExecutable(shell), {
    name: "xterm-256color",
    cols,
    rows,
    cwd,
    env,
    // Windows: skip conhost animation / extra init when supported by node-pty.
    useConpty: process.platform === "win32",
  });

  return {
    id: proc.pid ? String(proc.pid) : `pty-${Date.now()}`,
    shell: basename(shell),
    cwd,
    proc,
  };
}
