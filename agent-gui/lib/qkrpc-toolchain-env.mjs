import { existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import {
  listBundledQkrpcSourceDirs,
  resolveQkrpcBin,
  resolveUserInstalledQkrpcExe,
} from "./qkrpc-bin.mjs";
import { isQuickerRpcMonorepoRoot } from "./repo-paths.mjs";
import { listRgPathDirs, resolveRgBin } from "./rg-bin.mjs";

const PATH_SEP = process.platform === "win32" ? ";" : ":";

function normalizeDir(dir) {
  return normalize(dir);
}

function pathContainsDir(pathValue, dir) {
  if (!pathValue?.trim()) return false;
  const target = normalizeDir(dir).toLowerCase();
  return pathValue.split(PATH_SEP).some((segment) => {
    const trimmed = segment.trim();
    if (!trimmed) return false;
    return normalizeDir(trimmed).toLowerCase() === target;
  });
}

function getPathValue(env) {
  return env.PATH ?? env.Path ?? "";
}

function setPathValue(env, value) {
  env.PATH = value;
  if (process.platform === "win32") {
    env.Path = value;
  }
}

/** Directories that should precede PATH so `qkrpc` resolves in agent shells. */
export function listQkrpcPathDirs(agentGuiRoot) {
  /** @type {string[]} */
  const dirs = [];
  const push = (dir) => {
    if (!dir || !existsSync(dir)) return;
    const key = normalizeDir(dir).toLowerCase();
    if (dirs.some((existing) => normalizeDir(existing).toLowerCase() === key)) {
      return;
    }
    dirs.push(dir);
  };

  const resolved = resolveQkrpcBin(agentGuiRoot);
  if (resolved) push(dirname(resolved));

  const userExe = resolveUserInstalledQkrpcExe();
  if (userExe) push(dirname(userExe));

  for (const dir of listBundledQkrpcSourceDirs(agentGuiRoot)) {
    push(dir);
  }

  const repoRoot = join(agentGuiRoot, "..");
  if (isQuickerRpcMonorepoRoot(repoRoot)) {
    push(join(repoRoot, "publish", "cli"));
  }

  return dirs;
}

/** Directories that should precede PATH so shell tools (`qkrpc`, `rg`) resolve in agent shells. */
export function listShellToolPathDirs(agentGuiRoot) {
  return [...listQkrpcPathDirs(agentGuiRoot), ...listRgPathDirs(agentGuiRoot)];
}

export function prependPathDirs(pathValue, dirs) {
  /** @type {string[]} */
  const toAdd = [];
  for (const dir of dirs) {
    if (pathContainsDir(pathValue, dir)) continue;
    const key = normalizeDir(dir).toLowerCase();
    if (toAdd.some((existing) => normalizeDir(existing).toLowerCase() === key)) {
      continue;
    }
    toAdd.push(dir);
  }
  if (toAdd.length === 0) {
    return pathValue ?? "";
  }
  const prefix = toAdd.join(PATH_SEP);
  return pathValue?.trim() ? `${prefix}${PATH_SEP}${pathValue}` : prefix;
}

/**
 * Merge qkrpc toolchain dirs into a child-process environment (shell_exec, dev boot).
 * @param {NodeJS.ProcessEnv} env
 * @param {{ agentGuiRoot?: string, cwd?: string, repoRoot?: string }} [options]
 */
export function applyQkrpcToolchainEnv(env, options = {}) {
  const agentGuiRoot = options.agentGuiRoot ?? process.cwd();
  const next = { ...env };
  const pathDirs = listShellToolPathDirs(agentGuiRoot);
  setPathValue(next, prependPathDirs(getPathValue(next), pathDirs));

  const bin = resolveQkrpcBin(agentGuiRoot);
  if (bin && !next.QKRPC_BIN?.trim()) {
    next.QKRPC_BIN = bin;
  }

  const rgBin = resolveRgBin(agentGuiRoot);
  if (rgBin && !next.RG_BIN?.trim()) {
    next.RG_BIN = rgBin;
  }

  const cwd = options.cwd?.trim();
  if (cwd && !next.QKRPC_CWD?.trim()) {
    next.QKRPC_CWD = cwd;
  }

  const repoRoot = options.repoRoot?.trim();
  if (repoRoot) {
    if (!next.QKRPC_REPO_ROOT?.trim()) next.QKRPC_REPO_ROOT = repoRoot;
    if (!next.QKRPC_WORKSPACE_ROOT?.trim()) next.QKRPC_WORKSPACE_ROOT = repoRoot;
  }

  return next;
}
