import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";

/** Product or legacy monorepo version.json path. */
export function resolveQuickerRpcVersionJsonPath(dir: string): string | null {
  const product = join(dir, "QuickerRpc", "version.json");
  if (existsSync(product)) return product;
  const legacy = join(dir, "version.json");
  if (existsSync(legacy)) return legacy;
  return null;
}

/** Directory containing quicker-rpc monorepo markers (version.json + agent-gui/publish). */
export function isQuickerRpcRepoRoot(dir: string): boolean {
  if (!resolveQuickerRpcVersionJsonPath(dir)) return false;
  // Tauri / standalone bundle also copies version.json next to server.js — not the monorepo root.
  if (existsSync(join(dir, "server.js"))) return false;
  return existsSync(join(dir, "agent-gui")) || existsSync(join(dir, "publish"));
}

/** quicker-rpc monorepo root, or null when running from an install bundle only. */
export function resolveQuickerRpcRepoRoot(): string | null {
  const fromEnv = process.env.QKRPC_REPO_ROOT?.trim();
  if (fromEnv && isQuickerRpcRepoRoot(fromEnv)) {
    return fromEnv;
  }

  let dir = process.cwd();
  if (basename(dir) === "agent-gui") {
    dir = join(dir, "..");
  }
  if (isQuickerRpcRepoRoot(dir)) {
    return dir;
  }

  const parent = join(dir, "..");
  if (isQuickerRpcRepoRoot(parent)) {
    return parent;
  }

  return null;
}

/**
 * Root for repo-scoped assets (e.g. authoring docs in dev).
 * Falls back to agent-gui / bundle runtime when not in a checkout.
 */
export function resolveRepoRoot(): string {
  return resolveQuickerRpcRepoRoot() ?? resolveAgentGuiRoot();
}

export function resolveQuickerRpcVersionStringFromJson(json: unknown): string {
  if (!json || typeof json !== "object") {
    throw new Error("version.json missing 'QuickerRpc' or 'release'+'build'");
  }

  const record = json as { QuickerRpc?: unknown; release?: unknown; build?: unknown };
  const legacy = typeof record.QuickerRpc === "string" ? record.QuickerRpc.trim() : "";
  if (legacy) {
    return legacy;
  }

  const release = typeof record.release === "string" ? record.release.trim() : "";
  if (!release) {
    throw new Error("version.json missing 'QuickerRpc' or 'release'+'build'");
  }

  const build = record.build == null ? 0 : Number(record.build);
  return `${release}.${Number.isFinite(build) ? build : 0}`;
}

export function readQuickerRpcSemverFromJson(json: unknown): string {
  const full = resolveQuickerRpcVersionStringFromJson(json);
  const parts = full.replace(/^v/i, "").split(".");
  if (parts.length < 3) {
    throw new Error(`version must have at least three segments: ${full}`);
  }
  return parts.slice(0, 3).join(".");
}

export function readQuickerRpcSemverFromRepo(dir: string): string | null {
  const versionPath = resolveQuickerRpcVersionJsonPath(dir);
  if (!versionPath) return null;
  try {
    const data = JSON.parse(readFileSync(versionPath, "utf8"));
    return readQuickerRpcSemverFromJson(data);
  } catch {
    return null;
  }
}
